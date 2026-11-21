/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : notifications/booking-change
 * Scope        : Notifications — the salon's changes to a booking
 *                (multi-branch R7.2, customer-flows.md)
 *
 * Description  : Tells the customer when the salon confirms, rejects,
 *                cancels or moves their booking: an in-app/push notification
 *                and an email naming the branch, with its address, phone,
 *                directions and a link to the booking.
 *
 * Responsibilities :
 * - notifyBookingChange({ type, booking, reason? })
 *
 * Features / Functionality :
 * - A confirmation, rejection or cancellation is sent once per booking (a
 *   retried request finds the earlier notification); every move is sent
 * - The branch's details come from the branch row, never from the request
 *
 * Tech Stack   : TypeScript
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/business, @rgss/db/queries, @rgss/logger,
 *                ./dispatch, ./html, ./providers/email
 *
 * Notes        : Best-effort and NEVER throws: called after the booking write
 *                commits, so a provider or read failure is logged and the
 *                caller's response is unchanged.
 ************************************************************/

import {
  branchAddressLines,
  buildNotificationContent,
  formatCalendarDateIN,
  telHref,
} from '@rgss/business'
import {
  createNotification,
  getBranchById,
  getUserContact,
  hasNotification,
} from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { dispatchNotification } from './dispatch'
import { escapeHtml, httpsUrlOrNull } from './html'
import { sendEmail } from './providers/email'

const logger = createLogger({
  service: 'admin:notifications:booking-change',
  environment: process.env.NODE_ENV ?? 'development',
})

// The customer site, where the booking page lives.
const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'https://theroyalglow.in'

export type BookingChangeType =
  | 'booking_confirmed'
  | 'booking_rejected'
  | 'booking_cancelled'
  | 'booking_rescheduled'

/** The booking as it is after the change. */
export type ChangedBooking = {
  id: string
  customerId: string
  branchId: string
  bookingDate: Date
  /** 'HH:MM' or 'HH:MM:SS', IST wall clock. */
  startTime: string
}

// Sent once per booking; a move can happen more than once.
const ONCE: ReadonlySet<BookingChangeType> = new Set([
  'booking_confirmed',
  'booking_rejected',
  'booking_cancelled',
])

type BranchRow = NonNullable<Awaited<ReturnType<typeof getBranchById>>>

/** The email: the message, the branch's details and a link to the booking. */
export function bookingChangeEmailHtml(params: {
  title: string
  body: string
  branch: Pick<
    BranchRow,
    'name' | 'addressLine1' | 'addressLine2' | 'city' | 'state' | 'pincode' | 'phone'
  > & { googleMapsUrl: string | null }
  bookingUrl: string
}): string {
  const { branch } = params
  const lines = branchAddressLines(branch)
    .map((line) => `<br>${escapeHtml(line)}`)
    .join('')
  const tel = telHref(branch.phone)
  const phone = tel
    ? `<p style="margin:8px 0 0;font-size:14px"><a href="${escapeHtml(tel)}" style="color:#8a6a2f">${escapeHtml(branch.phone)}</a></p>`
    : ''
  const maps = httpsUrlOrNull(branch.googleMapsUrl)
  const directions = maps
    ? `<p style="margin:4px 0 0;font-size:14px"><a href="${escapeHtml(maps)}" style="color:#8a6a2f">Get directions</a></p>`
    : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#faf7f2;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#ffffff;border:1px solid #ece7df;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 12px;color:#1a0f0a;font-size:20px">${escapeHtml(params.title)}</h1>
      <p style="margin:0 0 16px;color:#5b5249;font-size:15px;line-height:1.55">${escapeHtml(params.body)}</p>
      <div style="padding:12px 16px;background:#faf7f2;border-radius:8px">
        <p style="margin:0;color:#1a0f0a;font-size:14px;line-height:1.55"><strong>Royal Glow ${escapeHtml(branch.name)}</strong>${lines}</p>
        ${phone}${directions}
      </div>
      <p style="margin:20px 0 0;font-size:14px"><a href="${escapeHtml(params.bookingUrl)}" style="color:#8a6a2f">View your booking</a></p>
    </div>
  </div>
</body></html>`
}

/**
 * Tell the customer about the salon's change to their booking. Never throws.
 * Returns whether a notification was sent (false when it was sent before, or
 * nothing could be sent).
 */
export async function notifyBookingChange(params: {
  type: BookingChangeType
  booking: ChangedBooking
  /** Shown to the customer: why it was rejected or cancelled. */
  reason?: string | null
}): Promise<boolean> {
  const { type, booking } = params
  try {
    if (ONCE.has(type) && (await hasNotification(booking.customerId, type, booking.id))) {
      return false
    }
    const branch = await getBranchById(booking.branchId)
    const data: Record<string, string> = {
      date: formatCalendarDateIN(booking.bookingDate.toISOString().slice(0, 10)),
      time: booking.startTime.slice(0, 5),
    }
    if (branch) {
      data.branchName = branch.name
    }
    if (params.reason?.trim()) {
      data.reason = params.reason.trim()
    }
    const { title, body } = buildNotificationContent(type, data)

    const created = await createNotification({
      userId: booking.customerId,
      type,
      title,
      body,
      channel: 'push',
      bookingId: booking.id,
    })
    await dispatchNotification({
      id: created.id,
      userId: booking.customerId,
      type,
      channel: created.channel,
      title,
      body,
    })

    // The email carries the branch's details: it is what a customer keeps.
    const contact = await getUserContact(booking.customerId)
    if (contact?.email && branch) {
      await sendEmail({
        to: contact.email,
        subject: title,
        html: bookingChangeEmailHtml({
          title,
          body,
          branch,
          bookingUrl: `${WEB_ORIGIN}/bookings/${encodeURIComponent(booking.id)}`,
        }),
      })
    }
    return true
  } catch (error) {
    logger.error('[booking-change] notification failed', {
      type,
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
