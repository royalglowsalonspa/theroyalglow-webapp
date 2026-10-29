/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/stale-booking-alert
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-triggered job (enqueued +2h after booking creation) that
 *                alerts the booking's branch when it is still pending.
 *
 * Responsibilities :
 * - Check if booking is still pending (skip if already actioned)
 * - Alert that branch's front desk to review it (multi-branch R7.4)
 *
 * Features / Functionality :
 * - Recipients: the branch's Receptionist, and its Manager or, without one,
 *   its Owner. Nobody at another branch; not the Developer.
 * - One notification per person per booking: retries tell only the people
 *   not yet told
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/branch-alerts, @/lib/jobs/heartbeat, @/lib/jobs/verify,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - The branch comes from the booking row, not the payload.
 * - Alert only. Closing a booking nobody actioned is owned by the scheduled
 *   pending-booking-closeout job (pending → no_show once the appointment has
 *   ended). The former ">24h → auto-reject" branch was removed: it could only
 *   run on a delayed retry (this job is enqueued once, at +2h) and it
 *   contradicted the end-of-day closeout rule.
 ************************************************************/

import { formatDateIN } from '@rgss/business'
import { getPendingBooking } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { alertBranchFrontDesk } from '@/lib/jobs/branch-alerts'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'

// Job 17 — Stale pending booking alert (QStash triggered, enqueued +2h by
// booking creation). If the booking is no longer pending → nothing to do. If it
// is still pending → alert its branch's front desk (stale_pending_booking).
//
// Route shape (NOT withErrorHandler): read raw body → verify QStash signature
// (401 on fail) → parse payload → DB read + guarded dispatch → heartbeat → 200.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:stale-booking-alert',
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

    let action: 'none' | 'alerted' = 'none'
    let notified = 0

    if (bookingId) {
      const booking = await getPendingBooking(bookingId)

      // Only act while the booking is still pending; any other status is left
      // unchanged (Property 12).
      if (booking && booking.status === 'pending') {
        const result = await alertBranchFrontDesk({
          branchId: booking.branchId,
          bookingId,
          type: 'stale_pending_booking',
          data: { date: formatDateIN(booking.bookingDate) },
        })
        notified = result.notified
        action = 'alerted'
        if (result.recipients === 0) {
          logger.warn('[job:stale-booking-alert] the branch has nobody to alert', {
            bookingId,
            branchId: booking.branchId,
          })
        }
      }
    }

    await pingHeartbeat('STALE_BOOKING_ALERT')
    return Response.json({ success: true, action, notified })
  } catch (error) {
    logger.error('[job:stale-booking-alert]', {
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
