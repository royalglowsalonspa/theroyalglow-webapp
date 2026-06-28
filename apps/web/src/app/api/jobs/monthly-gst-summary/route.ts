/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/monthly-gst-summary
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (1:00 AM IST on the 1st) that aggregates
 *                the previous IST month's paid service + membership_purchase
 *                invoices into monthly_gst_summary.
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Run the monthly GST summary upsert (idempotent)
 * - Ping the MONTHLY_GST heartbeat on success
 *
 * Features / Functionality :
 * - Previous-month taxable value + GST totals for filing (SAC 999721)
 * - INSERT ... ON CONFLICT (month) DO UPDATE keeps re-runs idempotent
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @rgss/db/queries,
 *                @rgss/logger
 *
 * Notes        :
 * - MIGRATED FROM pg_cron (job_monthly_gst_summary, 30 19 1 * * UTC). pg_cron
 *   only runs while the Neon compute is awake, but the free-tier prod compute
 *   scales to zero after ~5 min idle, so the 1st-of-month window would silently
 *   never fire. QStash POSTs this endpoint, which WAKES the compute, so the job
 *   runs reliably at ₹0.
 * - The query body is idempotent (ON CONFLICT DO UPDATE), so QStash
 *   at-least-once retries are safe to re-run over the same data.
 ************************************************************/

import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { jobMonthlyGstSummary } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'web:jobs:monthly-gst-summary',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await jobMonthlyGstSummary()
    await pingHeartbeat('MONTHLY_GST')
    return Response.json({ success: true })
  } catch (error) {
    // Return 500 so QStash retries with backoff; the body is idempotent.
    logger.error('[job:monthly-gst-summary] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
