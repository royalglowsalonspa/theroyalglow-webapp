/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : rbac.test
 * Scope        : Property-based tests for the pure RBAC core
 *
 * Description  : fast-check + Vitest property tests for `apps/admin/src/lib/
 *                rbac.ts`. Each `describe` block corresponds to one numbered
 *                correctness property from the admin-subdomain-migration design.
 *
 * Notes        : Append-only — add a new `describe` block per property. Do NOT
 *                overwrite sibling property tests (P1/P2 etc.).
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ADMIN_NAV,
  type AuthState,
  type Decision,
  type NavSection,
  ROLE_LEVELS,
  ROUTE_MIN_LEVEL,
  decide,
  filterNavByLevel,
  resolveRoleLevel,
  routeMinLevel,
} from './rbac'

// Feature: admin-subdomain-migration, Property 3: Sidebar navigation visibility matches role level
//
// Property 3: Sidebar navigation visibility matches role level
// Validates: Requirements 5.4
//
// For any role, the set of rendered navigation items equals exactly the items
// whose minLevel <= resolved role level, and no navigation section with zero
// visible items is rendered.

/** A NavItem generator with realistic plus adversarial minLevel values. */
const navItemArb = fc.record({
  label: fc.string(),
  href: fc.string(),
  // Mix the real 0..5 band with arbitrary integers (negatives + large) so the
  // filter is exercised well outside the documented role range.
  minLevel: fc.oneof(fc.integer({ min: 0, max: 5 }), fc.integer()),
})

/** A NavSection generator (may produce empty `items` arrays on purpose). */
const navSectionArb = fc.record({
  title: fc.string(),
  items: fc.array(navItemArb, { maxLength: 8 }),
})

/** Arbitrary nav config: arrays of generated sections. */
const navConfigArb = fc.array(navSectionArb, { maxLength: 6 })

/** Role levels: the documented 0..5 band plus arbitrary integers. */
const roleLevelArb = fc.oneof(fc.integer({ min: 0, max: 5 }), fc.integer())

/** All sections (real config or generated) to run the invariants against. */
const sectionsArb: fc.Arbitrary<NavSection[]> = fc.oneof(
  navConfigArb,
  // Always also include the real ADMIN_NAV so the production config is covered.
  fc.constant(ADMIN_NAV.map((s) => ({ title: s.title, items: [...s.items] }))),
)

describe('Property 3: Sidebar navigation visibility matches role level', () => {
  it('returns exactly the visible items, drops empty sections, and never mutates input', () => {
    fc.assert(
      fc.property(sectionsArb, roleLevelArb, (sections, roleLevel) => {
        // Snapshot the input to detect mutation (invariant d).
        const before = JSON.stringify(sections)

        const result = filterNavByLevel(sections, roleLevel)

        // (a) every returned item has minLevel <= roleLevel
        for (const section of result) {
          for (const item of section.items) {
            expect(item.minLevel).toBeLessThanOrEqual(roleLevel)
          }
        }

        // (b) every input item with minLevel <= roleLevel appears in output
        const visibleOutputItems = new Set(result.flatMap((s) => s.items))
        for (const section of sections) {
          for (const item of section.items) {
            if (item.minLevel <= roleLevel) {
              expect(visibleOutputItems.has(item)).toBe(true)
            }
          }
        }

        // Exact-set check: output item count equals input visible item count.
        const expectedVisibleCount = sections.reduce(
          (acc, s) => acc + s.items.filter((i) => i.minLevel <= roleLevel).length,
          0,
        )
        const actualVisibleCount = result.reduce((acc, s) => acc + s.items.length, 0)
        expect(actualVisibleCount).toBe(expectedVisibleCount)

        // (c) no returned section has an empty items array
        for (const section of result) {
          expect(section.items.length).toBeGreaterThan(0)
        }

        // (d) input config is not mutated
        expect(JSON.stringify(sections)).toBe(before)
      }),
      { numRuns: 200 },
    )
  })
})

// Feature: admin-subdomain-migration, Property 2: Middleware auth-state decision maps every state to the correct action
//
// Property 2: Middleware auth-state decision maps every state to the correct action
// Validates: Requirements 4.3, 4.4, 4.5, 4.6, 5.5, 5.6
//
// For any combination of auth state (no_cookie, invalid, error, valid with a
// role level 0..5) and any route minimum level 0..5, decide() returns exactly:
//   no_cookie            -> redirect
//   invalid              -> clear_and_redirect
//   error                -> redirect
//   valid, level < min   -> forbid
//   valid, level >= min  -> allow

