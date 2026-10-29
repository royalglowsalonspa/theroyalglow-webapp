/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/pending-booking-closeout
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (10:00 PM IST daily, after the 21:00
 *                close) that closes out bookings the salon never actioned:
 *                every still-pending booking whose appointment has ended
 *                becomes 'no_show'.
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Run the status-guarded closeout UPDATE (idempotent)
 * - Publish a best-effort realtime status change per closed booking
 * - Ping the PENDING_CLOSEOUT heartbeat on success
 *
 * Features / Functionality :
 * - IST end-instant predicate: never closes an appointment still to come
 * - First run also sweeps the backlog from earlier days
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/realtime/publish,
 *                @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - Business rule: a booking not confirmed, rejected or cancelled by the end
 *   of its day is closed as 'no_show'. Only bookings already past their end
 *   time are touched; confirmed bookings stay with the receptionist
 *   (noshow-check alerts them, a human decides).
 * - Runs before daily-sales-report (22:30 IST) and nightly-sales-summary
 *   (23:30 IST), so both count the closed bookings under no-shows.
 * - Does not change customer_profile.noshow_count (see the query).
 * - Scheduled via JOB_SCHEDULES; QStash at-least-once retries are safe.
 ************************************************************/

import { closeLapsedPendingBookings } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { publishBookingEvent } from '@/lib/realtime/publish'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:pending-booking-closeout',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const closed = await closeLapsedPendingBookings()

    // Best-effort realtime nudge so open admin dashboards and the customer's
    // booking view refresh. publishBookingEvent never throws and no-ops without
    // ABLY_PRIVATE_KEY, so it cannot fail the job after the UPDATE committed.
    for (const row of closed) {
      await publishBookingEvent({
        bookingId: row.id,
        branchId: row.branchId,
        customerId: row.customerId,
        event: 'status_changed',
        data: { status: 'no_show' },
      })
    }

    logger.info('[job:pending-booking-closeout] closed lapsed pending bookings', {
      closedCount: closed.length,
      bookingNumbers: closed.map((row) => row.bookingNumber),
    })
    await pingHeartbeat('PENDING_CLOSEOUT')
    return Response.json({ success: true, closed: closed.length })
  } catch (error) {
    // Return 500 so QStash retries with backoff; the UPDATE is status-guarded.
    logger.error('[job:pending-booking-closeout] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
