import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getBookingForAdmin, updateBookingStatus } from '@rgss/db/queries'
import { conflict, ERROR_CODES, notFound } from '@rgss/errors'

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
