import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { buildNotificationContent, reminderWindowMatch } from '@rgss/business'
import { createNotification, getUpcomingConfirmedBookings, hasNotification } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

// Job 8 — Appointment Reminders (QStash scheduled, every 15 min 8am–10pm IST).
//
// Finds confirmed bookings entering the 24h or 1h reminder window and notifies
// the customer once per (booking, window). A `notification` log row makes this
// idempotent across re-runs and QStash retries (Property 6). Respects the
// customer's `appointmentRemindersEnabled` preference (Requirement 2.4).
//
// Job routes are thin orchestrators that verify the QStash signature, do their
// work, ping a heartbeat, and return a minimal JSON shape. They deliberately do
// NOT use withErrorHandler/apiSuccess (the customer/admin envelope) — a non-2xx
// response is what drives QStash's retry semantics.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'web:jobs:appointment-reminders',
  environment: process.env.NODE_ENV ?? 'development',
})

// bookingDate is a UTC-midnight Date representing the IST calendar day of the
// appointment; startTime is an 'HH:MM:SS' IST wall-clock value. Combine them
// into the real UTC start instant by formatting an IST (+05:30) ISO string, so
// the reminder window math is correct regardless of the server's timezone.
function bookingStartInstant(bookingDate: Date, startTime: string): Date {
  const year = bookingDate.getUTCFullYear()
  const month = String(bookingDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(bookingDate.getUTCDate()).padStart(2, '0')
  return new Date(`${year}-${month}-${day}T${startTime}+05:30`)
}

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const now = new Date()
    const bookings = await getUpcomingConfirmedBookings(now)
    let processed = 0

    for (const bk of bookings) {
      // Skip customers who have opted out of appointment reminders (a missing
      // profile reads as null → treated as opted-out).
      if (!bk.appointmentRemindersEnabled) {
        continue
      }

      const start = bookingStartInstant(bk.bookingDate, bk.startTime)
      const window = reminderWindowMatch(start, now)
      if (window === null) {
        continue
      }

      const type = window === '24h' ? 'reminder_24h' : 'reminder_1h'

      // Idempotency: a matching row for this booking + reminder type suppresses
      // any later re-send (Property 6).
      if (await hasNotification(bk.customerId, type, bk.id)) {
        continue
      }

      const { title, body } = buildNotificationContent(type, {
        time: bk.startTime.slice(0, 5),
      })

      const created = await createNotification({
        userId: bk.customerId,
        type,
        title,
        body,
        channel: 'push',
        bookingId: bk.id,
      })

      await dispatchNotification({
        id: created.id,
        userId: created.userId,
        type: created.type,
        channel: created.channel,
        title: created.title,
        body: created.body,
      })

      processed += 1
    }

    await pingHeartbeat('REMINDERS')
    return Response.json({ success: true, processed })
  } catch (error) {
    logger.error('[job:appointment-reminders] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
