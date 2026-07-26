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
 * - Requires min role: receptionist.
 * - Staff reassignment is allowed regardless of booking status.
 * - approve/reject delegate to approveBooking/rejectBooking, which persist a
 *   booking_status_log entry (prior → new status + acting user) atomically.
 ************************************************************/

import { approveBooking, assignStaff, getBookingForAdmin, rejectBooking } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { adminBookingActionSchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { publishBookingEvent } from '@/lib/realtime/publish'

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('receptionist')
    const { id } = await ctx.params

    const booking = await getBookingForAdmin(id)
    if (!booking) {
      throw notFound('Booking not found.')
    }

    return apiSuccess({ booking })
  },
)

export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    // requireRole returns the session — the acting user stamps every status log.
    const session = await requireRole('receptionist')
    const changedById = session.user.id
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = adminBookingActionSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const existing = await getBookingForAdmin(id)
    if (!existing) {
      throw notFound('Booking not found.')
    }

    const action = parsed.data

    if (action.action === 'approve') {
      // pending → confirmed only (Req 11.1, 11.3). Guard the transition in the
      // route before the writer runs.
      if (existing.status !== 'pending') {
        throw conflict(
          ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
          `Only pending bookings can be approved (current status: "${existing.status}").`,
        )
      }

      // approveBooking atomically: status → confirmed (+ confirmedAt), assigns
      // staff to every service, and writes a status-log entry capturing the
      // prior → confirmed transition with the acting user (Req 11.1, 11.4).
      const updated = await approveBooking(id, changedById, action.staffId)

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
      const updated = await rejectBooking(id, changedById, action.rejectionReason)

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
    // change, so no status-log entry is written.
    const services = await assignStaff(id, action.staffId)

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
