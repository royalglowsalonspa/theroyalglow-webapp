/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 28-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/staff
 * Scope        : API — Staff at the active branch (multi-branch R1.11)
 *
 * Description  : GET returns the active branch's staff for assignment pickers
 *                (booking approval, staff assignment, schedules). POST adds a
 *                person, chosen with the people search, as a Stylist or
 *                Therapist at the active branch: role, profile, branch and
 *                audit entry in one transaction.
 *
 * Responsibilities :
 * - GET: the active branch's working staff (id, name, designation) — Receptionist+
 * - POST: Add staff through the shared role-change path — Manager of the
 *   branch, its Owner or the Developer
 *
 * Features / Functionality :
 * - GET  → { branchId, staff: [{ id, name, designation }] }
 * - POST { branchId, userId, designation, specialization? } → 201 { changed }
 * - Re-adding a removed person reactivates their earlier profile
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/branch-roles,
 *                @/lib/api/error-handler, @rgss/db/queries, @rgss/errors,
 *                @rgss/types
 *
 * Notes        : `branchId` in POST is the branch the page was rendered for
 *                (409 BRANCH_CONTEXT_CHANGED after a switch). Managers add
 *                only Stylists and Therapists; the Receptionist and Manager
 *                are chosen in Users & Roles.
 ************************************************************/

import { getActiveStaffAtBranch } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { staffAddSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { changeBranchRole } from '@/lib/api/branch-roles'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// The active branch's staff for the assignment pickers. Receptionist+.
export const GET = withErrorHandler(async () => {
  const ctx = await requireBranchRole('receptionist')

  const rows = await getActiveStaffAtBranch(ctx.branch.id)
  const staff = rows.map((s) => ({ id: s.id, name: s.name, designation: s.designation }))
  return apiSuccess({ branchId: ctx.branch.id, staff })
})

// POST /api/staff — add a Stylist or Therapist at the active branch.
export const POST = withErrorHandler(async (req: Request) => {
  const ctx = await requireBranchRole('manager')

  const body = await req.json().catch(() => null)
  const parsed = staffAddSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  assertRenderedBranch(ctx, parsed.data.branchId)

  const { branchId, userId, designation, specialization } = parsed.data
  const result = await changeBranchRole(ctx.session.user.id, {
    kind: 'add_staff',
    branchId,
    userId,
    designation,
    ...(specialization === undefined ? {} : { specialization }),
  })
  return apiSuccess({ changed: result.changed, liveUpdates: result.liveUpdates }, undefined, 201)
})
