/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/gems-auto-expire
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (12:10 AM IST daily) that expires earned
 *                loyalty gems past their 365-day window, offsetting each with a
 *                matching 'expired' transaction and decrementing the balance.
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Run the gems expiry offset + balance decrement (idempotent)
 * - Ping the GEMS_EXPIRE heartbeat on success
 *
 * Features / Functionality :
 * - One offsetting 'expired' transaction per expired earn, marked `expired:<id>`
 * - Per-account balance decrement equal to the expired total
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @rgss/db/queries,
 *                @rgss/logger
 *
 * Notes        :
 * - MIGRATED FROM pg_cron (job_gems_auto_expire, 40 18 * * * UTC). pg_cron only
 *   runs while the Neon compute is awake, but the free-tier prod compute scales
 *   to zero after ~5 min idle, so the midnight window would silently never
 *   fire. QStash POSTs this endpoint, which WAKES the compute, so the job runs
 *   reliably at ₹0.
 * - This touches money/balances. The query body preserves the `expired:<id>`
 *   idempotency marker (NOT EXISTS guard), so QStash at-least-once retries never
 *   double-offset a transaction or double-decrement a balance — safe to repeat.
 ************************************************************/

import { jobGemsAutoExpire } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:gems-auto-expire',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await jobGemsAutoExpire()
    await pingHeartbeat('GEMS_EXPIRE')
    return Response.json({ success: true })
  } catch (error) {
    // Return 500 so QStash retries with backoff; the body is idempotent.
    logger.error('[job:gems-auto-expire] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
