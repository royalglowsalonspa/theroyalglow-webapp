/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/membership-auto-expire
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (12:00 AM IST daily) that flips active
 *                SPA memberships past their expiry to 'expired'.
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Run the status-guarded membership expiry UPDATE (idempotent)
 * - Ping the MEMBERSHIP_EXPIRE heartbeat on success
 *
 * Features / Functionality :
 * - Hard expiry enforcement (the notify-only alerts are a separate job)
 * - Status-guarded UPDATE keeps re-runs idempotent
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @rgss/db/queries,
 *                @rgss/logger
 *
 * Notes        :
 * - MIGRATED FROM pg_cron (job_membership_auto_expire, 30 18 * * * UTC).
 *   pg_cron only runs while the Neon compute is awake, but the free-tier prod
 *   compute scales to zero after ~5 min idle, so the midnight window would
 *   silently never fire. QStash POSTs this endpoint, which WAKES the compute,
 *   so the job runs reliably at ₹0.
 * - The query body is status-guarded (status = 'active'), so QStash
 *   at-least-once retries match zero rows on a re-run — safe to repeat.
 ************************************************************/

import { jobMembershipAutoExpire } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:membership-auto-expire',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await jobMembershipAutoExpire()
    await pingHeartbeat('MEMBERSHIP_EXPIRE')
    return Response.json({ success: true })
  } catch (error) {
    // Return 500 so QStash retries with backoff; the body is idempotent.
    logger.error('[job:membership-auto-expire] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
