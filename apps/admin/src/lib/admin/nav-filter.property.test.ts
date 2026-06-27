/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : nav-filter.property.test
 * Scope        : Property-based test for role-level nav filtering
 *
 * Description  : fast-check + Vitest property test verifying that the reused
 *                `filterNavByLevel` from `@/lib/rbac` (consumed, NOT modified)
 *                filters the admin navigation correctly for the admin-portal
 *                redesign: every rendered item satisfies `item.minLevel <=
 *                roleLevel`, no section with zero visible items is rendered,
 *                and unresolved/unknown/absent roles are treated as the minimum
 *                Role_Level (0).
 *
 * Notes        : Presentation-layer test only. `rbac.ts` is consumed as-is —
 *                this file imports its pure helpers and asserts behaviour; it
 *                does not change RBAC logic (Req 16.3).
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ADMIN_NAV,
  MIN_ROLE_LEVEL,
  type NavSection,
  filterNavByLevel,
  resolveRoleLevel,
} from '@/lib/rbac'

// Feature: admin-portal-redesign, Property 4: Navigation filtering respects role level with no empty sections
//
// Property 4: Navigation filtering respects role level with no empty sections
// Validates: Requirements 4.2, 4.3, 4.4, 4.7
//
// For any role level — including 0 and out-of-range (negative / very large)
// values — the redesigned Sidebar derives its visible navigation from
// `filterNavByLevel(ADMIN_NAV, roleLevel)` such that:
//   (4.3) every rendered item satisfies `item.minLevel <= roleLevel`;
//   (4.2) every ADMIN_NAV item whose minLevel <= roleLevel is rendered
//         (exact-set equivalence with the documented config);
//   (4.4) no section with zero visible items is rendered;
//   (4.7) an unresolved/unknown/absent role is treated as the minimum
//         Role_Level (0) before filtering.

/**
 * Role levels under test: the documented 0..5 band plus arbitrary integers
 * (negatives and large out-of-range values) to exercise the filter well beyond
 * the role range, and 0 explicitly as a fixed seed.
 */
const roleLevelArb: fc.Arbitrary<number> = fc.oneof(
  fc.constant(0),
  fc.integer({ min: 0, max: 5 }),
  fc.integer(),
)

/** Defensive deep copy of the production config to detect any mutation. */
const cloneAdminNav = (): NavSection[] =>
  ADMIN_NAV.map((section) => ({ title: section.title, items: section.items.map((i) => ({ ...i })) }))

describe('Property 4: Navigation filtering respects role level with no empty sections', () => {
  it('renders exactly the items with minLevel <= roleLevel and drops empty sections', () => {
    fc.assert(
      fc.property(roleLevelArb, (roleLevel) => {
        const before = JSON.stringify(ADMIN_NAV)

        const result = filterNavByLevel(ADMIN_NAV, roleLevel)

        // (4.3) Every rendered item is visible at this role level.
        for (const section of result) {
          for (const item of section.items) {
            expect(item.minLevel).toBeLessThanOrEqual(roleLevel)
          }
        }

        // (4.4) No rendered section is empty (the helper omits empty sections,
        // including their titles).
        for (const section of result) {
          expect(section.items.length).toBeGreaterThan(0)
        }

        // (4.2) Exact-set equivalence: the rendered hrefs equal exactly the set
        // of ADMIN_NAV hrefs whose minLevel <= roleLevel.
        const renderedHrefs = result.flatMap((s) => s.items.map((i) => i.href)).sort()
        const expectedHrefs = ADMIN_NAV.flatMap((s) =>
          s.items.filter((i) => i.minLevel <= roleLevel).map((i) => i.href),
        ).sort()
        expect(renderedHrefs).toEqual(expectedHrefs)

        // The production ADMIN_NAV config is never mutated (consume-only).
        expect(JSON.stringify(ADMIN_NAV)).toBe(before)
      }),
      { numRuns: 25 },
    )
  })

  it('treats unresolved / unknown / absent roles as the minimum level (0) — Req 4.7', () => {
    // Arbitrary role values: unknown strings plus the null/undefined cases. None
    // of these are recognised roles, so all must resolve to MIN_ROLE_LEVEL (0).
    const unknownRoleArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
      fc.string().filter((s) => !['customer', 'staff', 'receptionist', 'manager', 'owner', 'developer'].includes(s)),
      fc.constantFrom(null, undefined, '', 'ADMIN', 'Owner', 'root', 'superuser'),
    )

    fc.assert(
      fc.property(unknownRoleArb, (role) => {
        const level = resolveRoleLevel(role)
        expect(level).toBe(MIN_ROLE_LEVEL)

        // Filtering at the resolved (minimum) level yields the same result as
        // filtering at level 0 directly, and — since every ADMIN_NAV item has
        // minLevel >= 1 — produces no visible sections (nothing leaks to an
        // unauthenticated/unknown role).
        const result = filterNavByLevel(ADMIN_NAV, level)
        expect(result).toEqual(filterNavByLevel(ADMIN_NAV, 0))
        for (const section of result) {
          for (const item of section.items) {
            expect(item.minLevel).toBeLessThanOrEqual(0)
          }
        }
      }),
      { numRuns: 25 },
    )
  })

  it('does not mutate the input config (works on a defensive copy too)', () => {
    fc.assert(
      fc.property(roleLevelArb, (roleLevel) => {
        const input = cloneAdminNav()
        const snapshot = JSON.stringify(input)

        filterNavByLevel(input, roleLevel)

        expect(JSON.stringify(input)).toBe(snapshot)
      }),
      { numRuns: 25 },
    )
  })
})
