/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/bookings/[id]/cancel (admin)
 * Scope        : API — Admin Booking
 *
 * Description  : The salon cancels a pending or confirmed booking at the
 *                active branch, saying why (membership-scheduling.md
 *                slice 3): a day the branch closed, nobody free to do it, or
 *                the customer's call.
 *
 * Responsibilities :
 * - Validate the booking is at the active branch and pending or confirmed
 * - Cancel it with the reason and a status-log entry by the person acting,
 *   in one guarded write: gems it was booked with go back, and a membership
 *   session's held minutes are released by the database
 *
 * Features / Functionality :
 * - Never counted as the customer's late cancellation (the salon cancelled)
 * - A booking under way can't be cancelled: complete it instead
 * - A double submit or a concurrent change is a 409, never a second cancel
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @/lib/realtime/publish, @rgss/db/queries, @rgss/errors,
 *                @rgss/types
 *
 * Notes        :
 * - Receptionist or above at the active branch; the body names the branch
 *   the page was rendered for ({ branchId, reason }).
 * - The customer sees the booking cancelled with the reason; nothing is
 *   charged. Customer notifications for salon changes are not built yet.
 ************************************************************/

import { cancelBooking, getBookingForAdmin } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { adminBookingCancelSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { publishBookingEvent } from '@/lib/realtime/publish'

export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = adminBookingCancelSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)
    const branchId = ctx.branch.id

    // A booking at another branch is not found (R2.3).
    const existing = await getBookingForAdmin(id, branchId)
    if (!existing) {
      throw notFound('Booking not found.')
    }
    if (existing.status !== 'pending' && existing.status !== 'confirmed') {
      throw conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        existing.status === 'in_progress'
          ? 'This booking is under way, so it can’t be cancelled. Complete it instead.'
          : `Only a pending or confirmed booking can be cancelled (current status: "${existing.status}").`,
      )
    }

    // No lateness decision: the salon cancelled, so the customer's record
    // isn't marked.
    const updated = await cancelBooking(id, ctx.session.user.id, parsed.data.reason)
    if (!updated) {
      throw notFound('Booking not found.')
    }

    await publishBookingEvent({
      bookingId: id,
      branchId,
      customerId: existing.customerId,
      event: 'status_changed',
      data: { status: updated.status },
    })

    return apiSuccess({ booking: updated })
  },
)
