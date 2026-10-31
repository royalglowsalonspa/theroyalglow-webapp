/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/bookings/[id]/reschedule
 * Scope        : API — Customer Booking
 *
 * Description  : Allows authenticated customers to move one of their own
 *                bookings to a new date and time slot, under the branch's
 *                current booking rules (R6.3).
 *
 * Responsibilities :
 * - Validate booking ownership and reschedule eligibility
 * - Validate the new date/slot against the branch's hours, lead time and
 *   booking window, and its holidays and closures
 * - Move the booking, recompute end time, increment reschedule count, log it
 *   with the settings revision that decided it
 *
 * Features / Functionality :
 * - Status guard (only pending/confirmed are reschedulable)
 * - Reschedules per booking (409 BOOKING_MAX_RESCHEDULES at the branch's limit)
 * - Reschedule cut-off before the appointment (409
 *   BOOKING_RESCHEDULE_WINDOW_PASSED; cancelling is still possible)
 * - Slot guard (409 BOOKING_SLOT_UNAVAILABLE, saying why)
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
 * - A branch without readable booking settings answers 409
 *   BRANCH_SETTINGS_INCOMPLETE.
 ************************************************************/

import {
  addMinutesToTime,
  appointmentStartsAt,
  assertBranchOpenOn,
  assertReschedulable,
  assertSlotBookable,
} from '@rgss/business'
import {
  getBookingByIdForCustomer,
  getBranchPolicy,
  getClosureOn,
  rescheduleBooking,
} from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { rescheduleBookingSchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { publishBookingEvent } from '@/lib/realtime/publish'

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

    // The branch's current rules decide whether it can still move: its status,
    // the reschedules it has had, and the cut-off before the appointment.
    const policy = await getBranchPolicy(existing.branchId)
    if (!policy) {
      throw notFound('Booking not found.')
    }
    const now = new Date()
    assertReschedulable({
      rules: policy.bookingRules,
      status: existing.status,
      rescheduleCount: existing.rescheduleCount,
      startsAt: appointmentStartsAt(
        existing.bookingDate.toISOString().slice(0, 10),
        existing.startTime,
      ),
      now,
    })

    const body = await req.json()
    const parsed = rescheduleBookingSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    const { bookingDate, startTime } = parsed.data

    // The branch must be open on the new date (R1.8, R5.7), and the new slot
    // within its hours, lead time and booking window. Duration is the
    // booking's frozen total.
    assertBranchOpenOn(
      await getClosureOn(existing.branchId, bookingDate),
      policy.branchName,
      bookingDate,
    )
    assertSlotBookable(policy, {
      date: bookingDate,
      startTime,
      durationMinutes: existing.totalDurationMinutes,
      now,
      actor: 'customer',
      branchName: policy.branchName,
    })

    const endTime = addMinutesToTime(startTime, existing.totalDurationMinutes)

    const updated = await rescheduleBooking(id, session.user.id, {
      bookingDate: new Date(`${bookingDate}T00:00:00.000Z`),
      startTime,
      endTime,
      settingsRevision: policy.revision,
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
