/************************************************************
 * Module Name  : realtime/revocation (admin)
 * Scope        : Realtime — revoke live-update tokens after a role change (R2.6)
 *
 * Description  : A role or branch change records a pending revocation for each
 *                person it signs out, in the same transaction. This asks Ably
 *                to revoke their tokens and records how each one ended:
 *                  - revoked:        Ably confirmed a revocation made after
 *                                    every token with the old access could
 *                                    have been issued;
 *                  - expired:        every such token has expired by now;
 *                  - not_configured: realtime is off, so none was issued.
 *                A failed call stays pending with its error; the
 *                realtime-revocations job retries it (QStash backs off).
 *
 * Why two calls : A TokenRequest the server signed just before the change can
 *                still be exchanged for a token for about 2 minutes (Ably's
 *                TokenRequest timestamp window). A revocation applies only to
 *                tokens issued before it, so the first call (straight after
 *                the change) cuts off live connections at once, and a second
 *                call after the window covers a token minted late from such a
 *                request. Only that second call resolves the row.
 *
 * Notes        : Tokens must come from an Ably key with "Revocable tokens"
 *                enabled (Ably limits those tokens to 1 hour; ours live 10
 *                minutes). Reads ABLY_PRIVATE_KEY directly so the app degrades
 *                without it. Never throws.
 ************************************************************/

import {
  getPendingRealtimeRevocations,
  type PendingRealtimeRevocation,
  recordRealtimeRevocationAttempt,
  resolveRealtimeRevocations,
} from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { enqueueJob } from '@/lib/jobs/enqueue'
import {
  type LiveUpdatesStatus,
  OLD_TOKENS_GONE_AFTER_MS,
  TOKEN_REQUEST_WINDOW_MS,
} from './token-lifetime'

export type { LiveUpdatesStatus }
export { OLD_TOKENS_GONE_AFTER_MS, TOKEN_REQUEST_WINDOW_MS }

const logger = createLogger({
  service: 'admin:realtime:revocation',
  environment: process.env.NODE_ENV ?? 'development',
})

const REVOKE_TIMEOUT_MS = 3000
// Ably accepts at most 100 target specifiers per revocation request.
const MAX_TARGETS = 100

export type RevocationStep = 'resolve_expired' | 'revoke_final' | 'revoke_early'

/**
 * What one pending revocation needs now. Pure.
 * - revoke_early:    inside the TokenRequest window; revoke, then again later
 * - revoke_final:    past the window; a successful revocation resolves it
 * - resolve_expired: every token with the old access has expired
 */
export function revocationStep(requestedAt: Date, now: Date): RevocationStep {
  const age = now.getTime() - requestedAt.getTime()
  if (age >= OLD_TOKENS_GONE_AFTER_MS) {
    return 'resolve_expired'
  }
  return age >= TOKEN_REQUEST_WINDOW_MS ? 'revoke_final' : 'revoke_early'
}

type AblyRevokeResult = { ok: true } | { ok: false; error: string }

