/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : command-items.property.test
 * Scope        : Property-based test for command-palette role filtering
 *
 * Description  : fast-check + Vitest property test for the NEW
 *                `commandItemsForLevel` selector (the command palette's
 *                destination list). Asserts that for an arbitrary role level
 *                the returned destinations are EXACTLY the navigation items the
 *                level may see (delegating to the shared `filterNavByLevel`),
 *                and that an unresolved / non-finite / negative level collapses
 *                to the minimum level 0.
 *
 * Notes        : Pure-logic test only — no DOM, no I/O. Written as `.ts` (no
 *                JSX) so it runs under the admin Vitest project.
 ************************************************************/

import { commandItemsForLevel } from '@/lib/admin/command-items'
import { ADMIN_NAV } from '@/lib/rbac'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// Feature: admin-portal-redesign, Property 6: Command-palette items respect
// role level.
//
// Property 6: Command-palette items respect role level
// Validates: Requirements 9.4, 9.5

/** Flatten ADMIN_NAV to a {href, minLevel} catalogue for cross-checking. */
const ALL_ITEMS = ADMIN_NAV.flatMap((section) =>
  section.items.map((item) => ({ href: item.href, minLevel: item.minLevel })),
)
const MIN_LEVEL_BY_HREF = new Map(ALL_ITEMS.map((item) => [item.href, item.minLevel]))

/** The effective level the selector floors any input to. */
function effectiveLevel(roleLevel: number): number {
  return Number.isFinite(roleLevel) ? Math.max(0, Math.trunc(roleLevel)) : 0
}

describe('Property 6: commandItemsForLevel respects role level (Req 9.4, 9.5)', () => {
  it('returns exactly the destinations whose minLevel ≤ effective level', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5, max: 10 }), (roleLevel) => {
        const level = effectiveLevel(roleLevel)
        const items = commandItemsForLevel(ADMIN_NAV, roleLevel)

        // Soundness: every returned destination is visible at this level.
        for (const item of items) {
          const minLevel = MIN_LEVEL_BY_HREF.get(item.href)
          expect(minLevel, `unknown href ${item.href}`).toBeDefined()
          expect(minLevel as number).toBeLessThanOrEqual(level)
        }

        // Completeness: every visible destination is returned (exact set match).
        const expected = ALL_ITEMS.filter((i) => i.minLevel <= level)
          .map((i) => i.href)
          .sort()
        const got = items.map((i) => i.href).sort()
        expect(got).toEqual(expected)
      }),
      { numRuns: 100 },
    )
  })

  it('treats unresolved / non-finite / negative levels as level 0', () => {
    const atZero = commandItemsForLevel(ADMIN_NAV, 0)
    expect(commandItemsForLevel(ADMIN_NAV, Number.NaN)).toEqual(atZero)
    expect(commandItemsForLevel(ADMIN_NAV, Number.NEGATIVE_INFINITY)).toEqual(atZero)
    expect(commandItemsForLevel(ADMIN_NAV, -100)).toEqual(atZero)
  })
})
