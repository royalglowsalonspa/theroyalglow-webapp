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
 * - Requires min role at the active branch: receptionist.
 * - Query params are Zod-validated via customerListQuerySchema.
 * - Every branch sees every customer (shared identity), but LTV and the LTV
 *   sort count only the active branch's paid invoices (multi-branch R3.2).
 ************************************************************/

import { getCustomers } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { customerListQuerySchema } from '@rgss/types'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// GET /api/customers — paginated, searchable, sortable customer directory.
// Receptionist+. Returns the standard envelope with pagination `meta`, and the
// branch whose money `branchSpentPaise` shows.
export const GET = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('receptionist')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = customerListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid query parameters', parsed.error.flatten().fieldErrors)
  }

  const query = parsed.data
  const { rows, totalCount } = await getCustomers(ctx.branch.id, query)
  const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize))

  return apiSuccess(
    { branchId: ctx.branch.id, customers: rows },
    { page: query.page, totalPages, totalCount },
  )
})
