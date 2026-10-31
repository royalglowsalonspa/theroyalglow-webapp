/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/bookings/[id]/reschedule (admin)
 * Scope        : API — Admin Booking
 *
 * Description  : The salon moves a pending or confirmed booking at the active
 *                branch to another date and start time (membership-
 *                scheduling.md slice 3), such as off a day the branch closed.
 *
 * Responsibilities :
 * - Validate the booking is at the active branch and pending or confirmed
 * - Validate the new date against the branch's closures and the new time
 *   against its opening hours, as the counter books (no customer window or
 *   lead time), and that it is still to come
 * - Move it, keeping its services and length, with a status-log entry
 *
 * Features / Functionality :
 * - Its person stays when they can take the new time; otherwise the move
 *   goes ahead without them and the booking waits for someone else (leave,
 *   schedule or another booking), in the same transaction (MS-09)
 * - Doesn't count against the customer's reschedule limit
 * - A membership session can't move outside its membership's validity (409)
 * - A double submit or a concurrent change is a 409, never a second move
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @/lib/realtime/publish, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Receptionist or above at the active branch; the body names the branch
 *   the page was rendered for ({ branchId, bookingDate, startTime }).
 * - Answers `needsStaff` when the person was taken off it.
 ************************************************************/

import {
  addMinutesToTime,
  appointmentStartsAt,
  assertBranchOpenOn,
  assertSlotBookable,
  staffClosureHint,
} from '@rgss/business'
import {
  getBookingForAdmin,
  getBranchPolicy,
  getClosureOn,
  getOpenReassignmentsFor,
  rescheduleBooking,
} from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { adminBookingMoveSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { publishBookingEvent } from '@/lib/realtime/publish'

export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = adminBookingMoveSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)
    const branch = ctx.branch
    const { bookingDate, startTime } = parsed.data

    // A booking at another branch is not found (R2.3).
    const existing = await getBookingForAdmin(id, branch.id)
    if (!existing) {
      throw notFound('Booking not found.')
    }
    if (existing.status !== 'pending' && existing.status !== 'confirmed') {
      throw conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        existing.status === 'in_progress'
          ? 'This booking is under way, so it can’t be moved.'
          : `Only a pending or confirmed booking can be moved (current status: "${existing.status}").`,
      )
    }

    // The branch must be open that day (R1.8), and the time within its own
    // hours (R6.3), as the counter books: no customer lead time or window.
    const [closure, policy] = await Promise.all([
      getClosureOn(branch.id, bookingDate),
      getBranchPolicy(branch.id),
    ])
    assertBranchOpenOn(closure, branch.name, bookingDate, staffClosureHint(branch.role))
    if (!policy) {
      throw notFound('Branch not found.')
    }
    const durationMinutes = existing.totalDurationMinutes
    const now = new Date()
    assertSlotBookable(policy, {
      date: bookingDate,
      startTime,
      durationMinutes,
      now,
      actor: 'staff',
      branchName: branch.name,
    })
    // A booking moves to a time still to come: one already due is started or
    // marked missed instead.
    if (appointmentStartsAt(bookingDate, startTime).getTime() <= now.getTime()) {
      throw conflict(
        ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
        'That time has passed. Choose a later time.',
      )
    }

    const updated = await rescheduleBooking(id, ctx.session.user.id, {
      bookingDate: new Date(`${bookingDate}T00:00:00.000Z`),
      startTime,
      endTime: addMinutesToTime(startTime, durationMinutes),
      settingsRevision: policy.revision,
      countsTowardLimit: false,
    })
    if (!updated) {
      throw notFound('Booking not found.')
    }
    const work = (await getOpenReassignmentsFor([id])).get(id)

    await publishBookingEvent({
      bookingId: id,
      branchId: branch.id,
      customerId: existing.customerId,
      event: 'status_changed',
      data: { status: updated.status },
    })

    return apiSuccess({ booking: updated, needsStaff: work !== undefined && !work.heldUp })
  },
)
