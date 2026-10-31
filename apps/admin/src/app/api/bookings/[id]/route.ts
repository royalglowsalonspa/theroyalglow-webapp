/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|PATCH /api/bookings/[id]
 * Scope        : API — Admin Booking
 *
 * Description  : Admin booking detail and action endpoint. GET returns full
 *                booking info; PATCH handles approve, reject, and staff assign.
 *
 * Responsibilities :
 * - Return full booking detail for admin view (GET)
 * - Approve pending bookings with staff assignment (PATCH)
 * - Reject pending bookings with reason (PATCH)
 * - Reassign staff to booking services (PATCH)
 *
 * Features / Functionality :
 * - Booking approval with staff assignment
 * - Booking rejection with reason capture
 * - Staff reassignment independent of booking status
 * - Status transition guards (pending → confirmed/rejected)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role at the active branch: receptionist. A booking at
 *   another branch is not found; a write names the branch its page was
 *   rendered for (409 BRANCH_CONTEXT_CHANGED after a switch).
 * - Only staff who work at the branch can be assigned.
 * - Staff reassignment is allowed regardless of booking status.
 * - approve/reject delegate to approveBooking/rejectBooking, which persist a
 *   booking_status_log entry (prior → new status + acting user) atomically.
 ************************************************************/

import { assertBranchOpenOn } from '@rgss/business'
import {
  approveBooking,
  assignStaff,
  getBookingForAdmin,
  getClosureOn,
  isStaffAtBranch,
  rejectBooking,
} from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { adminBookingActionSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { publishBookingEvent } from '@/lib/realtime/publish'

export const GET = withErrorHandler(
  async (_req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    // A booking at another branch reads as not found (R2.3).
    const booking = await getBookingForAdmin(id, ctx.branch.id)
    if (!booking) {
      throw notFound('Booking not found.')
    }

    return apiSuccess({ booking })
  },
)

export const PATCH = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    // The acting user stamps every status log.
    const changedById = ctx.session.user.id
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = adminBookingActionSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)
    const branchId = ctx.branch.id

    const existing = await getBookingForAdmin(id, branchId)
    if (!existing) {
      throw notFound('Booking not found.')
    }

    const action = parsed.data

    // Only someone who works at this branch can be assigned to its bookings.
    if (
      (action.action === 'approve' || action.action === 'assign') &&
      !(await isStaffAtBranch(action.staffId, branchId))
    ) {
      throw badRequest(`That staff member doesn't work at ${ctx.branch.name}.`)
    }

    if (action.action === 'approve') {
      // pending → confirmed only (Req 11.1, 11.3). Guard the transition in the
      // route before the writer runs.
      if (existing.status !== 'pending') {
        throw conflict(
          ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
          `Only pending bookings can be approved (current status: "${existing.status}").`,
        )
      }
      // A booking made before its day was closed can't be confirmed for that
      // day: move or reject it instead (R1.8).
      const bookingDateISO = existing.bookingDate.toISOString().slice(0, 10)
      assertBranchOpenOn(
        await getClosureOn(branchId, bookingDateISO),
        ctx.branch.name,
        bookingDateISO,
        'Reschedule or reject the booking instead.',
      )

      // approveBooking atomically: status → confirmed (+ confirmedAt), assigns
      // staff to every service, and writes a status-log entry capturing the
      // prior → confirmed transition with the acting user (Req 11.1, 11.4).
      const updated = await approveBooking(id, branchId, changedById, action.staffId)

      // Best-effort realtime publish: approval is a status change AND a staff
      // assignment, so emit both verbs to the booking channel + per-branch admin
      // feed. publishBookingEvent no-ops without ABLY_PRIVATE_KEY and never
      // throws, so it can never break approval or change its response.
      await publishBookingEvent({
        bookingId: id,
        branchId: existing.branchId,
        customerId: existing.customerId,
        event: 'status_changed',
        data: { status: 'confirmed' },
      })
      await publishBookingEvent({
        bookingId: id,
        branchId: existing.branchId,
        customerId: existing.customerId,
        event: 'assigned',
        data: { staffId: action.staffId },
      })

      return apiSuccess({ booking: updated })
    }

    if (action.action === 'reject') {
      // pending → rejected only (Req 11.2, 11.3).
      if (existing.status !== 'pending') {
        throw conflict(
          ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
          `Only pending bookings can be rejected (current status: "${existing.status}").`,
        )
      }

      // rejectBooking atomically: status → rejected (+ rejectedAt), stores the
      // reason, and writes a status-log entry capturing the prior → rejected
      // transition with the acting user (Req 11.2, 11.4).
      const updated = await rejectBooking(id, branchId, changedById, action.rejectionReason)

      // Best-effort realtime publish: notify the booking channel + per-branch
      // admin feed of the status change. Never throws / no-ops without the key.
      await publishBookingEvent({
        bookingId: id,
        branchId: existing.branchId,
        customerId: existing.customerId,
        event: 'status_changed',
        data: { status: 'rejected' },
      })

      return apiSuccess({ booking: updated })
    }

    // assign: (re)assign staff to all services regardless of status — no status
    // change, so no status-log entry is written. Closes the booking's
    // reassignment work, if any (R1.7). The database refuses someone who has
    // left the branch or is on approved leave that day (409).
    const services = await assignStaff(id, branchId, action.staffId, changedById)

    // Best-effort realtime publish: announce the staff (re)assignment on the
    // booking channel + per-branch admin feed. Never throws / no-ops without key.
    await publishBookingEvent({
      bookingId: id,
      branchId: existing.branchId,
      customerId: existing.customerId,
      event: 'assigned',
      data: { staffId: action.staffId },
    })

    return apiSuccess({ bookingId: id, services })
  },
)
