import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getAllBookings } from '@rgss/db/queries'

export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('receptionist')

  const { searchParams } = new URL(req.url)
  const filters: { status?: string; serviceType?: string; date?: string } = {}
  const status = searchParams.get('status')
  const serviceType = searchParams.get('serviceType')
  const date = searchParams.get('date')
  if (status) {
    filters.status = status
  }
  if (serviceType) {
    filters.serviceType = serviceType
  }
  if (date) {
    filters.date = date
  }

  const bookings = await getAllBookings(filters)
  return apiSuccess({ bookings })
})
