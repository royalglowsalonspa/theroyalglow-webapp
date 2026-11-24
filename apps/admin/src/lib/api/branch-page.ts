/************************************************************
 * Module Name  : branch-page (admin)
 * Scope        : Page loaders — multi-branch authorization (R2.2)
 *
 * Description  : The server-page counterpart of requireBranchRole. A page that
 *                reads branch-owned data authorizes the same way an API does
 *                (fresh role and branch access, the switcher's choice), but
 *                renders a refusal instead of throwing into the error
 *                boundary.
 *
 * Responsibilities :
 * - branchForPage(minRole) → { ok: true, branch } | { ok: false, message }
 *
 * Notes        : Only refusals (401/403) become a result; anything else still
 *                throws. The middleware has already sent signed-out visitors
 *                to sign in, so a 401 here means the account went away.
 ************************************************************/

import type { AccessibleBranch, BranchRole } from '@rgss/business'
import { AppError } from '@rgss/errors'
import { requireBranchRole } from './branch-context'

export type BranchPageAccess =
  | { ok: true; branch: AccessibleBranch }
  | { ok: false; message: string }

/** The active branch a page renders for, or why the person can't open it. */
export async function branchForPage(minRole: BranchRole): Promise<BranchPageAccess> {
  try {
    const { branch } = await requireBranchRole(minRole)
    return { ok: true, branch }
  } catch (error: unknown) {
    if (error instanceof AppError && (error.statusCode === 401 || error.statusCode === 403)) {
      return { ok: false, message: error.message }
    }
    throw error
  }
}
