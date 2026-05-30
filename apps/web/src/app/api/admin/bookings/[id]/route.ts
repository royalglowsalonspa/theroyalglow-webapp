import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import {
  assignStaffToAllServices,
  getBookingForAdmin,
  updateBookingStatus,
} from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { adminBookingActionSchema } from '@rgss/types'

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
    await requireRole('receptionist')
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
      // pending → confirmed: assign staff to every service, stamp confirmedAt.
      if (existing.status !== 'pending') {
        throw conflict(
          ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
          `Only pending bookings can be approved (current status: "${existing.status}").`,
        )
      }

      await assignStaffToAllServices(id, action.staffId)
      const updated = await updateBookingStatus(id, 'confirmed', {
        confirmedAt: new Date(),
      })

      return apiSuccess({ booking: updated })
    }

    if (action.action === 'reject') {
      // pending → rejected with reason.
      if (existing.status !== 'pending') {
        throw conflict(
          ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
          `Only pending bookings can be rejected (current status: "${existing.status}").`,
        )
      }

      const updated = await updateBookingStatus(id, 'rejected', {
        rejectionReason: action.rejectionReason,
        rejectedAt: new Date(),
      })

      return apiSuccess({ booking: updated })
    }

    // assign: (re)assign staff to all services regardless of status.
    const services = await assignStaffToAllServices(id, action.staffId)
    return apiSuccess({ bookingId: id, services })
  },
)
