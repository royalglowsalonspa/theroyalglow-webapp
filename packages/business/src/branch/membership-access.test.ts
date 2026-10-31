/************************************************************
 * Module Name  : branch/membership-access.test
 * Scope        : Business Logic — memberships shared across branches (gap 5)
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type AccessibleBranch, BRANCH_ROLES, type BranchRole } from './access'
import { canSeeMembershipSale, membershipCancelRefusal } from './membership-access'

const RS = { id: 'branch_rs', name: 'Rayasandra' }
const MH = { id: 'branch_mh', name: 'Marathahalli' }

function at(branch: { id: string; name: string }, role: BranchRole): AccessibleBranch {
  return { ...branch, code: branch.id, status: 'operational', isPrimary: false, role }
}

describe('canSeeMembershipSale', () => {
  it('shows the sale to anyone who can access the selling branch', () => {
    expect(canSeeMembershipSale({ branches: [at(RS, 'receptionist')] }, RS.id)).toBe(true)
    // An Owner of both sees it while working at either.
    expect(canSeeMembershipSale({ branches: [at(MH, 'owner'), at(RS, 'owner')] }, RS.id)).toBe(true)
  })

  it('hides it from everyone else', () => {
    expect(canSeeMembershipSale({ branches: [at(MH, 'owner')] }, RS.id)).toBe(false)
    expect(canSeeMembershipSale({ branches: [] }, RS.id)).toBe(false)
    expect(canSeeMembershipSale({ branches: [at(RS, 'developer')] }, null)).toBe(false)
  })

  it('depends only on access to the selling branch', () => {
    const branchIds = fc.constantFrom('a', 'b', 'c', 'd')
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(branchIds, fc.constantFrom(...BRANCH_ROLES)), {
          selector: ([id]) => id,
        }),
        branchIds,
        (granted, selling) => {
          const access = {
            branches: granted.map(([id, role]) => at({ id, name: id.toUpperCase() }, role)),
          }
          expect(canSeeMembershipSale(access, selling)).toBe(granted.some(([id]) => id === selling))
        },
      ),
    )
  })
})

describe('membershipCancelRefusal', () => {
  it('lets the selling branch’s Manager, Owner or the Developer cancel there', () => {
    for (const role of ['manager', 'owner', 'developer'] as const) {
      const active = at(RS, role)
      expect(membershipCancelRefusal({ branches: [active] }, active, RS)).toBeNull()
    }
  })

  it('refuses the selling branch’s Receptionist and Staff', () => {
    for (const role of ['receptionist', 'staff'] as const) {
      const active = at(RS, role)
      expect(membershipCancelRefusal({ branches: [active] }, active, RS)?.code).toBe('role')
    }
  })

  it('asks someone who manages the selling branch to switch to it first', () => {
    const access = { branches: [at(MH, 'owner'), at(RS, 'owner')] }
    const refusal = membershipCancelRefusal(access, at(MH, 'owner'), RS)

    expect(refusal?.code).toBe('switch_branch')
    expect(refusal?.reason).toContain('Switch to Rayasandra')
  })

  it('refuses another branch outright', () => {
    const active = at(MH, 'owner')
    const refusal = membershipCancelRefusal({ branches: [active] }, active, RS)

    expect(refusal?.code).toBe('selling_branch_only')
    expect(refusal?.reason).toBe(
      'This membership was sold at Rayasandra. Only Rayasandra can cancel it.',
    )
  })

  it('refuses a Receptionist elsewhere even when they could see the selling branch', () => {
    // Access to the selling branch below Manager doesn't make switching useful.
    const access = { branches: [at(MH, 'manager'), at(RS, 'receptionist')] }
    expect(membershipCancelRefusal(access, at(MH, 'manager'), RS)?.code).toBe('selling_branch_only')
  })

  it('refuses when no selling branch is on record', () => {
    const active = at(RS, 'developer')
    expect(membershipCancelRefusal({ branches: [active] }, active, null)?.code).toBe(
      'no_selling_branch',
    )
  })
})
