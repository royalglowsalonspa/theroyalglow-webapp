/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/stale-booking-alert
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-triggered job (enqueued +2h after booking creation) that
 *                alerts receptionists of stale pending bookings or auto-rejects after 24h.
 *
 * Responsibilities :
 * - Check if booking is still pending (skip if already actioned)
 * - Auto-reject bookings pending for 24+ hours with notification
 * - Alert receptionists for bookings pending 2h-24h
 *
 * Features / Functionality :
 * - Two-tier stale detection (2h alert vs 24h auto-reject)
 * - Customer notification on auto-rejection
 * - Multi-receptionist alert fan-out for review
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/notifications/dispatch,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - Auto-reject only fires while booking is still pending (idempotent).
 * - Rejected booking notifies the customer; stale alert notifies receptionists.
 ************************************************************/

import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { buildNotificationContent, formatDateIN } from '@rgss/business'
import {
  createNotification,
  getPendingBooking,
  getReceptionistUserIds,
  updateBookingStatus,
} from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

// Job 17 — Stale pending booking alert (QStash triggered, enqueued +2h by
// booking creation). If the booking is no longer pending → nothing to do. If it
// is still pending:
//   • older than 24h → auto-reject it (ONLY while still pending — Property 12 /
//     Requirement 6.2) and notify the customer (booking_rejected).
//   • otherwise (the +2h case, still pending) → alert every receptionist
//     (stale_pending_booking, one notification per receptionist).
//
// Route shape (NOT withErrorHandler): read raw body → verify QStash signature
// (401 on fail) → parse payload → DB work + guarded dispatch → heartbeat → 200.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:stale-booking-alert',
  environment: process.env.NODE_ENV ?? 'development',
})

const STALE_REJECT_MS = 24 * 60 * 60 * 1000

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

    let action: 'none' | 'rejected' | 'alerted' = 'none'
    let notified = 0

    if (bookingId) {
      const booking = await getPendingBooking(bookingId)

      // Only act while the booking is still pending; any other status is left
      // unchanged (Property 12).
      if (booking && booking.status === 'pending') {
        const ageMs = Date.now() - booking.createdAt.getTime()
        const bookingDateLabel = formatDateIN(booking.bookingDate)

        if (ageMs > STALE_REJECT_MS) {
          // Auto-reject the still-pending booking, then notify the customer.
          const rejectionReason = 'Auto-rejected: not confirmed within 24 hours'
          await updateBookingStatus(bookingId, 'rejected', {
            rejectionReason,
            rejectedAt: new Date(),
          })

          const { title, body } = buildNotificationContent('booking_rejected', {
            date: bookingDateLabel,
            reason: rejectionReason,
          })
          const notif = await createNotification({
            userId: booking.customerId,
            type: 'booking_rejected',
            title,
            body,
            channel: 'push',
            bookingId,
          })
          await dispatchNotification({
            id: notif.id,
            userId: booking.customerId,
            type: 'booking_rejected',
            channel: notif.channel,
            title,
            body,
          })
          notified = 1
          action = 'rejected'
        } else {
          // Still pending but younger than 24h → nudge the receptionists.
          const { title, body } = buildNotificationContent('stale_pending_booking', {
            date: bookingDateLabel,
          })
          const receptionistIds = await getReceptionistUserIds()
          for (const userId of receptionistIds) {
            const notif = await createNotification({
              userId,
              type: 'stale_pending_booking',
              title,
              body,
              channel: 'push',
              bookingId,
            })
            await dispatchNotification({
              id: notif.id,
              userId,
              type: 'stale_pending_booking',
              channel: notif.channel,
              title,
              body,
            })
          }
          notified = receptionistIds.length
          action = 'alerted'
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
