/************************************************************
 * Module Name  : branch/access
 * Scope        : Business Logic — Branch access (multi-branch R1, R2)
 *
 * Description  : Works out which branches a person may act on, and the role
 *                they hold at each, from the current database rows. Pure: the
 *                caller reads the rows, this decides. Every protected admin
 *                operation calls it with fresh rows, so a session's cached
 *                role never grants anything (R2.2).
 *
 * Responsibilities :
 * - resolveBranchAccess(inputs)        → the branches and per-branch role
 * - findAccessibleBranch(access, id)   → one branch, or null when not allowed
 * - chooseActiveBranch(access, wanted) → the branch to work in
 * - hasBranchRole / branchRoleLevel    → role checks at one branch
 *
 * Rules :
 * - Developer: every branch.
 * - Owner: the branches whose branch.owner_user_id is this person.
 * - Manager: the branches whose branch.manager_user_id is this person.
 * - Receptionist and Staff: the one branch on their active staff profile.
 * - Anyone else, or a role that disagrees with the profile: no branch.
 * - Shut-down branches stay listed, so authorized history stays readable;
 *   whether an action is allowed there is the caller's decision (R1.10).
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic (pure, no I/O)
 ************************************************************/

import type { BranchStatusValue } from '@rgss/types'

/** Roles that can grant access to a branch, lowest first. */
export const BRANCH_ROLES = ['staff', 'receptionist', 'manager', 'owner', 'developer'] as const
export type BranchRole = (typeof BRANCH_ROLES)[number]

const BRANCH_ROLE_LEVEL: Readonly<Record<BranchRole, number>> = {
  staff: 1,
  receptionist: 2,
  manager: 3,
  owner: 4,
  developer: 5,
}

/** The branch columns access depends on. */
export type BranchAccessBranchRow = {
  id: string
  name: string
  code: string
  status: BranchStatusValue
  isPrimary: boolean
  displayOrder: number
  ownerUserId: string | null
  managerUserId: string | null
}

/** The person's staff profile, when they have one. */
export type BranchAccessProfileRow = {
  branchId: string | null
  roleWitness: string | null
  isActive: boolean
}

export type BranchAccessInputs = {
  user: { id: string; role: string | null }
  branches: readonly BranchAccessBranchRow[]
  profile: BranchAccessProfileRow | null
}

/** A branch the person may act on, with their role there. */
export type AccessibleBranch = {
  id: string
  name: string
  code: string
  status: BranchStatusValue
  isPrimary: boolean
  role: BranchRole
}

export type BranchAccess = {
  userId: string
  /** The person's current role in the database. */
  role: string | null
  /** In display order, then by name. Empty when they may act on no branch. */
  branches: readonly AccessibleBranch[]
}

function isBranchRole(role: string | null): role is BranchRole {
  return role !== null && Object.hasOwn(BRANCH_ROLE_LEVEL, role)
}

function byDisplayOrder(a: BranchAccessBranchRow, b: BranchAccessBranchRow): number {
  return a.displayOrder - b.displayOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
}

function toAccessible(row: BranchAccessBranchRow, role: BranchRole): AccessibleBranch {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status,
    isPrimary: row.isPrimary,
    role,
  }
}

/** The branches the person may act on, and their role at each. */
export function resolveBranchAccess(inputs: BranchAccessInputs): BranchAccess {
  const { user, profile } = inputs
  const role = user.role
  const ordered = [...inputs.branches].sort(byDisplayOrder)

  let granted: AccessibleBranch[] = []
  if (isBranchRole(role)) {
    switch (role) {
      case 'developer':
        granted = ordered.map((row) => toAccessible(row, 'developer'))
        break
      case 'owner':
        granted = ordered
          .filter((row) => row.ownerUserId === user.id)
          .map((row) => toAccessible(row, 'owner'))
        break
      case 'manager':
        granted = ordered
          .filter((row) => row.managerUserId === user.id)
          .map((row) => toAccessible(row, 'manager'))
        break
      case 'receptionist':
      case 'staff': {
        // The profile must be active, name a branch and record this same role.
        // Anything else, including a profile written before the role witness
        // existed, fails closed.
        const agrees =
          profile?.isActive === true && profile.branchId !== null && profile.roleWitness === role
        if (agrees) {
          granted = ordered
            .filter((row) => row.id === profile.branchId)
            .map((row) => toAccessible(row, role))
        }
        break
      }
    }
  }

  return { userId: user.id, role, branches: granted }
}

/** The branch if the person may act on it, otherwise null. Callers answer 404. */
export function findAccessibleBranch(
  access: BranchAccess,
  branchId: string | null | undefined,
): AccessibleBranch | null {
  if (!branchId) {
    return null
  }
  return access.branches.find((branch) => branch.id === branchId) ?? null
}

/**
 * The branch to work in: the one asked for when the person may act on it,
 * otherwise their primary branch, then their first operational branch, then
 * their first branch. Null when they may act on no branch.
 */
export function chooseActiveBranch(
  access: BranchAccess,
  wantedBranchId: string | null | undefined,
): AccessibleBranch | null {
  return (
    findAccessibleBranch(access, wantedBranchId) ??
    access.branches.find((branch) => branch.isPrimary) ??
    access.branches.find((branch) => branch.status === 'operational') ??
    access.branches[0] ??
    null
  )
}

export function branchRoleLevel(role: BranchRole): number {
  return BRANCH_ROLE_LEVEL[role]
}

/** True when the person's role at this branch is `minRole` or higher. */
export function hasBranchRole(branch: AccessibleBranch, minRole: BranchRole): boolean {
  return branchRoleLevel(branch.role) >= branchRoleLevel(minRole)
}
