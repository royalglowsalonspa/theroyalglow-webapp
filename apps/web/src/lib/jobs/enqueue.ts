/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : enqueue
 * Scope        : Background Jobs
 *
 * Description  : QStash publish helper for triggered background jobs.
 *                Best-effort enqueue that never throws into the caller.
 *
 * Responsibilities :
 * - Schedule delayed job execution via QStash publishJSON
 * - No-op gracefully when QSTASH_TOKEN is not configured
 * - Log enqueue failures without affecting the calling transaction
 *
 * Features / Functionality :
 * - enqueueJob(path, body, delaySeconds) — best-effort QStash publish
 * - Lazy @upstash/qstash import (optional dependency)
 *
 * Tech Stack   : TypeScript, @upstash/qstash (optional)
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/logger, @upstash/qstash (optional)
 *
 * Notes        : Reads process.env directly for graceful degradation
 ************************************************************/

import { createLogger } from '@rgss/logger'

// QStash publish helper for the 4 triggered jobs (post-service, stale-pending,
// no-show, membership-expired). The originating business event calls this to
// schedule a delayed job run.
//
// The triggered job routes this enqueues (`/api/jobs/*`) now live ONLY in
// apps/admin, so the destination is built from the ADMIN origin. We read
// `QSTASH_TOKEN` / `NEXT_PUBLIC_ADMIN_URL` straight from `process.env` (NOT from
// `@/env`) so the app builds without them. `@upstash/qstash` is an optional,
// lazily imported dependency.
//
// No-op + log without config (Property 10) and NEVER throws — enqueuing is
// best-effort, so core transactional flows (booking complete/create, membership
// create) never gain a hard dependency on QStash being live.

const logger = createLogger({
  service: 'web:jobs:enqueue',
  environment: process.env.NODE_ENV ?? 'development',
})

// Minimal slice of the optional `@upstash/qstash` Client surface we rely on.
// Modeled locally so this file compiles without the package installed.
type QStashClient = {
  publishJSON(opts: {
    url: string
    body: unknown
    delay?: number
  }): Promise<unknown>
}

type QStashClientConstructor = new (opts: { token: string }) => QStashClient

function resolveClient(mod: unknown): QStashClientConstructor | null {
  if (typeof mod !== 'object' || mod === null) {
    return null
  }
  const candidate = mod as { Client?: unknown; default?: { Client?: unknown } }
  if (typeof candidate.Client === 'function') {
    return candidate.Client as QStashClientConstructor
  }
  if (candidate.default && typeof candidate.default.Client === 'function') {
    return candidate.default.Client as QStashClientConstructor
  }
  return null
}

export async function enqueueJob(path: string, body: unknown, delaySeconds: number): Promise<void> {
  const token = process.env.QSTASH_TOKEN

  // Not configured → no-op + log (Property 10).
  if (!token) {
    logger.info('enqueueJob skipped (QSTASH_TOKEN not configured)', {
      path,
      delaySeconds,
    })
    return
  }

  try {
    const mod: unknown = await import('@upstash/qstash' as string).catch(() => null)
    const Client = resolveClient(mod)
    if (!Client) {
      logger.error('@upstash/qstash module unavailable; cannot enqueue job', { path })
      return
    }

    const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? ''
    const client = new Client({ token })
    await client.publishJSON({
      url: `${adminUrl}${path}`,
      body,
      delay: delaySeconds,
    })
  } catch (error) {
    // Never throw — enqueuing is best-effort.
    logger.error('enqueueJob failed', {
      path,
      delaySeconds,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
