import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getCustomers } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { customerListQuerySchema } from '@rgss/types'

// GET /api/admin/customers — paginated, searchable, sortable customer directory.
// Receptionist+. Returns the standard envelope with pagination `meta`.
export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('receptionist')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = customerListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid query parameters', parsed.error.flatten().fieldErrors)
  }

  const query = parsed.data
  const { rows, totalCount } = await getCustomers(query)
  const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize))

  return apiSuccess({ customers: rows }, { page: query.page, totalPages, totalCount })
})
