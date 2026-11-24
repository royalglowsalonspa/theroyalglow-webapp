/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/bookings/[id]/noshow
 * Scope        : API — Admin Booking
 *
 * Description  : Marks a confirmed booking as no-show. Only confirmed bookings
 *                can transition to no_show status.
 *
 * Responsibilities :
 * - Validate booking exists and is in confirmed state
 * - Transition booking status to no_show, with a status-log entry
 * - Give back any gems the booking was made with (multi-branch ST-03)
 * - Return updated booking data
 *
 * Features / Functionality :
 * - Status guard (only confirmed → no_show), re-checked in the write: a
 *   double submit or a concurrent change is a 409, never a second move
 * - No-show tier escalation handled by background job
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/branch-context,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role at the active branch: receptionist. The body names the
 *   branch the page was rendered for ({ branchId }).
 * - No-show count escalation is handled by the noshow-check background job.
 ************************************************************/

import { getBookingForAdmin, markBookingNoShow } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { bookingNoShowSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = bookingNoShowSchema.safeParse(body)
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

    // Only a confirmed booking can be marked no-show (after the appointment
    // window). No-show tier escalation is handled by a background job later.
    if (existing.status !== 'confirmed') {
      throw conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        `Only confirmed bookings can be marked as no-show (current status: "${existing.status}").`,
      )
    }

    const updated = await markBookingNoShow(id, branchId, ctx.session.user.id)
    if (!updated) {
      throw notFound('Booking not found.')
    }

    return apiSuccess({ booking: updated })
  },
)
