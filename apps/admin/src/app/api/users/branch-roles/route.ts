/************************************************************
 * Module Name  : GET /api/users/branch-roles
 * Scope        : API — Users & Roles at the active branch (multi-branch R1.2, R1.5)
 *
 * Description  : Who holds the active branch's Owner, Manager and Receptionist
 *                roles, and which of them the signed-in person may change.
 *                The Users & Roles screen renders from this and sends the
 *                holders back as `expectedHolderId` when changing one.
 *
 * Features / Functionality :
 * - GET → { branch, owner, manager, receptionist, can }
 *   - each holder is { id, name, email, phone } or null
 *   - can: { setOwner, setManager, setReceptionist }
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Notes        : Owner of the active branch, or the Developer. Read fresh from
 *                the database on every call.
 ************************************************************/

import { receptionistAt } from '@rgss/business'
import { getPeopleByIds, getRoleSnapshot } from '@rgss/db/queries'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(async () => {
  const ctx = await requireBranchRole('owner')
  const branchId = ctx.branch.id

  const snapshot = await getRoleSnapshot(branchId, [ctx.session.user.id])
  const row = snapshot.branches.find((b) => b.id === branchId)
  const ids = {
    owner: row?.ownerUserId ?? null,
    manager: row?.managerUserId ?? null,
    receptionist: receptionistAt(snapshot, branchId)?.userId ?? null,
  }
  const people = await getPeopleByIds(
    [ids.owner, ids.manager, ids.receptionist].filter((id): id is string => id !== null),
  )
  const person = (id: string | null) =>
    id === null ? null : (people.find((p) => p.id === id) ?? null)

  const role = ctx.branch.role
  const ownerLevel = role === 'owner' || role === 'developer'
  return apiSuccess({
    branch: {
      id: ctx.branch.id,
      name: ctx.branch.name,
      code: ctx.branch.code,
      status: ctx.branch.status,
    },
    owner: person(ids.owner),
    manager: person(ids.manager),
    receptionist: person(ids.receptionist),
    can: {
      setOwner: role === 'developer',
      setManager: ownerLevel,
      setReceptionist: ownerLevel,
    },
  })
})
