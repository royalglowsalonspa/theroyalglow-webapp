/************************************************************
 * Module Name  : branch/roles.test
 * Scope        : Business Logic — Branch roles (multi-branch R1)
 *
 * Description  : Each rule has an example case. A model-based property then
 *                runs random request sequences from random actors and checks
 *                that every accepted plan leaves the role relationships
 *                consistent: what the database constraints from migration
 *                0004 and the planned guards enforce.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { resolveBranchAccess } from './access'
import {
  applyRoleWrites,
  type BranchRoleRequest,
  planBranchRoleChange,
  type RolePlan,
  type RoleRefusal,
  type RoleSnapshot,
  roleInvariantViolations,
} from './roles'

const BASE: RoleSnapshot = {
  users: [
    { id: 'dev1', role: 'developer' },
    { id: 'own1', role: 'owner' },
    { id: 'own2', role: 'owner' },
    { id: 'mgr1', role: 'manager' },
    { id: 'rec1', role: 'receptionist' },
    { id: 'sty1', role: 'staff' },
    { id: 'cus1', role: 'customer' },
    { id: 'cus2', role: 'customer' },
    { id: 'cus3', role: null },
  ],
  profiles: [
    {
      userId: 'mgr1',
      designation: 'manager',
      branchId: null,
      roleWitness: 'manager',
      isActive: true,
    },
    {
      userId: 'rec1',
      designation: 'receptionist',
      branchId: 'rs',
      roleWitness: 'receptionist',
      isActive: true,
    },
    {
      userId: 'sty1',
      designation: 'stylist',
      branchId: 'rs',
      roleWitness: 'staff',
      isActive: true,
    },
  ],
  branches: [
    { id: 'rs', status: 'operational', ownerUserId: 'own1', managerUserId: 'mgr1' },
    { id: 'mh', status: 'operational', ownerUserId: 'own1', managerUserId: null },
    { id: 'x3', status: 'opens_soon', ownerUserId: 'own2', managerUserId: null },
  ],
}

function actorIn(snapshot: RoleSnapshot, id: string) {
  const role = snapshot.users.find((u) => u.id === id)?.role ?? null
  const profile = snapshot.profiles.find((p) => p.userId === id) ?? null
  return {
    id,
    access: resolveBranchAccess({
      user: { id, role },
      branches: snapshot.branches.map((b, index) => ({
        ...b,
        name: b.id,
        code: b.id.toUpperCase(),
        isPrimary: index === 0,
        displayOrder: index,
      })),
      profile,
    }),
  }
}

function plan(actorId: string, request: BranchRoleRequest, snapshot = BASE) {
  return planBranchRoleChange(snapshot, actorIn(snapshot, actorId), request)
}

function accepted(result: RolePlan | RoleRefusal): RolePlan {
  if (!result.ok) {
    throw new Error(`refused: ${result.message}`)
  }
  return result
}

function after(actorId: string, request: BranchRoleRequest, snapshot = BASE) {
  const next = applyRoleWrites(snapshot, accepted(plan(actorId, request, snapshot)).writes)
  expect(roleInvariantViolations(next)).toEqual([])
  return next
}

const roleOf = (s: RoleSnapshot, id: string) => s.users.find((u) => u.id === id)?.role
const profileOf = (s: RoleSnapshot, id: string) => s.profiles.find((p) => p.userId === id)
const branchOf = (s: RoleSnapshot, id: string) => s.branches.find((b) => b.id === id)

describe('the starting snapshot', () => {
  it('is consistent', () => {
    expect(roleInvariantViolations(BASE)).toEqual([])
  })
})

describe('Owner', () => {
  it('lets only the Developer change it; the old Owner keeps other branches', () => {
    expect(
      plan('own1', { kind: 'set_owner', branchId: 'mh', userId: 'cus1', expectedHolderId: 'own1' }),
    ).toMatchObject({ ok: false, code: 'forbidden' })

    const next = after('dev1', {
      kind: 'set_owner',
      branchId: 'mh',
      userId: 'cus1',
      expectedHolderId: 'own1',
    })
    expect(branchOf(next, 'mh')?.ownerUserId).toBe('cus1')
    expect(roleOf(next, 'cus1')).toBe('owner')
    expect(roleOf(next, 'own1')).toBe('owner')
  })

  it('makes an Owner left without a branch a Customer and signs them out', () => {
    const result = accepted(
      plan('dev1', { kind: 'set_owner', branchId: 'x3', userId: 'cus1', expectedHolderId: 'own2' }),
    )
    expect(result.signedOut).toEqual(['own2'])
    expect(roleOf(applyRoleWrites(BASE, result.writes), 'own2')).toBe('customer')
  })

  it('refuses someone who holds another role, and a stale holder', () => {
    expect(
      plan('dev1', { kind: 'set_owner', branchId: 'mh', userId: 'mgr1', expectedHolderId: 'own1' }),
    ).toMatchObject({ ok: false, code: 'unavailable' })
    expect(
      plan('dev1', { kind: 'set_owner', branchId: 'mh', userId: 'cus1', expectedHolderId: 'own2' }),
    ).toMatchObject({ ok: false, code: 'stale' })
  })
})

describe('Manager', () => {
  it('lets the Owner add their Manager to another branch they own', () => {
    const next = after('own1', {
      kind: 'set_manager',
      branchId: 'mh',
      userId: 'mgr1',
      expectedHolderId: null,
    })
    expect(branchOf(next, 'mh')?.managerUserId).toBe('mgr1')
    expect(roleOf(next, 'mgr1')).toBe('manager')
  })

  it('replaces a Manager, demoting the old one when it was their only branch', () => {
    const result = accepted(
      plan('own1', {
        kind: 'set_manager',
        branchId: 'rs',
        userId: 'cus1',
        expectedHolderId: 'mgr1',
      }),
    )
    const next = applyRoleWrites(BASE, result.writes)
    expect(roleInvariantViolations(next)).toEqual([])
    expect(roleOf(next, 'cus1')).toBe('manager')
    expect(profileOf(next, 'cus1')).toMatchObject({
      roleWitness: 'manager',
      branchId: null,
      isActive: true,
    })
    expect(roleOf(next, 'mgr1')).toBe('customer')
    expect(result.signedOut).toEqual(['mgr1'])
  })

  it('keeps a replaced Manager who still manages another branch', () => {
    const shared = after('own1', {
      kind: 'set_manager',
      branchId: 'mh',
      userId: 'mgr1',
      expectedHolderId: null,
    })
    const next = after(
      'own1',
      { kind: 'set_manager', branchId: 'rs', userId: 'cus1', expectedHolderId: 'mgr1' },
      shared,
    )
    expect(roleOf(next, 'mgr1')).toBe('manager')
    expect(branchOf(next, 'mh')?.managerUserId).toBe('mgr1')
  })

  it('refuses an Owner as Manager, a Manager choosing a Manager, and another Owner', () => {
    expect(
      plan('dev1', { kind: 'set_manager', branchId: 'x3', userId: 'own1', expectedHolderId: null }),
    ).toMatchObject({ ok: false, code: 'unavailable' })
    expect(
      plan('mgr1', {
        kind: 'set_manager',
        branchId: 'rs',
        userId: 'cus1',
        expectedHolderId: 'mgr1',
      }),
    ).toMatchObject({ ok: false, code: 'forbidden' })
    // A branch the Manager doesn't manage reads as not found, not forbidden.
    expect(
      plan('mgr1', { kind: 'set_manager', branchId: 'mh', userId: 'cus1', expectedHolderId: null }),
    ).toMatchObject({ ok: false, code: 'not_found' })
    expect(
      plan('own2', {
        kind: 'set_manager',
        branchId: 'rs',
        userId: 'cus1',
        expectedHolderId: 'mgr1',
      }),
    ).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('promotes Staff to Manager only when the actor can reach their branch', () => {
    const next = after('own1', {
      kind: 'set_manager',
      branchId: 'mh',
      userId: 'sty1',
      expectedHolderId: null,
    })
    expect(profileOf(next, 'sty1')).toMatchObject({
      roleWitness: 'manager',
      branchId: null,
      designation: 'manager',
    })

    const atX3 = {
      ...BASE,
      profiles: BASE.profiles.map((p) => (p.userId === 'sty1' ? { ...p, branchId: 'x3' } : p)),
    }
    expect(
      plan(
        'own1',
        { kind: 'set_manager', branchId: 'mh', userId: 'sty1', expectedHolderId: null },
        atX3,
      ),
    ).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('removes a Manager', () => {
    const next = after('own1', { kind: 'remove', branchId: 'rs', userId: 'mgr1' })
    expect(branchOf(next, 'rs')?.managerUserId).toBeNull()
    expect(roleOf(next, 'mgr1')).toBe('customer')
  })
})

describe('Receptionist', () => {
  it('replaces the Receptionist with one deactivation before the activation', () => {
    const result = accepted(
      plan('own1', {
        kind: 'set_receptionist',
        branchId: 'rs',
        userId: 'cus1',
        expectedHolderId: 'rec1',
      }),
    )
    const kinds = result.writes.map((w) => `${w.kind}:${'userId' in w ? w.userId : ''}`)
    expect(kinds.indexOf('profile_deactivate:rec1')).toBeLessThan(
      kinds.indexOf('profile_activate:cus1'),
    )
    const next = applyRoleWrites(BASE, result.writes)
    expect(roleInvariantViolations(next)).toEqual([])
    expect(roleOf(next, 'rec1')).toBe('customer')
  })

  it('promotes a Stylist at the same branch, refuses one from another branch', () => {
    const next = after('own1', {
      kind: 'set_receptionist',
      branchId: 'rs',
      userId: 'sty1',
      expectedHolderId: 'rec1',
    })
    expect(profileOf(next, 'sty1')).toMatchObject({ roleWitness: 'receptionist', branchId: 'rs' })
    expect(
      plan('own1', {
        kind: 'set_receptionist',
        branchId: 'mh',
        userId: 'sty1',
        expectedHolderId: null,
      }),
    ).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('is not for Managers to choose', () => {
    expect(
      plan('mgr1', {
        kind: 'set_receptionist',
        branchId: 'rs',
        userId: 'cus1',
        expectedHolderId: 'rec1',
      }),
    ).toMatchObject({ ok: false, code: 'forbidden' })
    expect(plan('mgr1', { kind: 'remove', branchId: 'rs', userId: 'rec1' })).toMatchObject({
      ok: false,
      code: 'forbidden',
    })
  })
})

describe('Stylists and Therapists', () => {
  it('lets the Manager add and remove them at their branch', () => {
    const next = after('mgr1', {
      kind: 'add_staff',
      branchId: 'rs',
      userId: 'cus1',
      designation: 'therapist',
      specialization: 'Deep tissue',
    })
    expect(profileOf(next, 'cus1')).toMatchObject({
      designation: 'therapist',
      roleWitness: 'staff',
      branchId: 'rs',
    })
    const removed = after('mgr1', { kind: 'remove', branchId: 'rs', userId: 'cus1' }, next)
    expect(roleOf(removed, 'cus1')).toBe('customer')
    expect(profileOf(removed, 'cus1')).toMatchObject({ isActive: false, roleWitness: null })
  })

  it('refuses someone already working elsewhere and a shut-down branch', () => {
    expect(
      plan('own1', { kind: 'add_staff', branchId: 'mh', userId: 'sty1', designation: 'stylist' }),
    ).toMatchObject({ ok: false, code: 'unavailable' })
    const shut = {
      ...BASE,
      branches: BASE.branches.map((b) =>
        b.id === 'mh' ? { ...b, status: 'shutdown' as const } : b,
      ),
    }
    expect(
      plan(
        'own1',
        { kind: 'add_staff', branchId: 'mh', userId: 'cus1', designation: 'stylist' },
        shut,
      ),
    ).toMatchObject({ ok: false, code: 'invalid' })
  })

  it('never lets Staff or Receptionists manage people', () => {
    expect(
      plan('rec1', { kind: 'add_staff', branchId: 'rs', userId: 'cus1', designation: 'stylist' }),
    ).toMatchObject({ ok: false, code: 'forbidden' })
  })
})

describe('protections', () => {
  it('refuses changing yourself, the Developer, and an Owner through remove', () => {
    expect(plan('own1', { kind: 'remove', branchId: 'rs', userId: 'own1' })).toMatchObject({
      ok: false,
      code: 'forbidden',
    })
    expect(
      plan('own1', { kind: 'add_staff', branchId: 'rs', userId: 'dev1', designation: 'stylist' }),
    ).toMatchObject({ ok: false, code: 'forbidden' })
    expect(plan('dev1', { kind: 'remove', branchId: 'rs', userId: 'own1' })).toMatchObject({
      ok: false,
      code: 'invalid',
    })
  })

  it('treats a repeated request as already done', () => {
    expect(
      accepted(
        plan('own1', {
          kind: 'set_manager',
          branchId: 'rs',
          userId: 'mgr1',
          expectedHolderId: 'mgr1',
        }),
      ).writes,
    ).toEqual([])
  })
})

// ── Model-based property: invariants survive any sequence ─────────────────────

const actorIds = ['dev1', 'own1', 'own2', 'mgr1', 'rec1', 'sty1', 'cus1']
const userIds = BASE.users.map((u) => u.id)
const branchIds = BASE.branches.map((b) => b.id)

type Step = {
  actor: string
  kind: BranchRoleRequest['kind']
  branchId: string
  userId: string
  designation: 'stylist' | 'therapist'
}

const stepArb: fc.Arbitrary<Step> = fc.record({
  actor: fc.constantFrom(...actorIds),
  kind: fc.constantFrom('set_owner', 'set_manager', 'set_receptionist', 'add_staff', 'remove'),
  branchId: fc.constantFrom(...branchIds),
  userId: fc.constantFrom(...userIds),
  designation: fc.constantFrom('stylist', 'therapist'),
})

function toRequest(step: Step, snapshot: RoleSnapshot): BranchRoleRequest {
  const branch = branchOf(snapshot, step.branchId)
  switch (step.kind) {
    case 'set_owner':
      return {
        kind: step.kind,
        branchId: step.branchId,
        userId: step.userId,
        expectedHolderId: branch?.ownerUserId ?? null,
      }
    case 'set_manager':
      return {
        kind: step.kind,
        branchId: step.branchId,
        userId: step.userId,
        expectedHolderId: branch?.managerUserId ?? null,
      }
    case 'set_receptionist': {
      const holder = snapshot.profiles.find(
        (p) => p.isActive && p.roleWitness === 'receptionist' && p.branchId === step.branchId,
      )
      return {
        kind: step.kind,
        branchId: step.branchId,
        userId: step.userId,
        expectedHolderId: holder?.userId ?? null,
      }
    }
    case 'add_staff':
      return {
        kind: step.kind,
        branchId: step.branchId,
        userId: step.userId,
        designation: step.designation,
      }
    case 'remove':
      return { kind: step.kind, branchId: step.branchId, userId: step.userId }
  }
}

describe('role change properties', () => {
  it('keeps every role relationship consistent across any sequence of accepted changes', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 25 }), (steps) => {
        let snapshot = BASE
        for (const step of steps) {
          const result = planBranchRoleChange(
            snapshot,
            actorIn(snapshot, step.actor),
            toRequest(step, snapshot),
          )
          if (!result.ok) {
            continue
          }
          const next = applyRoleWrites(snapshot, result.writes)
          expect(roleInvariantViolations(next)).toEqual([])
          // Exactly the people demoted to Customer are signed out.
          for (const id of result.signedOut) {
            expect(roleOf(next, id)).toBe('customer')
          }
          // The Developer is never touched.
          expect(roleOf(next, 'dev1')).toBe('developer')
          snapshot = next
        }
      }),
      { numRuns: 300 },
    )
  })

  it('never lets an actor change a branch they cannot reach', () => {
    fc.assert(
      fc.property(stepArb, (step) => {
        const actor = actorIn(BASE, step.actor)
        const result = planBranchRoleChange(BASE, actor, toRequest(step, BASE))
        if (result.ok && result.writes.length > 0) {
          expect(actor.access.branches.some((b) => b.id === step.branchId)).toBe(true)
        }
      }),
    )
  })
})
