/************************************************************
 * Module Name  : branch-context (admin)
 * Scope        : API Infrastructure — multi-branch authorization (R2)
 *
 * Description  : The one way an admin handler learns which branch it acts on.
 *                Every call authenticates, re-reads the person's role and
 *                branch relationships from the database (never the session's
 *                cached role), and settles the active branch from the
 *                switcher's cookie. The cookie is only a preference: a branch
 *                the person can't act on is never used.
 *
 * Responsibilities :
 * - requireBranchRole(minRole, options) → { session, access, branch }
 * - requireCurrentRole(minRole)         → for endpoints that aren't branch-owned
 * - loadBranchAccess(userId)            → BranchAccess from current rows
 * - ACTIVE_BRANCH_COOKIE + cookie options for the switcher route
 *
 * Usage        : Branch-owned queries take `ctx.branch.id` and constrain by it,
 *                so a record from another branch reads as not found (R2.3).
 *                Mutations pass the branch the form was rendered for as
 *                `renderedBranchId`; a stale tab gets 409 BRANCH_CONTEXT_CHANGED
 *                instead of writing into the newly selected branch (R2.4).
 ************************************************************/

import {
  type AccessibleBranch,
  type BranchAccess,
  type BranchRole,
  chooseActiveBranch,
  hasBranchRole,
  resolveBranchAccess,
} from '@rgss/business'
import { getBranchAccessInputs } from '@rgss/db/queries'
import { AppError, ERROR_CODES, forbidden } from '@rgss/errors'
import { cookies } from 'next/headers'
import { ROLE_LEVELS, resolveRoleLevel } from '@/lib/rbac'
import { requireSession } from './session'

/** The switcher's choice. A preference, validated on every request. */
export const ACTIVE_BRANCH_COOKIE = 'rgss_admin_branch'

/** Host-only (admin origin), HttpOnly: set by the server after validation. */
export function activeBranchCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  }
}

type Session = Awaited<ReturnType<typeof requireSession>>

export type BranchContext = {
  session: Session
  access: BranchAccess
  /** The branch this request acts on. */
  branch: AccessibleBranch
}

function signedOut(): AppError {
  return new AppError({
    code: ERROR_CODES.UNAUTHENTICATED,
    message: 'You must be signed in.',
    statusCode: 401,
  })
}

/** Branch access from the database as it is now. */
export async function loadBranchAccess(userId: string): Promise<BranchAccess> {
  const inputs = await getBranchAccessInputs(userId)
  if (!inputs) {
    // The session outlived its account.
    throw signedOut()
  }
  return resolveBranchAccess(inputs)
}

/** The switcher's stored choice, unvalidated. */
export async function readActiveBranchPreference(): Promise<string | null> {
  return (await cookies()).get(ACTIVE_BRANCH_COOKIE)?.value ?? null
}

type BranchRoleOptions = {
  /**
   * The branch a form was rendered for. When given, it must be the active
   * branch: a tab left open across a switch must not write elsewhere.
   */
  renderedBranchId?: string | null | undefined
}

/**
 * Authenticate, read current access and settle the active branch. Throws 401
 * when signed out, 403 when the person may act on no branch or their role at
 * the active branch is below `minRole`, and 409 when `renderedBranchId` is not
 * the active branch.
 */
export async function requireBranchRole(
  minRole: BranchRole,
  options: BranchRoleOptions = {},
): Promise<BranchContext> {
  const session = await requireSession()
  const access = await loadBranchAccess(session.user.id)
  const branch = chooseActiveBranch(access, await readActiveBranchPreference())
  if (!branch) {
    throw new AppError({
      code: ERROR_CODES.BRANCH_ACCESS_NONE,
      message: 'Your account is not linked to any branch. Ask your branch Owner.',
      statusCode: 403,
    })
  }

  if (options.renderedBranchId !== undefined) {
    assertRenderedBranch({ branch }, options.renderedBranchId)
  }

  if (!hasBranchRole(branch, minRole)) {
    throw forbidden('You do not have permission to perform this action at this branch.')
  }

  return { session, access, branch }
}

/**
 * 409 BRANCH_CONTEXT_CHANGED unless `renderedBranchId` is the active branch:
 * a tab left open across a switch must not write into the new branch (R2.4).
 * For handlers that authenticate before they parse the body.
 */
export function assertRenderedBranch(
  ctx: Pick<BranchContext, 'branch'>,
  renderedBranchId: string | null,
): void {
  if (renderedBranchId !== ctx.branch.id) {
    throw new AppError({
      code: ERROR_CODES.BRANCH_CONTEXT_CHANGED,
      message: `You switched to ${ctx.branch.name}. Reload this page before saving.`,
      statusCode: 409,
    })
  }
}

/**
 * For endpoints that don't belong to one branch (for example creating a
 * branch): checks the role in the database now, not the session's copy.
 */
export async function requireCurrentRole(minRole: keyof typeof ROLE_LEVELS) {
  const session = await requireSession()
  const access = await loadBranchAccess(session.user.id)
  if (resolveRoleLevel(access.role) < ROLE_LEVELS[minRole]) {
    throw forbidden('You do not have permission to perform this action.')
  }
  return { session, access }
}
