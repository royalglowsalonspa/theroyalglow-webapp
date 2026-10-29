/************************************************************
 * Module Name  : GET /api/staff/candidates
 * Scope        : API — Add staff person search (multi-branch R1.11)
 *
 * Description  : Finds existing accounts by phone, email or name for Add
 *                staff, and says whether each can be added at the active
 *                branch. Returns only name, email and phone: never money,
 *                history, or which other branch someone works at.
 *
 * Features / Functionality :
 * - GET ?search= (≥ 3 characters) → { branchId, people: [{ id, name, email,
 *   phone, available, reason }] } (≤ 10)
 * - Availability comes from the same planner Add staff applies
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Notes        : Manager of the branch, its Owner, or the Developer. A person
 *                with no account isn't found: they sign in once at
 *                theroyalglow.in first.
 ************************************************************/

import { getRoleSnapshot, searchUsers } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { userListQuerySchema } from '@rgss/types'
import { requireBranchRole } from '@/lib/api/branch-context'
import { previewBranchRoles } from '@/lib/api/branch-roles'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('manager')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = userListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid query parameters', parsed.error.flatten().fieldErrors)
  }

  const branchId = ctx.branch.id
  const matches = await searchUsers(parsed.data.search ?? '')
  if (matches.length === 0) {
    return apiSuccess({ branchId, people: [] })
  }

  const actorId = ctx.session.user.id
  const snapshot = await getRoleSnapshot(branchId, [actorId, ...matches.map((m) => m.id)])
  const previews = previewBranchRoles(
    snapshot,
    actorId,
    matches.map((m) => ({
      kind: 'add_staff' as const,
      branchId,
      userId: m.id,
      designation: 'stylist' as const,
    })),
  )

  const people = matches.map((match, index) => {
    const preview = previews[index]
    const available = preview?.outcome === 'change'
    return {
      id: match.id,
      name: match.name,
      email: match.email,
      phone: match.phone,
      available,
      reason: available ? null : (preview?.reason ?? 'This person is already on the staff here.'),
    }
  })
  return apiSuccess({ branchId, people })
})
