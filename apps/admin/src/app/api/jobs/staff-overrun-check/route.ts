/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/staff-overrun-check
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job, every 15 minutes in the day, that
 *                flags confirmed bookings held up because their person is
 *                still with another customer, and tells each one's branch
 *                (membership-scheduling.md slice 2b, MS-08).
 *
 * Responsibilities :
 * - Flag bookings due within 15 minutes whose person is expected to start
 *   them more than 10 minutes late, keeping the person assigned
 * - Tell the booking's branch front desk, naming who is free instead
 *
 * Features / Functionality :
 * - Recipients: the branch's Receptionist, and its Manager or, without one,
 *   its Owner (multi-branch R7.4)
 * - Idempotent: one open flag per booking, one notification per person per
 *   booking; a QStash retry or the next run tells only the people not told
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/staff-overrun,
 *                @/lib/jobs/verify, @rgss/logger
 *
 * Notes        :
 * - Alerts only. The database already refuses the held-up booking's start
 *   until the earlier work completes (0028), whatever reaches reception.
 *   Reception waits or assigns someone else; nothing moves on its own.
 * - The flag ends when the booking starts (0030), someone else is assigned,
 *   it is moved, or it ends.
 ************************************************************/

import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { raiseStaffOverruns } from '@/lib/jobs/staff-overrun'
import { verifyQStashSignature } from '@/lib/jobs/verify'

// Route shape (NOT withErrorHandler): read raw body → verify QStash signature
// (401 on fail) → flag + alert → heartbeat → 200; a failure → 500 for a retry.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:staff-overrun-check',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()

  const verified = await verifyQStashSignature(req, bodyText)
  if (!verified) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const run = await raiseStaffOverruns()
    await pingHeartbeat('STAFF_OVERRUN')
    return Response.json({ success: true, ...run })
  } catch (error) {
    logger.error('[job:staff-overrun-check]', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
