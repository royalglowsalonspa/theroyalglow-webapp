/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/appointment-reminders
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (every 15 min, 8am–10pm IST) that sends
 *                24h and 1h appointment reminders to customers with confirmed bookings.
 *
 * Responsibilities :
 * - Find confirmed bookings entering 24h or 1h reminder windows
 * - Send push and email reminders respecting customer preferences
 * - Maintain idempotency via notification deduplication rows
 *
 * Features / Functionality :
 * - Dual reminder windows (24h and 1h before appointment)
 * - Customer preference respect (appointmentRemindersEnabled)
 * - Idempotent across re-runs and QStash retries
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/notifications/dispatch,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - QStash signature verification required (401 on fail).
 * - Does NOT use withErrorHandler; 500 triggers QStash retry.
 ************************************************************/

import {
  buildNotificationContent,
  reminderDedupeKey,
  reminderWindowMatch,
  telHref,
} from '@rgss/business'
import {
  createNotificationOnce,
  getUpcomingConfirmedBookings,
  hasNotificationSince,
} from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { bookingEmailHtml } from '@/lib/notifications/booking-email'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { sendEmail } from '@/lib/notifications/providers/email'

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

const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'https://theroyalglow.in'

const logger = createLogger({
  service: 'admin:jobs:appointment-reminders',
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

      // Legacy reminders can suppress retries for this slot only.
      if (await hasNotificationSince(bk.customerId, type, bk.slotAcceptedAt, bk.id)) {
        continue
      }

      const { title, body } = buildNotificationContent(type, {
        time: bk.startTime.slice(0, 5),
        branchName: bk.branch.name,
      })
      const phone = telHref(bk.branch.phone) ? ` Call ${bk.branch.phone.trim()}.` : ''

      const created = await createNotificationOnce({
        id: reminderDedupeKey(bk.id, window, start, bk.slotAcceptedAt),
        userId: bk.customerId,
        type,
        title,
        body: `${body}${phone}`,
        bookingId: bk.id,
      })
      if (!created) {
        continue
      }

      await dispatchNotification({
        id: created.id,
        userId: created.userId,
        type: created.type,
        channel: created.channel,
        title: created.title,
        body: created.body,
      })

      if (bk.customerEmail) {
        await sendEmail({
          to: bk.customerEmail,
          subject: title,
          html: bookingEmailHtml({
            title,
            body,
            branch: bk.branch,
            bookingUrl: `${WEB_ORIGIN}/bookings/${encodeURIComponent(bk.id)}`,
          }),
        })
      }

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
