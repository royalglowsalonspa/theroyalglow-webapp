/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/customer-stats-reconcile
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (12:20 AM IST daily) that recomputes
 *                every customer's CRM KPIs (visits, LTV, first/last visit)
 *                from bookings and paid invoices.
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Run the set-based KPI recompute over all customer profiles
 * - Ping the CUSTOMER_STATS heartbeat on success
 *
 * Features / Functionality :
 * - Backfills profiles written before the KPIs were maintained
 * - Self-heals any drift between the KPIs and their source rows
 * - Writes only rows whose values changed
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @rgss/db/queries,
 *                @rgss/logger
 *
 * Notes        :
 * - Write paths (booking completion, membership purchase/session) already
 *   refresh the affected customer inside their own transaction; this job is
 *   the safety net and the backfill, not the primary maintainer.
 * - Recompute (not increment), so QStash at-least-once retries are safe.
 ************************************************************/

import { refreshCustomerStats } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:customer-stats-reconcile',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const changed = await refreshCustomerStats()
    // A non-zero count after the first (backfill) run means a write path
    // skipped its in-transaction refresh; worth a look, but not a failure.
    logger.info('[job:customer-stats-reconcile] customer KPIs reconciled', { changed })
    await pingHeartbeat('CUSTOMER_STATS')
    return Response.json({ success: true, changed })
  } catch (error) {
    // Return 500 so QStash retries with backoff; the recompute is idempotent.
    logger.error('[job:customer-stats-reconcile] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
