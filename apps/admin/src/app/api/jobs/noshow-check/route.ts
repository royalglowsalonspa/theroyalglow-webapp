/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/noshow-check
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-triggered job (enqueued +15min after booking end time)
 *                that alerts the booking's branch if a confirmed booking was
 *                never checked in.
 *
 * Responsibilities :
 * - Parse bookingId from QStash payload
 * - Check if booking is still in confirmed status post-appointment
 * - Alert that branch's front desk to review (never auto-marks no-show)
 *
 * Features / Functionality :
 * - Post-appointment confirmed-status detection
 * - Recipients: the branch's Receptionist, and its Manager or, without one,
 *   its Owner (multi-branch R7.4)
 * - Human-in-the-loop (alerts only, no auto-status change)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/branch-alerts, @/lib/jobs/heartbeat, @/lib/jobs/verify,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - NEVER auto-marks no-show; a human decides.
 * - Ignores bookings already in completed/cancelled/no_show status.
 * - The branch comes from the booking row, not the payload. One notification
 *   per person per booking, so a retry tells only the people not yet told.
 ************************************************************/

import { formatDateIN } from '@rgss/business'
import { getBookingForNoShow } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { alertBranchFrontDesk } from '@/lib/jobs/branch-alerts'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'

// Job 18 — No-show check (QStash triggered, enqueued +15m after the booking's
// end time by booking confirmation). If the booking is STILL 'confirmed' past
// its end, alert its branch's front desk to review it — the job NEVER
// auto-marks the no-show (Requirement 6.3); a human decides. Any other status
// is left alone.
//
// Route shape (NOT withErrorHandler): read raw body → verify QStash signature
// (401 on fail) → parse payload → DB read + guarded dispatch → heartbeat → 200.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:noshow-check',
  environment: process.env.NODE_ENV ?? 'development',
})

type Payload = { bookingId?: unknown }

export const POST = async (req: Request) => {
  const bodyText = await req.text()

  const verified = await verifyQStashSignature(req, bodyText)
  if (!verified) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const payload = parseBody(bodyText)
    const bookingId = typeof payload.bookingId === 'string' ? payload.bookingId : null

    let notified = 0

    if (bookingId) {
      const booking = await getBookingForNoShow(bookingId)

      // Only alert when the appointment is still confirmed past its end — never
      // auto-mark the no-show.
      if (booking && booking.status === 'confirmed') {
        const result = await alertBranchFrontDesk({
          branchId: booking.branchId,
          bookingId,
          type: 'no_show_check',
          data: { date: formatDateIN(booking.bookingDate) },
        })
        notified = result.notified
        if (result.recipients === 0) {
          logger.warn('[job:noshow-check] the branch has nobody to alert', {
            bookingId,
            branchId: booking.branchId,
          })
        }
      }
    }

    await pingHeartbeat('NOSHOW_CHECK')
    return Response.json({ success: true, notified })
  } catch (error) {
    logger.error('[job:noshow-check]', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}

function parseBody(bodyText: string): Payload {
  try {
    return JSON.parse(bodyText) as Payload
  } catch {
    return {}
  }
}
