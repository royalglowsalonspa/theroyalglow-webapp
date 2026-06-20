/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : heartbeat
 * Scope        : Background Jobs
 *
 * Description  : BetterStack heartbeat ping helper. Each job pings its monitor
 *                URL on success so silent failures trip the monitor.
 *
 * Responsibilities :
 * - Ping BetterStack heartbeat URL on successful job completion
 * - No-op when heartbeat URL is not configured
 * - Never throw — heartbeat failure must not fail the calling job
 *
 * Features / Functionality :
 * - pingHeartbeat(name) — best-effort HTTP GET to monitor URL
 * - Dynamic URL resolution from BETTER_STACK_HEARTBEAT_{name} env var
 *
 * Tech Stack   : TypeScript
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/logger
 *
 * Notes        : Reads process.env directly for graceful degradation
 ************************************************************/

import { createLogger } from '@rgss/logger'

// BetterStack heartbeat ping. Each job pings its monitor URL on success so a
// silent failure (job never runs / always errors) trips the monitor.
//
// The URL is resolved from `process.env['BETTER_STACK_HEARTBEAT_' + name]`
// (e.g. name 'NIGHTLY_SALES' → BETTER_STACK_HEARTBEAT_NIGHTLY_SALES). We read
// `process.env` directly so the app builds without these (all optional).
//
// No-op without config (Property 10) and NEVER throws — a heartbeat failure
// must not fail the job that called it.

const logger = createLogger({
  service: 'admin:jobs:heartbeat',
  environment: process.env.NODE_ENV ?? 'development',
})

export async function pingHeartbeat(name: string): Promise<void> {
  const url = process.env[`BETTER_STACK_HEARTBEAT_${name}`]

  // Not configured → no-op (Property 10).
  if (!url) {
    logger.debug('pingHeartbeat skipped (no URL configured)', { name })
    return
  }

  try {
    await fetch(url).catch(() => {
      // Swallow network errors — heartbeat is best-effort.
    })
  } catch (error) {
    logger.warn('pingHeartbeat failed', {
      name,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
