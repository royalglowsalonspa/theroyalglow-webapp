/************************************************************
 * Module Name  : branch/access.test
 * Scope        : Business Logic — Branch access (multi-branch R1, R2)
 *
 * Description  : Each role reaches exactly the branches its database rows
 *                give it, and nothing else; the active branch is always one
 *                the person may act on. Example cases pin each rule; property
 *                cases check the guarantees for arbitrary rows.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  BRANCH_ROLES,
  type BranchAccessBranchRow,
  type BranchAccessInputs,
  type BranchAccessProfileRow,
  chooseActiveBranch,
  findAccessibleBranch,
  hasBranchRole,
  resolveBranchAccess,
} from './access'

function branchRow(
  overrides: Partial<BranchAccessBranchRow> & { id: string },
): BranchAccessBranchRow {
  return {
    name: overrides.id.toUpperCase(),
    code: overrides.id.toUpperCase(),
    status: 'operational',
    isPrimary: false,
    displayOrder: 0,
    ownerUserId: null,
    managerUserId: null,
    ...overrides,
  }
}

const RS = branchRow({
  id: 'rs',
  name: 'Rayasandra',
  isPrimary: true,
  displayOrder: 1,
  ownerUserId: 'own1',
  managerUserId: 'mgr1',
})
const MH = branchRow({
  id: 'mh',
  name: 'Marathahalli',
  displayOrder: 2,
  ownerUserId: 'own1',
  managerUserId: 'mgr1',
})
const X3 = branchRow({
  id: 'x3',
  name: 'Third',
  displayOrder: 3,
  status: 'opens_soon',
  ownerUserId: 'own2',
})
const BRANCHES = [X3, MH, RS]

function access(id: string, role: string | null, profile: BranchAccessProfileRow | null = null) {
  return resolveBranchAccess({ user: { id, role }, branches: BRANCHES, profile })
}

function ids(result: ReturnType<typeof access>): string[] {
  return result.branches.map((branch) => branch.id)
}

describe('resolveBranchAccess', () => {
  it('gives the Developer every branch, in display order', () => {
    const result = access('dev1', 'developer')
    expect(ids(result)).toEqual(['rs', 'mh', 'x3'])
    expect(result.branches.every((branch) => branch.role === 'developer')).toBe(true)
  })

  it('gives an Owner only the branches they own', () => {
    expect(ids(access('own1', 'owner'))).toEqual(['rs', 'mh'])
    expect(ids(access('own2', 'owner'))).toEqual(['x3'])
    expect(access('own2', 'owner').branches[0]?.role).toBe('owner')
  })

  it('gives a Manager only the branches they manage', () => {
    const result = access('mgr1', 'manager')
    expect(ids(result)).toEqual(['rs', 'mh'])
    expect(result.branches.every((branch) => branch.role === 'manager')).toBe(true)
  })

  it('gives a Receptionist or Staff member the one branch on their active profile', () => {
    expect(
      ids(
        access('rec1', 'receptionist', {
          branchId: 'mh',
          roleWitness: 'receptionist',
          isActive: true,
        }),
      ),
    ).toEqual(['mh'])
    expect(
      ids(access('sty1', 'staff', { branchId: 'rs', roleWitness: 'staff', isActive: true })),
    ).toEqual(['rs'])
  })

  it.each([
    ['no profile', null],
    ['an inactive profile', { branchId: 'rs', roleWitness: 'staff', isActive: false }],
    ['a profile without a branch', { branchId: null, roleWitness: 'staff', isActive: true }],
    [
      'a profile recording another role',
      { branchId: 'rs', roleWitness: 'receptionist', isActive: true },
    ],
    ['a profile from before role witnesses', { branchId: 'rs', roleWitness: null, isActive: true }],
    [
      'a profile naming a missing branch',
      { branchId: 'gone', roleWitness: 'staff', isActive: true },
    ],
  ])('gives Staff with %s no branch', (_label, profile) => {
    expect(ids(access('sty1', 'staff', profile))).toEqual([])
  })

  it.each([['customer'], [null], ['admin'], ['toString'], ['']])(
    'gives the role %p no branch',
    (role) => {
      expect(
        ids(access('u1', role, { branchId: 'rs', roleWitness: 'staff', isActive: true })),
      ).toEqual([])
    },
  )

  it('grants by current role only: an Owner listed as a Manager elsewhere gets owned branches', () => {
    const inconsistent = resolveBranchAccess({
      user: { id: 'own2', role: 'owner' },
      branches: [X3, branchRow({ id: 'y4', managerUserId: 'own2' })],
      profile: null,
    })
    expect(ids(inconsistent)).toEqual(['x3'])
  })
})

describe('findAccessibleBranch and chooseActiveBranch', () => {
  const owner = access('own1', 'owner')

  it('finds only branches the person may act on', () => {
    expect(findAccessibleBranch(owner, 'mh')?.id).toBe('mh')
    expect(findAccessibleBranch(owner, 'x3')).toBeNull()
    expect(findAccessibleBranch(owner, null)).toBeNull()
    expect(findAccessibleBranch(owner, '')).toBeNull()
  })

  it('keeps an allowed choice, otherwise falls back to the primary branch', () => {
    expect(chooseActiveBranch(owner, 'mh')?.id).toBe('mh')
    expect(chooseActiveBranch(owner, 'x3')?.id).toBe('rs')
    expect(chooseActiveBranch(owner, undefined)?.id).toBe('rs')
  })

  it('falls back to the first operational branch, then the first branch', () => {
    const noPrimary = resolveBranchAccess({
      user: { id: 'own3', role: 'owner' },
      branches: [
        branchRow({ id: 'a', displayOrder: 1, status: 'opens_soon', ownerUserId: 'own3' }),
        branchRow({ id: 'b', displayOrder: 2, ownerUserId: 'own3' }),
      ],
      profile: null,
    })
    expect(chooseActiveBranch(noPrimary, null)?.id).toBe('b')

    const noneOperational = resolveBranchAccess({
      user: { id: 'own3', role: 'owner' },
      branches: [branchRow({ id: 'a', status: 'shutdown', ownerUserId: 'own3' })],
      profile: null,
    })
    expect(chooseActiveBranch(noneOperational, null)?.id).toBe('a')
  })

  it('returns null when the person may act on no branch', () => {
    expect(chooseActiveBranch(access('c1', 'customer'), 'rs')).toBeNull()
  })

  it('compares roles at one branch', () => {
    const rs = findAccessibleBranch(access('mgr1', 'manager'), 'rs')
    if (!rs) throw new Error('expected access')
    expect(hasBranchRole(rs, 'receptionist')).toBe(true)
    expect(hasBranchRole(rs, 'manager')).toBe(true)
    expect(hasBranchRole(rs, 'owner')).toBe(false)
  })
})

// ── Properties over arbitrary rows ────────────────────────────────────────────

const userIdArb = fc.constantFrom('u1', 'u2', 'u3')
const branchIdArb = fc.constantFrom('b1', 'b2', 'b3', 'b4')
const roleArb = fc.option(fc.constantFrom(...BRANCH_ROLES, 'customer', 'other'), { nil: null })

const branchesArb = fc
  .uniqueArray(
    fc.record({
      id: branchIdArb,
      name: fc.string({ maxLength: 4 }),
      code: fc.constant('C'),
      status: fc.constantFrom('operational', 'temporarily_closed', 'opens_soon', 'shutdown'),
      isPrimary: fc.boolean(),
      displayOrder: fc.integer({ min: 0, max: 3 }),
      ownerUserId: fc.option(userIdArb, { nil: null }),
      managerUserId: fc.option(userIdArb, { nil: null }),
    }),
    { selector: (row) => row.id, maxLength: 4 },
  )
  .map((rows) => rows as BranchAccessBranchRow[])

const inputsArb: fc.Arbitrary<BranchAccessInputs> = fc.record({
  user: fc.record({ id: userIdArb, role: roleArb }),
  branches: branchesArb,
  profile: fc.option(
    fc.record({
      branchId: fc.option(branchIdArb, { nil: null }),
      roleWitness: roleArb,
      isActive: fc.boolean(),
    }),
    { nil: null },
  ),
})

function expectedIds(inputs: BranchAccessInputs): Set<string> {
  const { user, branches, profile } = inputs
  const pick = (keep: (row: BranchAccessBranchRow) => boolean) =>
    new Set(branches.filter(keep).map((row) => row.id))
  switch (user.role) {
    case 'developer':
      return pick(() => true)
    case 'owner':
      return pick((row) => row.ownerUserId === user.id)
    case 'manager':
      return pick((row) => row.managerUserId === user.id)
    case 'receptionist':
    case 'staff':
      return profile?.isActive && profile.roleWitness === user.role
        ? pick((row) => row.id === profile.branchId)
        : new Set()
    default:
      return new Set()
  }
}

describe('branch access properties', () => {
  it('grants exactly the branches the rows allow, each once, with the current role', () => {
    fc.assert(
      fc.property(inputsArb, (inputs) => {
        const result = resolveBranchAccess(inputs)
        const got = result.branches.map((branch) => branch.id)
        expect(new Set(got).size).toBe(got.length)
        expect(new Set(got)).toEqual(expectedIds(inputs))
        for (const branch of result.branches) {
          expect(branch.role).toBe(inputs.user.role)
        }
      }),
    )
  })

  it('always chooses an accessible branch, and null only when there is none', () => {
    fc.assert(
      fc.property(inputsArb, fc.option(branchIdArb, { nil: null }), (inputs, wanted) => {
        const result = resolveBranchAccess(inputs)
        const active = chooseActiveBranch(result, wanted)
        if (result.branches.length === 0) {
          expect(active).toBeNull()
          return
        }
        expect(active).not.toBeNull()
        expect(result.branches.some((branch) => branch.id === active?.id)).toBe(true)
        if (wanted && result.branches.some((branch) => branch.id === wanted)) {
          expect(active?.id).toBe(wanted)
        }
      }),
    )
  })
})
