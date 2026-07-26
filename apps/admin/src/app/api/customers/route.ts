/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/customers
 * Scope        : API — Admin CRM
 *
 * Description  : Paginated, searchable, and sortable customer directory for
 *                the admin CRM module. Receptionist+ access.
 *
 * Responsibilities :
 * - Validate query parameters (search, sort, pagination)
 * - Return paginated customer list with total count
 * - Support search and sort by LTV, name, etc.
 *
 * Features / Functionality :
 * - Full-text customer search
 * - Sortable by LTV, created date, name
 * - Paginated response with meta (page, totalPages, totalCount)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - Query params are Zod-validated via customerListQuerySchema.
 ************************************************************/

import { getCustomers } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { customerListQuerySchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

// GET /api/customers — paginated, searchable, sortable customer directory.
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