// POST /keys/{keyName}/revokeTokens with clientId targets, Basic auth with the
// same key that issued the tokens. A partial result counts as a failure for
// the whole call; revoking someone twice is harmless.
async function revokeAtAbly(apiKey: string, userIds: readonly string[]): Promise<AblyRevokeResult> {
  const keyName = apiKey.split(':')[0] ?? ''
  try {
    const res = await fetch(
      `https://rest.ably.io/keys/${encodeURIComponent(keyName)}/revokeTokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(apiKey)}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ targets: userIds.map((id) => `clientId:${id}`) }),
        signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      },
    )
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      return { ok: false, error: `Ably ${res.status}: ${text.slice(0, 300)}` }
    }
    const failures = parseFailureCount(text)
    if (failures > 0) {
      return { ok: false, error: `Ably revoked only part of the batch: ${text.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function parseFailureCount(text: string): number {
  try {
    const body = JSON.parse(text) as { failureCount?: unknown }
    return typeof body.failureCount === 'number' ? body.failureCount : 0
  } catch {
    return 0
  }
}

export type RevocationRun = {
  /** Rows closed in this run. */
  resolved: number
  /** Rows still pending after it. */
  pending: number
  /** Rows whose call to Ably failed in this run. */
  failed: number
  /** The earliest time a pending row is worth looking at again, if any. */
  nextAt: Date | null
}

const EMPTY_RUN: RevocationRun = { resolved: 0, pending: 0, failed: 0, nextAt: null }

/**
 * Work through pending revocations: all of them, or only those of `userIds`.
 * Records every call and every outcome. Never throws.
 */
export async function processRealtimeRevocations(
  options: { userIds?: readonly string[]; now?: Date } = {},
): Promise<RevocationRun> {
  try {
    const now = options.now ?? new Date()
    const rows = await getPendingRealtimeRevocations({
      ...(options.userIds ? { userIds: options.userIds } : {}),
      limit: MAX_TARGETS,
    })
    if (rows.length === 0) {
      return EMPTY_RUN
    }

    const apiKey = process.env.ABLY_PRIVATE_KEY
    if (!apiKey) {
      // Realtime is off: no admin token was ever issued.
      const resolved = await resolveRealtimeRevocations(
        rows.map((r) => r.id),
        'not_configured',
        now,
      )
      return { ...EMPTY_RUN, resolved }
    }

    const expired = rows.filter((r) => revocationStep(r.requestedAt, now) === 'resolve_expired')
    const toRevoke = rows.filter((r) => revocationStep(r.requestedAt, now) !== 'resolve_expired')

    let resolved = await resolveRealtimeRevocations(
      expired.map((r) => r.id),
      'expired',
      now,
    )
    if (toRevoke.length === 0) {
      return { resolved, pending: 0, failed: 0, nextAt: null }
    }

    const userIds = [...new Set(toRevoke.map((r) => r.userId))]
    const result = await revokeAtAbly(apiKey, userIds)
    const ids = toRevoke.map((r) => r.id)
    await recordRealtimeRevocationAttempt(ids, result.ok ? null : result.error, now)

    if (!result.ok) {
      logger.error('realtime token revocation failed; will retry', {
        users: userIds.length,
        error: result.error,
      })
      return {
        resolved,
        pending: toRevoke.length,
        failed: toRevoke.length,
        nextAt: new Date(now.getTime() + 60_000),
      }
    }

    // A call inside the window cut off existing tokens; only one after it
    // resolves the row.
    const final = toRevoke.filter((r) => revocationStep(r.requestedAt, now) === 'revoke_final')
    resolved += await resolveRealtimeRevocations(
      final.map((r) => r.id),
      'revoked',
      now,
    )
    const early = toRevoke.filter((r) => revocationStep(r.requestedAt, now) === 'revoke_early')
    return {
      resolved,
      pending: early.length,
      failed: 0,
      nextAt: earliestWindowEnd(early),
    }
  } catch (error) {
    logger.error('processRealtimeRevocations failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { ...EMPTY_RUN, pending: 1, failed: 1, nextAt: null }
  }
}

function earliestWindowEnd(rows: readonly PendingRealtimeRevocation[]): Date | null {
  let earliest: number | null = null
  for (const row of rows) {
    const end = row.requestedAt.getTime() + TOKEN_REQUEST_WINDOW_MS
    earliest = earliest === null ? end : Math.min(earliest, end)
  }
  return earliest === null ? null : new Date(earliest)
}

/** Seconds until the job should look again, at least 5. */
function secondsUntil(at: Date | null, now: Date): number {
  if (!at) {
    return 60
  }
  return Math.max(5, Math.ceil((at.getTime() - now.getTime()) / 1000) + 5)
}

/**
 * Right after a role change commits: revoke the signed-out people's tokens now
 * and queue the follow-up that finishes the job. Never throws.
 * - stopped:        their live connections were cut off
 * - retrying:       Ably didn't confirm; the job keeps trying, and their tokens
 *                   expire within OLD_TOKENS_GONE_AFTER_MS regardless
 * - not_configured: realtime is off
 * - none:           nobody was signed out
 */
export async function revokeLiveUpdates(userIds: readonly string[]): Promise<LiveUpdatesStatus> {
  if (userIds.length === 0) {
    return 'none'
  }
  const now = new Date()
  const run = await processRealtimeRevocations({ userIds, now })
  if (run.pending > 0) {
    await enqueueJob('/api/jobs/realtime-revocations', {}, secondsUntil(run.nextAt, now))
  }
  if (!process.env.ABLY_PRIVATE_KEY) {
    return 'not_configured'
  }
  return run.failed > 0 ? 'retrying' : 'stopped'
}
