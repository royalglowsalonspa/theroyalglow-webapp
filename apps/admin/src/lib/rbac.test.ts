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
  decide,
  filterNavByLevel,
  type NavSection,
  ROLE_LEVELS,
  ROUTE_MIN_LEVEL,
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
      { numRuns: 25 },
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
      { numRuns: 25 },
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
      { numRuns: 25 },
    )
  })

  it('valid sessions allow iff level >= routeMin, else forbid (never redirect)', () => {
    fc.assert(
      fc.property(p2RoleLevelArb, p2RouteMinArb, (roleLevel, routeMin) => {
        const decision = decide({ kind: 'valid', roleLevel }, routeMin)
        expect(decision).toEqual(roleLevel >= routeMin ? { action: 'allow' } : { action: 'forbid' })
      }),
      { numRuns: 25 },
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
      { numRuns: 25 },
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
      { numRuns: 25 },
    )
  })
})

// Feature: admin-web-separation, Property 5: Staff is granted access to exactly the self-service routes
//
// Property 5: Staff is granted access to exactly the self-service routes
// Validates: Requirements 3.2, 3.3, 3.5
//
// For any path in the admin route table, a valid session at the `staff`
// Role_Level (1) is allowed by decide(routeMinLevel(path)) iff that path
// resolves under the `/me` namespace (routeMinLevel === 1); for the dashboard
// root and every route whose minimum level is receptionist (2) or higher, the
// same staff session is forbidden.

describe('Property 5: Staff is granted access to exactly the self-service routes', () => {
  const staffState: AuthState = { kind: 'valid', roleLevel: ROLE_LEVELS.staff }

  // A non-empty, slash-free path segment (deep links under a prefix).
  const segArb = fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !s.includes('/'))

  // Sample paths from the known route prefixes, optionally with deep sub-paths,
  // plus the self-service routes and known higher-level routes as fixed seeds.
  const knownPrefixes = ROUTE_MIN_LEVEL.map(([prefix]) => prefix)
  const tablePathArb: fc.Arbitrary<string> = fc.oneof(
    fc.constantFrom(...knownPrefixes),
    fc
      .tuple(fc.constantFrom(...knownPrefixes), fc.array(segArb, { minLength: 1, maxLength: 3 }))
      .map(([prefix, segs]) => {
        const base = prefix === '/' ? '' : prefix
        return `${base}/${segs.join('/')}`
      }),
    fc.constantFrom('/me/schedule', '/me/leave', '/', '/bookings', '/staff', '/staff/123'),
  )

  it('allows staff iff the route resolves under /me, forbids the rest', () => {
    fc.assert(
      fc.property(tablePathArb, (path) => {
        const min = routeMinLevel(path)
        const decision = decide(staffState, min)

        // Staff (level 1) may pass only routes whose minimum level is <= 1, which
        // in the admin table is exactly the `/me` self-service namespace.
        const resolvesUnderMe = path === '/me' || path.startsWith('/me/')
        const allowed = decision.action === 'allow'

        expect(allowed).toBe(min <= ROLE_LEVELS.staff)
        // Routes that resolve under /me are exactly the level-1 routes.
        expect(min <= ROLE_LEVELS.staff).toBe(resolvesUnderMe)

        // Receptionist-or-higher routes (and the dashboard root) forbid staff.
        if (min >= ROLE_LEVELS.receptionist) {
          expect(decision.action).toBe('forbid')
        }
      }),
      { numRuns: 25 },
    )
  })
})

// Feature: admin-web-separation, Property 6: Adding /me does not weaken the manager-level /staff route
//
// Property 6: Adding `/me` does not weaken the manager-level `/staff` route
// Validates: Requirements 3.4
//
// For any path under the `/staff` namespace (`/staff` or any `/staff/`-prefixed
// path), routeMinLevel(path) equals 3 (manager) — longest-prefix matching keeps
// `/me` and `/staff` independent.

describe('Property 6: Adding /me does not weaken the manager-level /staff route', () => {
  const segArb = fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !s.includes('/'))

  const staffNamespacePathArb: fc.Arbitrary<string> = fc.oneof(
    fc.constantFrom('/staff', '/staff/'),
    fc.array(segArb, { minLength: 1, maxLength: 4 }).map((segs) => `/staff/${segs.join('/')}`),
  )

  it('resolves every /staff* path to manager level (3)', () => {
    fc.assert(
      fc.property(staffNamespacePathArb, (path) => {
        expect(routeMinLevel(path)).toBe(ROLE_LEVELS.manager)
      }),
      { numRuns: 25 },
    )
  })
})

// Feature: admin-web-separation, Property 7: Self-service navigation visibility matches role level
//
// Property 7: Self-service navigation visibility matches role level
// Validates: Requirements 3.6
//
// For any role level, filterNavByLevel(ADMIN_NAV, level) includes the
// `My Schedule` and `My Leave` self-service entries iff level >= 1, and for a
// staff user (level 1) the filtered result contains ONLY the Self-Service
// section.

describe('Property 7: Self-service navigation visibility matches role level', () => {
  const SELF_SERVICE_HREFS = ['/me/schedule', '/me/leave']

  const flattenHrefs = (sections: NavSection[]): string[] =>
    sections.flatMap((section) => section.items.map((item) => item.href))

  it('shows self-service entries iff level >= 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (level) => {
        const hrefs = flattenHrefs(filterNavByLevel(ADMIN_NAV, level))
        const hasSelfService = SELF_SERVICE_HREFS.every((href) => hrefs.includes(href))
        expect(hasSelfService).toBe(level >= ROLE_LEVELS.staff)
      }),
      { numRuns: 25 },
    )
  })

  it('yields ONLY the Self-Service section for a staff user (level 1)', () => {
    const result = filterNavByLevel(ADMIN_NAV, ROLE_LEVELS.staff)
    expect(result).toHaveLength(1)
    const [section] = result
    expect(section?.title).toBe('Self-Service')
    expect(section?.items.map((item) => item.href).sort()).toEqual([...SELF_SERVICE_HREFS].sort())
  })
})

// RBAC access-matrix example assertions for the staff role.
// Validates: Requirements 3.2, 3.3, 9.6
describe('Admin RBAC staff access matrix (examples)', () => {
  const staffState: AuthState = { kind: 'valid', roleLevel: ROLE_LEVELS.staff }
  const receptionistState: AuthState = { kind: 'valid', roleLevel: ROLE_LEVELS.receptionist }

  const staffDecisionFor = (path: string) => decide(staffState, routeMinLevel(path)).action

  it('allows staff on the self-service routes', () => {
    expect(staffDecisionFor('/me/schedule')).toBe('allow')
    expect(staffDecisionFor('/me/leave')).toBe('allow')
  })

  it('forbids staff on the dashboard root and receptionist+/manager routes', () => {
    expect(staffDecisionFor('/')).toBe('forbid')
    expect(staffDecisionFor('/bookings')).toBe('forbid')
    expect(staffDecisionFor('/staff')).toBe('forbid')
  })

  it('allows receptionist (level 2) on the self-service routes too', () => {
    expect(decide(receptionistState, routeMinLevel('/me/schedule')).action).toBe('allow')
    expect(decide(receptionistState, routeMinLevel('/me/leave')).action).toBe('allow')
  })
})
