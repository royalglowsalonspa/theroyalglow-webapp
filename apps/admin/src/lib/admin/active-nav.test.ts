/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : active-nav.test
 * Scope        : Property-based tests for the pure sidebar active-item resolver
 *
 * Description  : fast-check + Vitest property test for `apps/admin/src/lib/
 *                admin/active-nav.ts`. Covers the single numbered correctness
 *                property below for the admin-portal-redesign feature.
 *
 * Notes        : Append-only — add a new `describe` block per property. Do NOT
 *                overwrite sibling property tests.
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 ************************************************************/

import { ADMIN_NAV } from '@/lib/rbac'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isActive, matchesHrefPrefix, navHrefs, resolveActiveHref } from './active-nav'

// Feature: admin-portal-redesign, Property 3: Exactly one active navigation item by longest prefix
//
// Property 3: Exactly one active navigation item by longest prefix
// Validates: Requirements 4.5, 4.6
//
// For any pathname, at most one navigation item is marked active, and when one
// is active it is the item whose `href` is the longest path-prefix of the
// pathname; that item (and only that item) is the one a renderer marks
// `aria-current="page"`. Because the renderer applies `aria-current="page"`
// to exactly the href reported active by `isActive`, asserting the
// at-most-one / longest-prefix contract of the pure resolver is equivalent to
// asserting the single-`aria-current` rendering invariant.

// ── Smart generators ────────────────────────────────────────────────────────

/** A single non-empty, slash-free path segment from a small alphabet. */
const segArb = fc.stringMatching(/^[a-z0-9-]{1,8}$/)

/** A root-path href: `/` or `/seg` or `/seg/seg` (Root-Path Convention). */
const hrefArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant('/'),
  fc.array(segArb, { minLength: 1, maxLength: 3 }).map((segs) => `/${segs.join('/')}`),
)

/** A candidate href set (deduped), as the sidebar would render. */
const hrefSetArb: fc.Arbitrary<string[]> = fc
  .array(hrefArb, { minLength: 1, maxLength: 12 })
  .map((hrefs) => [...new Set(hrefs)])

/**
 * A pathname generator that intelligently targets the candidate space: it picks
 * one of the candidate hrefs and either uses it exactly, deep-links beneath it,
 * or appends adversarial non-boundary suffixes — plus the bare root and wholly
 * unrelated paths to exercise the no-match branch.
 */
const pathnameForArb = (hrefs: readonly string[]): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant('/'),
    fc.constantFrom(...hrefs),
    // Deep link beneath a candidate: `${href}/extra/segs` (boundary match).
    fc
      .tuple(fc.constantFrom(...hrefs), fc.array(segArb, { minLength: 1, maxLength: 3 }))
      .map(([href, segs]) => {
        const base = href === '/' ? '' : href
        return `${base}/${segs.join('/')}`
      }),
    // Adversarial non-boundary suffix: `${href}zzz` must NOT match.
    fc
      .constantFrom(...hrefs)
      .map((href) => `${href}zzz`),
    // Entirely unrelated absolute path.
    fc
      .array(segArb, { minLength: 1, maxLength: 4 })
      .map((segs) => `/${segs.join('/')}`),
  )

/** Always include the production ADMIN_NAV hrefs alongside generated sets. */
const candidateSetArb: fc.Arbitrary<string[]> = fc.oneof(
  hrefSetArb,
  fc.constant(navHrefs(ADMIN_NAV)),
)

describe('Property 3: Exactly one active navigation item by longest prefix', () => {
  it('resolves at most one active href, chosen by longest matching prefix', () => {
    fc.assert(
      fc.property(
        candidateSetArb.chain((hrefs) => fc.tuple(fc.constant(hrefs), pathnameForArb(hrefs))),
        ([hrefs, pathname]) => {
          const active = resolveActiveHref(pathname, hrefs)

          // Independent oracle: every candidate that matches the pathname.
          const matching = hrefs.filter((h) => matchesHrefPrefix(pathname, h))

          if (matching.length === 0) {
            // No candidate matches → no active item (Req 4.5).
            expect(active).toBeNull()
            return
          }

          // When one is active it must be a genuine matching candidate …
          expect(active).not.toBeNull()
          expect(matching).toContain(active as string)

          // … and it must be the LONGEST matching prefix (Req 4.6).
          const maxLen = Math.max(...matching.map((h) => h.length))
          expect((active as string).length).toBe(maxLen)

          // The longest-length matching candidate is unique by value, so the
          // resolved winner is unambiguous (guarantees at-most-one, Req 4.5).
          const longest = new Set(matching.filter((h) => h.length === maxLen))
          expect(longest.size).toBe(1)
          expect(longest.has(active as string)).toBe(true)
        },
      ),
      { numRuns: 25 },
    )
  })

  it('marks exactly one href active via isActive (the single aria-current target)', () => {
    fc.assert(
      fc.property(
        candidateSetArb.chain((hrefs) => fc.tuple(fc.constant(hrefs), pathnameForArb(hrefs))),
        ([hrefs, pathname]) => {
          const active = resolveActiveHref(pathname, hrefs)

          // isActive must agree with the resolver for every candidate.
          for (const href of hrefs) {
            expect(isActive(pathname, href, hrefs)).toBe(href === active)
          }

          // The distinct set of hrefs reported active is at most one — exactly
          // one renderer node carries `aria-current="page"` (Req 4.5, 4.6).
          const activeDistinct = new Set(hrefs.filter((h) => isActive(pathname, h, hrefs)))
          expect(activeDistinct.size).toBe(active === null ? 0 : 1)
        },
      ),
      { numRuns: 25 },
    )
  })

  it('treats the dashboard root `/` as an exact match only', () => {
    const hrefs = navHrefs(ADMIN_NAV)
    // Root is active only on the exact `/` pathname …
    expect(resolveActiveHref('/', hrefs)).toBe('/')
    // … and never on deeper routes, which resolve to their own longest prefix.
    expect(resolveActiveHref('/bookings', hrefs)).toBe('/bookings')
    expect(resolveActiveHref('/bookings/123', hrefs)).toBe('/bookings')
    expect(isActive('/bookings/123', '/', hrefs)).toBe(false)
  })
})
