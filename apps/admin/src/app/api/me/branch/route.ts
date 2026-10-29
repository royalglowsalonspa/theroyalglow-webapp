/************************************************************
 * Module Name  : GET|PUT /api/me/branch
 * Scope        : API — The admin branch switcher (multi-branch R2.1, R2.4)
 *
 * Description  : GET returns the branches the signed-in person can work in and
 *                the one they're working in now. PUT switches the active
 *                branch: the server checks the person can access it, then
 *                stores the choice in an HttpOnly cookie on the admin origin.
 *
 * Features / Functionality :
 * - GET → { active, branches } (active is null when they can access none)
 * - PUT { branchId } → { active }; 404 for a branch they can't access
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Notes        : The cookie is only a preference: every protected request
 *                re-reads access and ignores a branch the person can no longer
 *                act on (branch-context.ts). Forms carry the branch they were
 *                rendered for, so a tab left open across a switch is refused.
 ************************************************************/

import { chooseActiveBranch, findAccessibleBranch } from '@rgss/business'
import { badRequest, notFound } from '@rgss/errors'
import { activeBranchSchema } from '@rgss/types'
import { cookies } from 'next/headers'
import {
  ACTIVE_BRANCH_COOKIE,
  activeBranchCookieOptions,
  loadBranchAccess,
  readActiveBranchPreference,
} from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'

export const GET = withErrorHandler(async () => {
  const session = await requireSession()
  const access = await loadBranchAccess(session.user.id)
  const active = chooseActiveBranch(access, await readActiveBranchPreference())
  return apiSuccess({ active, branches: access.branches })
})

export const PUT = withErrorHandler(async (req: Request) => {
  const session = await requireSession()

  const body = await req.json().catch(() => null)
  const parsed = activeBranchSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const access = await loadBranchAccess(session.user.id)
  const chosen = findAccessibleBranch(access, parsed.data.branchId)
  if (!chosen) {
    throw notFound('Branch not found.')
  }

  ;(await cookies()).set(ACTIVE_BRANCH_COOKIE, chosen.id, activeBranchCookieOptions())
  return apiSuccess({ active: chosen })
})
