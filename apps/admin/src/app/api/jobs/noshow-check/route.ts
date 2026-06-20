/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/noshow-check
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-triggered job (enqueued +15min after booking end time)
 *                that alerts receptionists if a confirmed booking was never checked in.
 *
 * Responsibilities :
 * - Parse bookingId from QStash payload
 * - Check if booking is still in confirmed status post-appointment
 * - Alert all receptionists to review (never auto-marks no-show)
 *
 * Features / Functionality :
 * - Post-appointment confirmed-status detection
 * - Multi-receptionist notification fan-out
 * - Human-in-the-loop (alerts only, no auto-status change)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/notifications/dispatch,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - NEVER auto-marks no-show; a human receptionist decides.
 * - Ignores bookings already in completed/cancelled/no_show status.
 ************************************************************/

import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { buildNotificationContent, formatDateIN } from '@rgss/business'
import { createNotification, getBookingForNoShow, getReceptionistUserIds } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

// Job 18 — No-show check (QStash triggered, enqueued +15m after the booking's
// end time by booking confirmation). If the booking is STILL 'confirmed' past
// its end, alert the receptionists to review it — the job NEVER auto-marks the
// no-show (Requirement 6.3); a human decides. Any other status is left alone.
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
        const { title, body } = buildNotificationContent('no_show_check', {
          date: formatDateIN(booking.bookingDate),
        })
        const receptionistIds = await getReceptionistUserIds()
        for (const userId of receptionistIds) {
          const notif = await createNotification({
            userId,
            type: 'no_show_check',
            title,
            body,
            channel: 'push',
            bookingId,
          })
          await dispatchNotification({
            id: notif.id,
            userId,
            type: 'no_show_check',
            channel: notif.channel,
            title,
            body,
          })
        }
        notified = receptionistIds.length
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
