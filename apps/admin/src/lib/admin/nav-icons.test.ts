/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : nav-icons.test
 * Scope        : Property-based tests for the pure nav-icon resolver
 *
 * Description  : fast-check + Vitest property test for `apps/admin/src/lib/
 *                admin/nav-icons.ts`. Verifies that icon resolution is a total
 *                function with a single predefined fallback.
 *
 * Notes        : Append-only — add a new `describe` block per property. Do NOT
 *                overwrite sibling property tests.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV } from '../rbac'
import { DEFAULT_NAV_ICON, NAV_ICON_MAP, navIconFor } from './nav-icons'

// Feature: admin-portal-redesign, Property 1: Icon resolution is total with a single fallback
//
// Property 1: Icon resolution is total with a single fallback
// Validates: Requirements 2.1, 2.2, 2.6
//
// navIconFor is total: it returns a defined LucideIcon for ANY string. For any
// href NOT present in NAV_ICON_MAP it returns exactly the single predefined
// DEFAULT_NAV_ICON fallback. Every href configured in ADMIN_NAV resolves to a
// defined icon (and to its NAV_ICON_MAP entry).

/** Flatten every href configured in the production ADMIN_NAV config. */
const ADMIN_NAV_HREFS: string[] = ADMIN_NAV.flatMap((section) =>
  section.items.map((item) => item.href),
)

describe('Property 1: Icon resolution is total with a single fallback', () => {
  it('returns a defined LucideIcon for any string input (total resolution)', () => {
    fc.assert(
      fc.property(fc.string(), (href) => {
        const icon = navIconFor(href)
        expect(icon).toBeDefined()
        expect(icon).not.toBeNull()
      }),
      { numRuns: 25 },
    )
  })

  it('returns exactly DEFAULT_NAV_ICON for any href not in NAV_ICON_MAP', () => {
    fc.assert(
      fc.property(fc.string(), (href) => {
        fc.pre(!Object.hasOwn(NAV_ICON_MAP, href))
        expect(navIconFor(href)).toBe(DEFAULT_NAV_ICON)
      }),
      { numRuns: 25 },
    )
  })

  it('resolves every known NAV_ICON_MAP href to its mapped icon', () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(NAV_ICON_MAP)), (href) => {
        expect(navIconFor(href)).toBe(NAV_ICON_MAP[href])
      }),
      { numRuns: 25 },
    )
  })

  it('resolves every ADMIN_NAV href to a defined icon', () => {
    expect(ADMIN_NAV_HREFS.length).toBeGreaterThan(0)
    fc.assert(
      fc.property(fc.constantFrom(...ADMIN_NAV_HREFS), (href) => {
        const icon = navIconFor(href)
        expect(icon).toBeDefined()
        // ADMIN_NAV hrefs are explicitly mapped, never the fallback.
        expect(icon).toBe(NAV_ICON_MAP[href])
      }),
      { numRuns: 25 },
    )
  })
})
