/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : staff-redirect.test
 * Scope        : Shared — Staff Self-Service Redirect Mapping (Properties 1-4)
 *
 * Description  : Property-based + example tests for the pure `mapStaffRedirect`
 *                helper that translates legacy `/staff/*` paths on
 *                theroyalglow.in to the admin subdomain under the `/me/*`
 *                self-service namespace. Verifies the 301 destination mapping
 *                swaps the `/staff` prefix for `/me`, preserves the deep-link
 *                sub-path and the query string verbatim, is idempotent, and
 *                always targets the admin `/me` namespace.
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ADMIN_ORIGIN, mapStaffRedirect } from './staff-redirect'

const NUM_RUNS = 200

// URL-safe path segment: avoids '/', '?', '#' and whitespace so segments do not
// change the structural meaning of the path. Non-empty by construction.
const segment = fc.stringMatching(/^[A-Za-z0-9._~!$&'()*+,;=:@-]+$/).filter((s) => s.length > 0)

// A sub-path of one or more segments joined by '/', e.g. "leave/123".
const subPath = fc.array(segment, { minLength: 1, maxLength: 6 }).map((segs) => segs.join('/'))

// A query string body (no leading '?'): key=value pairs joined by '&'. Uses
// url-safe characters so the assertion compares structural preservation.
const queryBody = fc
  .array(
    fc.tuple(segment, segment).map(([k, v]) => `${k}=${v}`),
    { minLength: 1, maxLength: 5 },
  )
  .map((pairs) => pairs.join('&'))

// Feature: admin-web-separation, Property 1: Staff redirect preserves the deep-link sub-path
// Validates: Requirements 4.1, 4.2
//
// For any legacy `/staff/{rest}` path, the result equals
// `https://admin.theroyalglow.in/me/{rest}` — the `/staff` prefix is swapped for
// `/me` and the entire remainder is preserved unchanged.
describe('Property 1: Staff redirect preserves the deep-link sub-path', () => {
  it('swaps the /staff prefix for /me and preserves the remainder (incl. leading slash)', () => {
    fc.assert(
      fc.property(subPath, (p) => {
        const result = mapStaffRedirect(`/staff/${p}`)
        expect(result).toBe(`${ADMIN_ORIGIN}/me/${p}`)
      }),
      { numRuns: NUM_RUNS },
    )
  })
})

// Feature: admin-web-separation, Property 2: Staff redirect preserves the query string verbatim
// Validates: Requirements 4.3
//
// For any legacy `/staff/*` path and any query string, the destination ends with
// that query string exactly as supplied (after leading-`?` normalization), with
// nothing added, dropped, or re-encoded.
describe('Property 2: Staff redirect preserves the query string verbatim', () => {
  it('preserves the query string when provided with a leading "?"', () => {
    fc.assert(
      fc.property(subPath, queryBody, (p, q) => {
        const result = mapStaffRedirect(`/staff/${p}`, `?${q}`)
        expect(result).toBe(`${ADMIN_ORIGIN}/me/${p}?${q}`)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('accepts a query string without the leading "?" and preserves it', () => {
    fc.assert(
      fc.property(subPath, queryBody, (p, q) => {
        const result = mapStaffRedirect(`/staff/${p}`, q)
        expect(result).toBe(`${ADMIN_ORIGIN}/me/${p}?${q}`)
      }),
      { numRuns: NUM_RUNS },
    )
  })
})

// Feature: admin-web-separation, Property 3: Staff redirect is idempotent
// Validates: Requirements 4.6
//
// Applying `mapStaffRedirect` to a legacy `/staff/*` path and then re-applying
// the mapping to the resulting `/me/...` path produces the same destination URL.
describe('Property 3: Staff redirect is idempotent', () => {
  it('re-mapping the resulting /me path yields the same destination URL', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('/staff', '/staff/'),
        subPath,
        fc.oneof(fc.constant<string | undefined>(undefined), queryBody),
        (base, p, q) => {
          // Build a legacy path: bare `/staff[/]` or a deep `/staff/{rest}`.
          const legacy = base === '/staff/' && p ? `/staff/${p}` : base
          const first = mapStaffRedirect(legacy, q)

          // Extract the canonical `/me...` path from the first result by string
          // ops (not `new URL().pathname`, which would normalize dot-segments
          // like `/me/.` and defeat the round-trip), then re-map it.
          const firstPath = first.slice(ADMIN_ORIGIN.length).split('?')[0] ?? '/me'
          const second = mapStaffRedirect(firstPath, q)

          expect(second).toBe(first)
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  it('a deep /staff path re-maps idempotently through its /me result', () => {
    fc.assert(
      fc.property(subPath, (p) => {
        const first = mapStaffRedirect(`/staff/${p}`)
        const firstPath = first.slice(ADMIN_ORIGIN.length).split('?')[0] ?? '/me'
        expect(mapStaffRedirect(firstPath)).toBe(first)
      }),
      { numRuns: NUM_RUNS },
    )
  })
})

// Feature: admin-web-separation, Property 4: Staff redirect always targets the admin /me namespace
// Validates: Requirements 4.1, 4.2, 4.7
//
// For any path matched by the `/staff` middleware branch (`/staff`, `/staff/`,
// or any `/staff/`-prefixed path), the result is an absolute URL whose origin is
// `https://admin.theroyalglow.in` and whose path begins with `/me`, and never
// resolves under the `/staff` prefix.
describe('Property 4: Staff redirect always targets the admin /me namespace', () => {
  const staffPathArb = fc.oneof(
    fc.constantFrom('/staff', '/staff/'),
    subPath.map((p) => `/staff/${p}`),
  )

  it('produces an admin-origin URL whose path begins with /me and never /staff', () => {
    fc.assert(
      fc.property(
        staffPathArb,
        fc.oneof(fc.constant<string | undefined>(undefined), queryBody),
        (path, q) => {
          const result = mapStaffRedirect(path, q)
          const url = new URL(result)

          expect(url.origin).toBe(ADMIN_ORIGIN)
          expect(url.pathname.startsWith('/me')).toBe(true)
          expect(url.pathname.startsWith('/staff')).toBe(false)
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })
})

// Example-based anchors for the documented mappings (Req 9.5).
describe('mapStaffRedirect documented examples', () => {
  it('maps representative legacy paths to their admin /me destinations', () => {
    expect(mapStaffRedirect('/staff')).toBe('https://admin.theroyalglow.in/me')
    expect(mapStaffRedirect('/staff/')).toBe('https://admin.theroyalglow.in/me')
    expect(mapStaffRedirect('/staff/schedule')).toBe('https://admin.theroyalglow.in/me/schedule')
    expect(mapStaffRedirect('/staff/leave')).toBe('https://admin.theroyalglow.in/me/leave')
    expect(mapStaffRedirect('/staff/leave', '?from=email')).toBe(
      'https://admin.theroyalglow.in/me/leave?from=email',
    )
    expect(mapStaffRedirect('/staff/leave', 'from=email')).toBe(
      'https://admin.theroyalglow.in/me/leave?from=email',
    )
  })
})
