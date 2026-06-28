/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/session-cleanup
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (2:30 AM IST Sunday) that deletes expired
 *                Better Auth session rows.
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Delete sessions whose expires_at has passed (idempotent)
 * - Ping the SESSION_CLEANUP heartbeat on success
 *
 * Features / Functionality :
 * - Weekly cleanup of the Neon-backed session store
 * - DELETE of already-gone rows is a no-op on re-run
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @rgss/db/queries,
 *                @rgss/logger
 *
 * Notes        :
 * - MIGRATED FROM pg_cron (job_session_cleanup, 0 21 * * 0 UTC). pg_cron only
 *   runs while the Neon compute is awake, but the free-tier prod compute scales
 *   to zero after ~5 min idle, so the early-Sunday window would silently never
 *   fire. QStash POSTs this endpoint, which WAKES the compute, so the job runs
 *   reliably at ₹0.
 * - The DELETE is idempotent (already-deleted rows match nothing), so QStash
 *   at-least-once retries are safe to repeat.
 ************************************************************/

import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { jobSessionCleanup } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'web:jobs:session-cleanup',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await jobSessionCleanup()
    await pingHeartbeat('SESSION_CLEANUP')
    return Response.json({ success: true })
  } catch (error) {
    // Return 500 so QStash retries with backoff; the body is idempotent.
    logger.error('[job:session-cleanup] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
