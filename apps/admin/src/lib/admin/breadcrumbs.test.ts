/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : breadcrumbs.test
 * Scope        : Property-based tests for breadcrumb derivation
 *
 * Description  : fast-check + Vitest property tests for `apps/admin/src/lib/
 *                admin/breadcrumbs.ts`. Each `describe` block corresponds to one
 *                numbered correctness property from the admin-portal-redesign
 *                design.
 *
 * Notes        : Append-only — add a new `describe` block per property. Do NOT
 *                overwrite sibling property tests.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, type NavSection } from '@/lib/rbac'
import { type Crumb, deriveBreadcrumbs } from './breadcrumbs'

// Feature: admin-portal-redesign, Property 5: Breadcrumb derivation is well-formed
//
// Property 5: Breadcrumb derivation is well-formed
// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6
//
// For any pathname (the root '/', a section-root route, or a detail sub-route),
// deriveBreadcrumbs(pathname, ADMIN_NAV) returns a non-empty list ordered from
// the highest ancestor to the current page, in which exactly one crumb — the
// last — is marked `current` (the non-interactive current page), every earlier
// crumb is a link (`current: false`) with a non-empty href, and a top-level
// route (pathname exactly equal to a nav href) yields a single current crumb.

describe('Property 5: Breadcrumb derivation is well-formed', () => {
  /** Every Root-Path href defined in the production ADMIN_NAV config. */
  const NAV_HREFS: string[] = ADMIN_NAV.flatMap((section) => section.items.map((item) => item.href))

  /** Non-root nav hrefs (suitable bases for synthesised detail sub-routes). */
  const NON_ROOT_NAV_HREFS = NAV_HREFS.filter((href) => href !== '/')

  /** A single non-empty, slash-free path segment. */
  const segArb = fc
    .string({ minLength: 1, maxLength: 8 })
    .filter((s) => !s.includes('/') && s.trim() !== '')

  /** Exact nav-href routes (section roots + the dashboard root). */
  const exactRouteArb = fc.constantFrom(...NAV_HREFS)

  /** Detail sub-routes hanging off a known nav href (e.g. /bookings/123). */
  const subRouteArb = fc
    .tuple(fc.constantFrom(...NON_ROOT_NAV_HREFS), fc.array(segArb, { minLength: 1, maxLength: 3 }))
    .map(([base, segs]) => `${base}/${segs.join('/')}`)

  /** Entirely arbitrary absolute paths (exercise the no-match fallback too). */
  const arbitraryPathArb = fc
    .array(segArb, { minLength: 1, maxLength: 4 })
    .map((segs) => `/${segs.join('/')}`)

  /** Edge-case literals: root, empty, and trailing-slash variants. */
  const edgePathArb = fc.constantFrom('/', '', '/bookings/', '/me/schedule/')

  /** The full pathname space under test. */
  const pathnameArb = fc.oneof(exactRouteArb, subRouteArb, arbitraryPathArb, edgePathArb)

  /** Boundary-aware path-prefix check matching the helper's own semantics. */
  const isPrefix = (pathname: string, prefix: string): boolean =>
    prefix === '/' || pathname === prefix || pathname.startsWith(`${prefix}/`)

  /** Shared structural invariants asserted for every derived trail. */
  const assertWellFormed = (trail: Crumb[]): void => {
    // Non-empty, ordered list (Req 5.1).
    expect(trail.length).toBeGreaterThan(0)

    // Exactly one `current` crumb, and it is the last one (Req 5.4).
    const currentCount = trail.filter((c) => c.current).length
    expect(currentCount).toBe(1)
    expect(trail.at(-1)?.current).toBe(true)

    // Every non-last crumb is a non-current link with a non-empty href
    // (Req 5.3); the current crumb also carries a defined label/href.
    trail.forEach((crumb, index) => {
      expect(typeof crumb.label).toBe('string')
      expect(crumb.label.length).toBeGreaterThan(0)
      expect(typeof crumb.href).toBe('string')
      expect(crumb.href.length).toBeGreaterThan(0)
      if (index < trail.length - 1) {
        expect(crumb.current).toBe(false)
      }
    })

    // Ordered ancestor → current: each earlier crumb's href is a path-prefix of
    // the following crumb's href (Req 5.1, 5.2).
    for (let i = 1; i < trail.length; i++) {
      const ancestor = trail[i - 1]
      const descendant = trail[i]
      if (ancestor && descendant) {
        expect(isPrefix(descendant.href, ancestor.href)).toBe(true)
      }
    }
  }

  it('returns a non-empty, ordered trail with exactly one trailing current crumb', () => {
    fc.assert(
      fc.property(pathnameArb, (pathname) => {
        assertWellFormed(deriveBreadcrumbs(pathname, ADMIN_NAV))
      }),
      { numRuns: 25 },
    )
  })

  it('yields a single current crumb for top-level (exact nav-href) routes', () => {
    fc.assert(
      fc.property(exactRouteArb, (pathname) => {
        const trail = deriveBreadcrumbs(pathname, ADMIN_NAV)
        expect(trail).toHaveLength(1)
        expect(trail[0]?.current).toBe(true)
        expect(trail[0]?.href).toBe(pathname)
      }),
      { numRuns: 25 },
    )
  })

  it('appends a current detail crumb for sub-routes of a section', () => {
    fc.assert(
      fc.property(subRouteArb, (pathname) => {
        const trail = deriveBreadcrumbs(pathname, ADMIN_NAV)
        // A detail sub-route extends beyond its section root, so the trail has
        // an ancestor link followed by the current detail crumb (Req 5.2).
        expect(trail.length).toBe(2)
        expect(trail[0]?.current).toBe(false)
        expect(trail[1]?.current).toBe(true)
        // The current crumb points at the full (normalised) path.
        expect(trail[1]?.href).toBe(pathname)
        assertWellFormed(trail)
      }),
      { numRuns: 25 },
    )
  })

  it('never mutates the supplied nav config', () => {
    const before = JSON.stringify(ADMIN_NAV)
    fc.assert(
      fc.property(pathnameArb, (pathname) => {
        deriveBreadcrumbs(pathname, ADMIN_NAV as ReadonlyArray<NavSection>)
      }),
      { numRuns: 25 },
    )
    expect(JSON.stringify(ADMIN_NAV)).toBe(before)
  })
})
