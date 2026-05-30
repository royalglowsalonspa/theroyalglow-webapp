import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { getBookingById } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireSession()
    const { id } = await ctx.params

    const booking = await getBookingById(id)
    // Return 404 rather than 403 so we don't reveal which booking ids exist.
    if (!booking || booking.customerId !== session.user.id) {
      throw notFound('Booking not found.')
    }

    return apiSuccess({ booking })
  },
)
