/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/waitlist
 * Scope        : API — Admin Waitlist
 *
 * Description  : Paginated, status-filterable waitlist queue for the admin
 *                Waitlist module. Returns entries newest first with pagination
 *                metadata. Receptionist+ access.
 *
 * Responsibilities :
 * - Validate query params (optional status filter + pagination)
 * - Return the waitlist entries with pagination metadata
 * - Enforce RBAC (receptionist+)
 *
 * Features / Functionality :
 * - Optional status filter (waiting/notified/booked/expired/cancelled)
 * - Standard envelope with `meta` (page, totalPages, totalCount)
 * - Customer + service detail joined per entry
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Requires min role: receptionist.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getWaitlist } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { waitlistListQuerySchema } from '@rgss/types'

// GET /api/waitlist — paginated waitlist queue, newest first, optionally
// filtered by status. Receptionist+ only.
export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('receptionist')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = waitlistListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid query parameters', parsed.error.flatten().fieldErrors)
  }

  const query = parsed.data
  const { rows, totalCount } = await getWaitlist(query)
  const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize))

  return apiSuccess({ entries: rows }, { page: query.page, totalPages, totalCount })
})
