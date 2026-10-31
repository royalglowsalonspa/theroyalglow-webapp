/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 29-10-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET|POST /api/branches (admin)
 * Scope        : API — Branch management (multi-branch R1.1, R1.2, R2.1)
 *
 * Description  : GET lists the branches the signed-in person can access, and
 *                whether they may change them. POST creates a branch with its
 *                Owner (code + number generated server-side): Developer only.
 *
 * Responsibilities :
 * - GET: the person's branches (Owner+; the Developer sees every branch)
 * - POST: create a branch and its Owner in one transaction (Developer)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/db/queries, @rgss/errors,
 *                @rgss/types
 *
 * Notes        : Roles are read from the database on every call. Branches are
 *                never hard-deleted — status drives lifecycle.
 ************************************************************/

import { createBranch, getBranches } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES } from '@rgss/errors'
import { branchCreateSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { requireCurrentRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// GET /api/branches — the branches this person can access. Owner+.
export const GET = withErrorHandler(async () => {
  const { access } = await requireCurrentRole('owner')
  const allowed = new Set(access.branches.map((b) => b.id))
  const branches = (await getBranches()).filter((b) => allowed.has(b.id))
  return apiSuccess({ branches, canEdit: access.role === 'developer' })
})

// POST /api/branches — create a branch with its Owner. Developer only.
export const POST = withErrorHandler(async (req: Request) => {
  const { session } = await requireCurrentRole('developer')

  const body = await req.json().catch(() => null)
  const parsed = branchCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const result = await createBranch(parsed.data)
  if (!result.ok) {
    throw conflict(
      ERROR_CODES.CONFLICT,
      'That person can’t own a branch: they hold another role. Remove it first, or choose another Owner.',
    )
  }
  await audit(req, session, {
    action: 'create',
    entityType: 'branch',
    entityId: result.branch.id,
    branchId: result.branch.id,
    newValues: parsed.data,
  })
  return apiSuccess({ branch: result.branch }, undefined, 201)
})
