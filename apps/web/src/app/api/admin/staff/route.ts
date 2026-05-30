import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getActiveStaff } from '@rgss/db/queries'

// Active staff members for the assignment picker (approve / reassign flows).
export const GET = withErrorHandler(async () => {
  await requireRole('receptionist')

  const rows = await getActiveStaff()
  const staff = rows.map((s) => ({
    id: s.id,
    name: s.name,
    designation: s.designation,
  }))

  return apiSuccess({ staff })
})
