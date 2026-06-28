/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/bookings/[id]/reschedule
 * Scope        : API — Customer Booking
 *
 * Description  : Allows authenticated customers to move one of their own
 *                bookings to a new date and time slot.
 *
 * Responsibilities :
 * - Validate booking ownership and reschedule eligibility
 * - Validate the new date/slot (future date, bookable slot, fits before close)
 * - Move the booking, recompute end time, increment reschedule count, log it
 *
 * Features / Functionality :
 * - Status guard (only pending/confirmed are reschedulable)
 * - Max-reschedules guard (409 BOOKING_MAX_RESCHEDULES after 2 moves)
 * - Slot guard (409 BOOKING_SLOT_UNAVAILABLE for invalid/past slots)
 * - End time recomputed from the booking's frozen total duration
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/business,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - The booking's lifecycle status is preserved; only the slot moves.
 * - Returns 409 for non-reschedulable status, max reschedules, or bad slot.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { publishBookingEvent } from '@/lib/realtime/publish'
import { addMinutesToTime, checkReschedulable, isBookableSlotStart } from '@rgss/business'
import { getBookingByIdForCustomer, rescheduleBooking } from '@rgss/db/queries'
import { ERROR_CODES, badRequest, conflict, notFound } from '@rgss/errors'
import { rescheduleBookingSchema } from '@rgss/types'

// Current calendar date in IST (UTC+5:30) as YYYY-MM-DD — matches /api/availability.
function todayInIST(): string {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return istNow.toISOString().slice(0, 10)
}

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireSession()
    const { id } = await ctx.params

    const existing = await getBookingByIdForCustomer(id, session.user.id)
    // Ownership is part of the query's WHERE clause, so a cross-customer lookup
    // is indistinguishable from a missing row — both map to 404 and never reveal
    // which booking ids exist.
    if (!existing) {
      throw notFound('Booking not found.')
    }

    // Eligibility: only pending/confirmed bookings, and only up to MAX_RESCHEDULES.
    const eligibility = checkReschedulable({
      status: existing.status,
      rescheduleCount: existing.rescheduleCount,
    })
    if (!eligibility.ok) {
      if (eligibility.code === 'MAX_RESCHEDULES') {
        throw conflict(ERROR_CODES.BOOKING_MAX_RESCHEDULES, eligibility.message)
      }
      throw conflict(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION, eligibility.message)
    }

    const body = await req.json()
    const parsed = rescheduleBookingSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    const { bookingDate, startTime } = parsed.data

    // New slot must not be in the past (IST wall clock).
    if (bookingDate < todayInIST()) {
      throw conflict(
        ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
        'Cannot reschedule to a date in the past.',
      )
    }

    // New start must align to the bookable slot grid and the full service
    // duration must finish before close. Duration is the booking's frozen total.
    if (!isBookableSlotStart(startTime, existing.totalDurationMinutes)) {
      throw conflict(
        ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
        'The selected time slot is not available.',
      )
    }

    const endTime = addMinutesToTime(startTime, existing.totalDurationMinutes)

    const updated = await rescheduleBooking(id, session.user.id, {
      bookingDate: new Date(`${bookingDate}T00:00:00.000Z`),
      startTime,
      endTime,
    })
    if (!updated) {
      throw notFound('Booking not found.')
    }

    // Best-effort realtime publish: notify the booking channel and the per-branch
    // admin feed of the reschedule (a status-relevant change). publishBookingEvent
    // no-ops without ABLY_PRIVATE_KEY and never throws, so it can never break the
    // reschedule flow or change its response. branchId comes from the owned row.
    await publishBookingEvent({
      bookingId: updated.id,
      branchId: existing.branchId,
      customerId: session.user.id,
      event: 'status_changed',
      data: { status: updated.status },
    })

    return apiSuccess({
      id: updated.id,
      status: updated.status,
      bookingDate: updated.bookingDate,
      startTime: updated.startTime,
      endTime: updated.endTime,
      rescheduleCount: updated.rescheduleCount,
    })
  },
)
