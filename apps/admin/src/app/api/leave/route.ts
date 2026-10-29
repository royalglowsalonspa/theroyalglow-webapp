/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 29-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/leave
 * Scope        : API — Admin Leave at the active branch (multi-branch R5.10)
 *
 * Description  : The active branch's leave approval queue: requests from the
 *                people who work there (newest first), with optional status
 *                filter, each saying whether the signed-in person may decide it.
 *
 * Responsibilities :
 * - Return the branch's leave requests for the approval queue
 * - Support optional status filtering (pending/approved/rejected)
 * - Say per request whether the actor may decide it, and why not
 *
 * Features / Functionality :
 * - A shared Manager's leave shows at each of their branches
 * - Nobody decides their own leave; a Manager's leave is decided by the
 *   branch's Owner or the Developer (leaveDecisionRefusal)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @rgss/business, @rgss/db/queries
 *
 * Notes        :
 * - Requires min role at the active branch: receptionist.
 * - Default view shows all statuses; filter by pending for approval workflow.
 ************************************************************/

import { leaveDecisionRefusal } from '@rgss/business'
import { getLeaveRequests } from '@rgss/db/queries'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// GET /api/leave?status= — the active branch's leave approval queue, newest
// first, optionally filtered by approval status. Receptionist or above there.
export const GET = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('receptionist')
  const actor = { userId: ctx.session.user.id, role: ctx.branch.role }

  const { searchParams } = new URL(req.url)
  const filters: { status?: string } = {}
  const status = searchParams.get('status')
  if (status) {
    filters.status = status
  }

  const rows = await getLeaveRequests(ctx.branch.id, filters)
  const leave = rows.map(({ staffUserId, staffRoleWitness, ...request }) => {
    const refusal = leaveDecisionRefusal(actor, {
      userId: staffUserId,
      roleWitness: staffRoleWitness,
    })
    return { ...request, canDecide: refusal === null, decideNote: refusal?.reason ?? null }
  })
  return apiSuccess({ branchId: ctx.branch.id, leave })
})
