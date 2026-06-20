/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/leave
 * Scope        : API — Admin Leave
 *
 * Description  : Admin leave approval queue. Returns all leave requests
 *                (newest first) with optional status filter.
 *
 * Responsibilities :
 * - Return leave requests for admin approval queue
 * - Support optional status filtering (pending/approved/rejected)
 * - Enforce RBAC (receptionist+)
 *
 * Features / Functionality :
 * - Leave request list (newest first)
 * - Status filter for queue views (pending, approved, rejected)
 * - Staff name and date details per request
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - Default view shows all statuses; filter by pending for approval workflow.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getLeaveRequests } from '@rgss/db/queries'

// GET /api/leave?status= — the leave approval queue, newest first, optionally
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
