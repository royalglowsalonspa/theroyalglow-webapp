/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/nightly-sales-summary
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (11:30 PM IST daily) that aggregates the
 *                previous IST day's paid invoices + bookings into one
 *                daily_sales_summary row per branch.
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Run the nightly sales summary upsert (idempotent)
 * - Ping the SALES_SUMMARY heartbeat on success
 *
 * Features / Functionality :
 * - Per-branch revenue split + booking counters for the previous IST day
 * - INSERT ... ON CONFLICT DO UPDATE keeps re-runs idempotent
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @rgss/db/queries,
 *                @rgss/logger
 *
 * Notes        :
 * - MIGRATED FROM pg_cron (job_nightly_sales_summary, 0 18 * * * UTC). pg_cron
 *   only runs while the Neon compute is awake, but the free-tier prod compute
 *   scales to zero after ~5 min idle, so the late-night window would silently
 *   never fire. QStash POSTs this endpoint, which WAKES the compute, so the job
 *   runs reliably at ₹0.
 * - The query body is idempotent (ON CONFLICT DO UPDATE), so QStash
 *   at-least-once retries are safe to re-run over the same data.
 ************************************************************/

import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { jobNightlySalesSummary } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:nightly-sales-summary',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  // Verifying the signature consumes the body, so read it once and pass the raw
  // text through (this route has no JSON body to parse).
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await jobNightlySalesSummary()
    await pingHeartbeat('SALES_SUMMARY')
    return Response.json({ success: true })
  } catch (error) {
    // Return 500 so QStash retries with backoff; the body is idempotent.
    logger.error('[job:nightly-sales-summary] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
