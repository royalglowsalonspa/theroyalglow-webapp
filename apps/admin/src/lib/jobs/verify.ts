/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : verify
 * Scope        : Background Jobs
 *
 * Description  : QStash signature verification for public job routes.
 *                Security backbone ensuring only genuine QStash requests execute.
 *
 * Responsibilities :
 * - Verify QStash HMAC signatures on inbound job requests
 * - Fall back to internal token auth when QStash keys are absent
 * - Allow non-production bypass for local development
 * - Never throw — verification error fails closed (returns false)
 *
 * Features / Functionality :
 * - verifyQStashSignature(req, bodyText) — async boolean verification
 * - Multi-tier fallback: QStash → internal token → dev bypass
 *
 * Tech Stack   : TypeScript, @upstash/qstash (optional)
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/logger, @upstash/qstash (optional)
 *
 * Notes        : Consumes request body — routes must read body text first
 ************************************************************/

import { createLogger } from '@rgss/logger'

// QStash signature verification — the security backbone for the public job
// routes (Property 8). Because `/api/jobs/...` routes are publicly reachable,
// every one MUST reject requests that did not genuinely originate from QStash.
//
// We read the signing keys straight from `process.env` (NOT from `@/env`) so
// the app builds without them. `@upstash/qstash` is an optional, lazily
// imported dependency.
//
// NOTE: verifying the signature consumes the request body. Routes therefore
// read the raw body text themselves and pass it here, so the body is read
// exactly once and remains available to the route for JSON parsing.
//
// Fallback when signing keys are absent (no real QStash):
//   - If `INTERNAL_JOB_TOKEN` is set, allow ONLY when the request carries a
//     matching `x-internal-job-token` header.
//   - Otherwise, allow in non-production with a warning (so jobs can be invoked
//     locally), and reject in production.
//
// This helper NEVER throws (catch → false), so a verification error fails
// closed rather than crashing the route.

const logger = createLogger({
  service: 'admin:jobs:verify',
  environment: process.env.NODE_ENV ?? 'development',
})

// Minimal slice of the optional `@upstash/qstash` Receiver surface we rely on.
// Modeled locally so this file compiles without the package installed.
type QStashReceiver = {
  verify(opts: { signature: string; body: string }): Promise<boolean>
}

type QStashReceiverConstructor = new (opts: {
  currentSigningKey: string
  nextSigningKey: string
}) => QStashReceiver

function resolveReceiver(mod: unknown): QStashReceiverConstructor | null {
  if (typeof mod !== 'object' || mod === null) {
    return null
  }
  const candidate = mod as {
    Receiver?: unknown
    default?: { Receiver?: unknown }
  }
  if (typeof candidate.Receiver === 'function') {
    return candidate.Receiver as QStashReceiverConstructor
  }
  if (candidate.default && typeof candidate.default.Receiver === 'function') {
    return candidate.default.Receiver as QStashReceiverConstructor
  }
  return null
}

export async function verifyQStashSignature(req: Request, bodyText: string): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY

  // Real QStash verification path.
  if (currentSigningKey && nextSigningKey) {
    const signature = req.headers.get('upstash-signature')
    if (!signature) {
      logger.warn('QStash signature header missing')
      return false
    }
    try {
      const mod: unknown = await import('@upstash/qstash' as string).catch(() => null)
      const Receiver = resolveReceiver(mod)
      if (!Receiver) {
        logger.error('@upstash/qstash module unavailable; cannot verify signature')
        return false
      }
      const receiver = new Receiver({ currentSigningKey, nextSigningKey })
      return await receiver.verify({ signature, body: bodyText })
    } catch (error) {
      // Fail closed on any verification error.
      logger.warn('QStash signature verification failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  // Fallback: no signing keys configured.
  const internalToken = process.env.INTERNAL_JOB_TOKEN
  if (internalToken) {
    const provided = req.headers.get('x-internal-job-token')
    const ok = provided === internalToken
    if (!ok) {
      logger.warn('internal job token mismatch')
    }
    return ok
  }

  // No keys and no internal token: allow only outside production.
  if (process.env.NODE_ENV !== 'production') {
    logger.warn('QStash verification bypassed (no signing keys / internal token; non-production)')
    return true
  }

  logger.error('QStash verification rejected (no signing keys or internal token in production)')
  return false
}
