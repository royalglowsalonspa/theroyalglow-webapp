/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 28-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/users
 * Scope        : API — Users & Roles at the active branch (multi-branch R1.4, R1.5)
 *
 * Description  : GET looks people up by name, phone, or email and says, for
 *                each, which roles they can be given at the active branch, or
 *                why not. POST changes who holds a role there: the Developer
 *                sets the Owner; the branch's Owner or the Developer sets and
 *                removes its Manager and Receptionist.
 *
 * Responsibilities :
 * - Look up people (≥ 3 characters, ≤ 10 matches) — Owner of the branch+
 * - Preview each match's possible changes with the same planner POST uses
 * - Apply one change in one transaction (lib/api/branch-roles)
 *
 * Features / Functionality :
 * - GET  /api/users?search= → { branchId, users: [{ id, name, email, phone,
 *        here, actions, note }] }
 * - POST /api/users { kind, branchId, userId, expectedHolderId? }
 *        → { changed }
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/branch-roles,
 *                @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Authority is re-read from the database on every call, and again inside
 *   the write transaction; the session's cached role grants nothing.
 * - `branchId` in POST is the branch the page was rendered for; a tab left
 *   open across a branch switch gets 409 BRANCH_CONTEXT_CHANGED.
 * - A match never says which other branch someone works at (R1.11).
 * - Stylists and Therapists are added and removed on the Staff page.
 ************************************************************/

import { type BranchRoleRequest, heldRoleAt, receptionistAt } from '@rgss/business'
import { getRoleSnapshot, searchUsers } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { branchRoleChangeSchema, userListQuerySchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { changeBranchRole, previewBranchRoles } from '@/lib/api/branch-roles'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

const DEVELOPER_NOTE = "The Developer account's role can only be changed in the database."

// GET /api/users?search= — people the actor could give a role at the active
// branch. Owner of that branch, or the Developer.
export const GET = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('owner')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = userListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid query parameters', parsed.error.flatten().fieldErrors)
  }

  const branchId = ctx.branch.id
  // searchUsers returns [] for a missing/short term — never the whole table.
  const matches = await searchUsers(parsed.data.search ?? '')
  if (matches.length === 0) {
    return apiSuccess({ branchId, users: [] })
  }

  const actorId = ctx.session.user.id
  const snapshot = await getRoleSnapshot(branchId, [actorId, ...matches.map((m) => m.id)])
  const branch = snapshot.branches.find((b) => b.id === branchId)
  const holders = {
    set_owner: branch?.ownerUserId ?? null,
    set_manager: branch?.managerUserId ?? null,
    set_receptionist: receptionistAt(snapshot, branchId)?.userId ?? null,
  } as const

  const users = matches.map((match) => {
    const requests: BranchRoleRequest[] = (
      ['set_owner', 'set_manager', 'set_receptionist'] as const
    ).map((kind) => ({ kind, branchId, userId: match.id, expectedHolderId: holders[kind] }))
    const previews = previewBranchRoles(snapshot, actorId, requests)
    const actions = previews.filter((p) => p.outcome === 'change').map((p) => p.kind)
    const here = heldRoleAt(snapshot, branchId, match.id)

    let note: string | null = null
    if (match.id === actorId) {
      note = 'This is you. Nobody changes their own role.'
    } else if (snapshot.users.find((u) => u.id === match.id)?.role === 'developer') {
      note = DEVELOPER_NOTE
    } else if (actions.length === 0 && here === null) {
      note = previews.find((p) => p.outcome === 'unavailable')?.reason ?? null
    }

    return {
      id: match.id,
      name: match.name,
      email: match.email,
      phone: match.phone,
      here,
      actions,
      note,
    }
  })
  return apiSuccess({ branchId, users })
})

// POST /api/users — change who holds a role at the active branch.
export const POST = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('owner')

  const body = await req.json().catch(() => null)
  const parsed = branchRoleChangeSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  assertRenderedBranch(ctx, parsed.data.branchId)

  const result = await changeBranchRole(ctx.session.user.id, parsed.data)
  // A replaced or removed Manager or Receptionist leaves their bookings at the
  // branch for reassignment (R1.7).
  return apiSuccess({
    changed: result.changed,
    liveUpdates: result.liveUpdates,
    reassignments: result.reassignments,
  })
})
