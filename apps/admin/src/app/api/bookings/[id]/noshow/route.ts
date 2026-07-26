/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
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
 * - Transition booking status to no_show
 * - Return updated booking data
 *
 * Features / Functionality :
 * - Status guard (only confirmed → no_show)
 * - Conflict error for invalid status transitions
 * - No-show tier escalation handled by background job
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries, @rgss/errors
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - No-show count escalation is handled by the noshow-check background job.
 ************************************************************/

import { getBookingForAdmin, updateBookingStatus } from '@rgss/db/queries'
import { conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

export const POST = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('receptionist')
    const { id } = await ctx.params

    const existing = await getBookingForAdmin(id)
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

    const updated = await updateBookingStatus(id, 'no_show')

    return apiSuccess({ booking: updated })
  },
)