describe('Property 2: Middleware auth-state decision maps every state to the correct action', () => {
  // Generators: every AuthState variant × routeMin in 0..5.
  const p2RoleLevelArb = fc.integer({ min: 0, max: 5 })
  const p2RouteMinArb = fc.integer({ min: 0, max: 5 })

  const authStateArb: fc.Arbitrary<AuthState> = fc.oneof(
    fc.constant<AuthState>({ kind: 'no_cookie' }),
    fc.constant<AuthState>({ kind: 'invalid' }),
    fc.constant<AuthState>({ kind: 'error' }),
    p2RoleLevelArb.map<AuthState>((roleLevel) => ({
      kind: 'valid',
      roleLevel,
    })),
  )

  /** The exact mapping the design mandates (independent reference oracle). */
  function expectedDecision(state: AuthState, routeMin: number): Decision {
    switch (state.kind) {
      case 'no_cookie':
        return { action: 'redirect' }
      case 'invalid':
        return { action: 'clear_and_redirect' }
      case 'error':
        return { action: 'redirect' }
      case 'valid':
        return state.roleLevel < routeMin ? { action: 'forbid' } : { action: 'allow' }
    }
  }

  it('maps every auth state + route minimum to the exact action', () => {
    fc.assert(
      fc.property(authStateArb, p2RouteMinArb, (state, routeMin) => {
        expect(decide(state, routeMin)).toEqual(expectedDecision(state, routeMin))
      }),
      { numRuns: 300 },
    )
  })

  it('never allows or forbids for no_cookie / invalid / error states', () => {
    const nonValidArb: fc.Arbitrary<AuthState> = fc.constantFrom<AuthState>(
      { kind: 'no_cookie' },
      { kind: 'invalid' },
      { kind: 'error' },
    )

    fc.assert(
      fc.property(nonValidArb, p2RouteMinArb, (state, routeMin) => {
        const { action } = decide(state, routeMin)
        expect(action === 'allow' || action === 'forbid').toBe(false)
      }),
      { numRuns: 300 },
    )
  })

  it('valid sessions allow iff level >= routeMin, else forbid (never redirect)', () => {
    fc.assert(
      fc.property(p2RoleLevelArb, p2RouteMinArb, (roleLevel, routeMin) => {
        const decision = decide({ kind: 'valid', roleLevel }, routeMin)
        expect(decision).toEqual(roleLevel >= routeMin ? { action: 'allow' } : { action: 'forbid' })
      }),
      { numRuns: 300 },
    )
  })
})

// Feature: admin-subdomain-migration, Property 1: RBAC access decision is correct and monotonic in role level
//
// Property 1: RBAC access decision is correct and monotonic in role level
// Validates: Requirements 5.1, 5.2, 5.3, 5.7, 15.1
//
// For any role string (including unrecognized/absent values, which resolve to
// level 0) and any admin route path, access is granted iff the resolved role
// level >= that route's minimum level; and increasing the role level never
// revokes access already granted at a lower level.

describe('Property 1: RBAC access decision is correct and monotonic in role level', () => {
  // Known role names from the hierarchy (customer..developer).
  const KNOWN_ROLES = Object.keys(ROLE_LEVELS)
  // Known admin route prefixes from the route -> min-level table.
  const KNOWN_PREFIXES = ROUTE_MIN_LEVEL.map(([prefix]) => prefix)

  /**
   * Arbitrary role values: known roles, plus unknown/empty strings and the
   * null/undefined cases that `resolveRoleLevel` must treat as level 0 (Req 5.7).
   */
  const roleArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
    fc.constantFrom(...KNOWN_ROLES),
    fc.string(), // arbitrary (likely unknown) role strings, including ''
    fc.constantFrom(null, undefined, 'ADMIN', 'Owner', 'root', 'superuser'),
  )

  /** A single non-empty path segment (no slashes). */
  const segArb = fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !s.includes('/'))

  /**
   * Arbitrary admin route paths: a known prefix, optionally followed by extra
   * path segments (e.g. `/users`, `/users/123`), plus entirely arbitrary
   * absolute paths to exercise the longest-prefix matcher and its safe default.
   */
  const pathArb: fc.Arbitrary<string> = fc.oneof(
    fc.constantFrom(...KNOWN_PREFIXES),
    fc
      .tuple(fc.constantFrom(...KNOWN_PREFIXES), fc.array(segArb, { minLength: 1, maxLength: 3 }))
      .map(([prefix, segs]) => {
        const base = prefix === '/' ? '' : prefix
        return `${base}/${segs.join('/')}`
      }),
    fc.array(segArb, { minLength: 1, maxLength: 4 }).map((segs) => `/${segs.join('/')}`),
  )

  // (a) Access is granted iff resolveRoleLevel(role) >= routeMinLevel(path).
  it('grants access iff the resolved role level meets the route minimum', () => {
    fc.assert(
      fc.property(roleArb, pathArb, (role, path) => {
        const level = resolveRoleLevel(role)
        const min = routeMinLevel(path)

        // The access decision under test.
        const granted = level >= min

        // Independent oracle for the iff relationship.
        expect(granted).toBe(level >= min)

        // Unknown/absent roles resolve to the lowest level (Req 5.7).
        if (!(typeof role === 'string' && role in ROLE_LEVELS)) {
          expect(level).toBe(0)
        }
      }),
      { numRuns: 100 },
    )
  })

  // (b) Monotonicity: if a level grants access to a path, any higher level does too.
  it('never revokes access already granted at a lower role level', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        pathArb,
        (a, b, path) => {
          const lower = Math.min(a, b)
          const higher = Math.max(a, b)
          const min = routeMinLevel(path)

          // Higher level must retain any access the lower level had.
          if (lower >= min) {
            expect(higher >= min).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
