/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/monthly-gst-summary
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (01:00 IST on the 2nd) that rebuilds
 *                the previous IST month's monthly_gst_summary rows from the
 *                paid service + membership_purchase invoices.
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Rebuild the month's GST summary (idempotent)
 * - Ping the MONTHLY_GST heartbeat on success
 *
 * Features / Functionality :
 * - One row per branch, issuer GSTIN and SAC code (multi-branch R6.5), summed
 *   from the stored line amounts with the CGST/SGST split
 * - The month's rows are replaced in one transaction, so re-runs are idempotent
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
 * - The rebuild is idempotent (delete and re-insert the month's rows in one
 *   transaction), so QStash at-least-once retries are safe to re-run.
 ************************************************************/

import { jobMonthlyGstSummary } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:monthly-gst-summary',
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
