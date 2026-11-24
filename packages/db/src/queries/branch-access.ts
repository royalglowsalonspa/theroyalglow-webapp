/************************************************************
 * Module Name  : branch-access
 * Scope        : Data Access — Branch access (multi-branch R1, R2)
 *
 * Description  : Reads the rows that decide which branches a person may act
 *                on: their current role, every branch's Owner and Manager, and
 *                their staff profile. The admin app passes the result to the
 *                pure rules in @rgss/business (resolveBranchAccess).
 *
 * Notes        : The three reads run in one db.batch() transaction, but under
 *                READ COMMITTED each statement sees the latest commit, so a
 *                handover committing between them can be read half applied.
 *                That is safe: access needs the role and the branch reference
 *                or profile to agree, and the role-qualified keys only let a
 *                reference or profile name someone's current role. A torn
 *                read therefore grants what the state before or after the
 *                handover grants, or nothing. Role changes re-check every row
 *                they planned from when they're applied (branch-roles.ts).
 *                Branch rows are few (one per salon), so reading all of them
 *                is cheaper than a per-role query.
 ************************************************************/

import { eq } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { branch } from '../schema/branch'
import { staffProfile } from '../schema/profile'

/** The rows branch access is decided from; null when the user doesn't exist. */
export async function getBranchAccessInputs(userId: string) {
  const [users, branches, profiles] = await db.batch([
    db.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, userId)).limit(1),
    db
      .select({
        id: branch.id,
        name: branch.name,
        code: branch.code,
        status: branch.status,
        isPrimary: branch.isPrimary,
        displayOrder: branch.displayOrder,
        ownerUserId: branch.ownerUserId,
        managerUserId: branch.managerUserId,
      })
      .from(branch),
    db
      .select({
        branchId: staffProfile.branchId,
        roleWitness: staffProfile.roleWitness,
        isActive: staffProfile.isActive,
      })
      .from(staffProfile)
      .where(eq(staffProfile.userId, userId))
      .limit(1),
  ])

  const found = users[0]
  if (!found) {
    return null
  }
  return { user: found, branches, profile: profiles[0] ?? null }
}
