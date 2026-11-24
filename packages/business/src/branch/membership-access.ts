/************************************************************
 * Module Name  : branch/membership-access
 * Scope        : Business Logic — memberships shared across branches
 *
 * Description  : A SPA membership is sold by one branch and used at any
 *                branch (multi-branch R3.1, R9). What it was sold for, and the
 *                decision to cancel it, stay with the selling branch (route
 *                inventory gap 5, confirmed 28 October 2026).
 *
 * Responsibilities :
 * - canSeeMembershipSale: who sees the price paid and agreed-versus-usual
 *   values
 * - membershipCancelRefusal: why someone can't cancel from the active branch
 *
 * Notes        : Pure. Callers pass access read from the database now.
 ************************************************************/

import { type AccessibleBranch, type BranchAccess, hasBranchRole } from './access'

/** The branch that sold a membership, as views name it. */
export type SellingBranch = { id: string; name: string }

/**
 * True when the person can access the branch that sold the membership, so
 * they may see what it was sold for: the price paid and the tier's usual hours
 * and price at the time. Everyone else sees its hours, expiry and the selling
 * branch's name.
 */
export function canSeeMembershipSale(
  access: Pick<BranchAccess, 'branches'>,
  sellingBranchId: string | null,
): boolean {
  return sellingBranchId !== null && access.branches.some((b) => b.id === sellingBranchId)
}

export type MembershipCancelRefusal = {
  code: 'no_selling_branch' | 'role' | 'switch_branch' | 'selling_branch_only'
  reason: string
}

/**
 * Why the person can't cancel the membership while working at `active`, or
 * null when they can. Only the selling branch's Manager or Owner, or the
 * Developer, cancels, and only while working at that branch.
 */
export function membershipCancelRefusal(
  access: Pick<BranchAccess, 'branches'>,
  active: AccessibleBranch,
  selling: SellingBranch | null,
): MembershipCancelRefusal | null {
  if (!selling) {
    return {
      code: 'no_selling_branch',
      reason: 'This membership has no selling branch on record. Ask the Developer.',
    }
  }
  if (active.id === selling.id) {
    return hasBranchRole(active, 'manager')
      ? null
      : {
          code: 'role',
          reason: `Only a Manager or Owner at ${selling.name} can cancel this membership.`,
        }
  }
  const atSellingBranch = access.branches.find((b) => b.id === selling.id)
  if (atSellingBranch && hasBranchRole(atSellingBranch, 'manager')) {
    return {
      code: 'switch_branch',
      reason: `This membership was sold at ${selling.name}. Switch to ${selling.name} to cancel it.`,
    }
  }
  return {
    code: 'selling_branch_only',
    reason: `This membership was sold at ${selling.name}. Only ${selling.name} can cancel it.`,
  }
}
