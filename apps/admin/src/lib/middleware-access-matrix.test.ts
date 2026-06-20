/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : middleware-access-matrix.test
 * Scope        : Example-based access-matrix unit tests for the RBAC core
 *
 * Description  : Explicit, table-driven Vitest unit tests that enumerate the
 *                concrete admin routes × roles decision matrix and the
 *                auth-state → action mapping, exercising the pure functions in
 *                `lib/rbac.ts` (resolveRoleLevel, routeMinLevel, decide).
 *
 * Notes        : Complements the fast-check property tests in `rbac.test.ts`
 *                (P1/P2/P3) with concrete, human-readable examples. Kept in a
 *                SEPARATE file so it never clobbers the property tests.
 *
 * Requirements : 15.1
 ************************************************************/

import { describe, expect, it } from 'vitest'
import { type AuthState, decide, resolveRoleLevel, routeMinLevel } from './rbac'

// Feature: admin-subdomain-migration — example-based middleware access matrix
// Validates: Requirements 15.1

/** The six documented roles and their expected resolved levels. */
const ROLES = ['customer', 'staff', 'receptionist', 'manager', 'owner', 'developer'] as const
type RoleName = (typeof ROLES)[number]

/** Expected resolved level per role (mirrors ROLE_LEVELS in the design). */
const ROLE_LEVEL: Record<RoleName, number> = {
  customer: 0,
  staff: 1,
  receptionist: 2,
  manager: 3,
  owner: 4,
  developer: 5,
}

/**
 * Every known admin route (Root-Path Convention) and the minimum role that
 * must be allowed, taken straight from the design's route → min-role mapping:
 *   - Receptionist (2): ops/crm/billing/leave/memberships/waitlist + dashboard
 *   - Manager (3):      services/offers/staff/schedule/reports/settings
 *   - Owner (4):        branches/users
 *   - Developer (5):    integrations/logs
 */
const ROUTE_MIN_ROLE: ReadonlyArray<readonly [string, RoleName]> = [
  ['/', 'receptionist'],
  ['/bookings', 'receptionist'],
  ['/customers', 'receptionist'],
  ['/leads', 'receptionist'],
  ['/billing', 'receptionist'],
  ['/leave', 'receptionist'],
  ['/memberships', 'receptionist'],
  ['/waitlist', 'receptionist'],
  ['/services', 'manager'],
  ['/offers', 'manager'],
  ['/staff', 'manager'],
  ['/schedule', 'manager'],
  ['/reports', 'manager'],
  ['/settings', 'manager'],
  ['/branches', 'owner'],
  ['/users', 'owner'],
  ['/integrations', 'developer'],
  ['/logs', 'developer'],
] as const

/** True when a valid session at `role` is allowed onto `route`. */
function isAllowed(route: string, role: RoleName): boolean {
  const state: AuthState = {
    kind: 'valid',
    roleLevel: resolveRoleLevel(role),
  }
  return decide(state, routeMinLevel(route)).action === 'allow'
}

describe('Middleware access matrix: roles × routes (valid sessions)', () => {
  // Build the full cross-product so every (route, role) pair is its own case.
  const matrix = ROUTE_MIN_ROLE.flatMap(([route, minRole]) =>
    ROLES.map((role) => {
      const expected = ROLE_LEVEL[role] >= ROLE_LEVEL[minRole]
      return {
        route,
        role,
        minRole,
        expected,
        label: `${role} ${expected ? 'is allowed on' : 'is forbidden on'} ${route} (min ${minRole})`,
      }
    }),
  )

  it.each(matrix)('$label', ({ route, role, expected }) => {
    expect(isAllowed(route, role)).toBe(expected)
  })

  // Spot-check the boundary rows explicitly for documentation value.
  it('allows exactly the minimum role and everything above it', () => {
    // Receptionist tier: receptionist..developer allowed; customer/staff not.
    expect(isAllowed('/bookings', 'staff')).toBe(false)
    expect(isAllowed('/bookings', 'receptionist')).toBe(true)
    expect(isAllowed('/bookings', 'developer')).toBe(true)

    // Manager tier: manager..developer allowed; receptionist not.
    expect(isAllowed('/services', 'receptionist')).toBe(false)
    expect(isAllowed('/services', 'manager')).toBe(true)
    expect(isAllowed('/services', 'owner')).toBe(true)

    // Owner tier: owner/developer allowed; manager not.
    expect(isAllowed('/users', 'manager')).toBe(false)
    expect(isAllowed('/users', 'owner')).toBe(true)
    expect(isAllowed('/users', 'developer')).toBe(true)

    // Developer tier: only developer allowed; owner not.
    expect(isAllowed('/logs', 'owner')).toBe(false)
    expect(isAllowed('/integrations', 'developer')).toBe(true)
  })

  it('forbids the customer role on every admin route', () => {
    for (const [route] of ROUTE_MIN_ROLE) {
      expect(isAllowed(route, 'customer')).toBe(false)
    }
  })

  it('allows the developer role on every admin route', () => {
    for (const [route] of ROUTE_MIN_ROLE) {
      expect(isAllowed(route, 'developer')).toBe(true)
    }
  })

  it('treats nested sub-paths the same as their route prefix', () => {
    // Longest-prefix match means /users/123 inherits /users (Owner) min level.
    expect(isAllowed('/users/123', 'manager')).toBe(false)
    expect(isAllowed('/users/123', 'owner')).toBe(true)
    expect(isAllowed('/bookings/abc/edit', 'staff')).toBe(false)
    expect(isAllowed('/bookings/abc/edit', 'receptionist')).toBe(true)
  })
})

describe('Middleware access matrix: auth-state → action mapping', () => {
  // A couple of representative routes spanning two min-role tiers.
  const REPRESENTATIVE_ROUTES = ['/bookings', '/logs'] as const

  const nonValidCases: ReadonlyArray<{
    state: AuthState
    expectedAction: 'redirect' | 'clear_and_redirect'
  }> = [
    { state: { kind: 'no_cookie' }, expectedAction: 'redirect' },
    { state: { kind: 'invalid' }, expectedAction: 'clear_and_redirect' },
    { state: { kind: 'error' }, expectedAction: 'redirect' },
  ]

  const cases = REPRESENTATIVE_ROUTES.flatMap((route) =>
    nonValidCases.map(({ state, expectedAction }) => ({
      route,
      kind: state.kind,
      state,
      expectedAction,
      label: `${state.kind} → ${expectedAction} on ${route}`,
    })),
  )

  it.each(cases)('$label', ({ route, state, expectedAction }) => {
    expect(decide(state, routeMinLevel(route)).action).toBe(expectedAction)
  })

  it('never allows or forbids for non-valid auth states', () => {
    for (const route of REPRESENTATIVE_ROUTES) {
      for (const { state } of nonValidCases) {
        const { action } = decide(state, routeMinLevel(route))
        expect(action === 'allow' || action === 'forbid').toBe(false)
      }
    }
  })
})
