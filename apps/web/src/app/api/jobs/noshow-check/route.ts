import {
  createNotification,
  getBookingForNoShow,
  getReceptionistUserIds,
} from '@rgss/db/queries'
import { buildNotificationContent, formatDateIN } from '@rgss/business'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { verifyQStashSignature } from '@/lib/jobs/verify'

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
  service: 'web:jobs:noshow-check',
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
    const bookingId =
      typeof payload.bookingId === 'string' ? payload.bookingId : null

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
