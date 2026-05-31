import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getLeaveRequests } from '@rgss/db/queries'

// GET /api/admin/leave?status= — the leave approval queue, newest first, optionally
// filtered by approval status. Receptionist+ only.
export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('receptionist')

  const { searchParams } = new URL(req.url)
  const filters: { status?: string } = {}
  const status = searchParams.get('status')
  if (status) {
    filters.status = status
  }

  const leave = await getLeaveRequests(filters)
  return apiSuccess({ leave })
})
