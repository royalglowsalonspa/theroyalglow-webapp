/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : admin-redirect.test
 * Scope        : Shared — Admin Subdomain Redirect Mapping (Property 4)
 *
 * Description  : Property-based tests for the pure `mapAdminRedirect` helper
 *                that translates legacy `/admin/*` paths on theroyalglow.in to
 *                the new admin subdomain. Verifies the 301 destination mapping
 *                drops the `/admin` prefix, preserves the remainder of the
 *                path (including its leading slash) and the query string, and
 *                maps the bare `/admin` (and `/admin/`) to the admin origin
 *                root.
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ADMIN_ORIGIN, mapAdminRedirect } from './admin-redirect'

// Feature: admin-subdomain-migration, Property 4: Web→admin 301 redirect preserves the sub-path
// Validates: Requirements 9.4, 15.5

const NUM_RUNS = 200

// URL-safe path segment: avoids '/', '?', '#' and whitespace so segments do not
// change the structural meaning of the path. Non-empty by construction.
const segment = fc.stringMatching(/^[A-Za-z0-9._~!$&'()*+,;=:@-]+$/).filter((s) => s.length > 0)

// A sub-path of one or more segments joined by '/', e.g. "bookings/123".
const subPath = fc.array(segment, { minLength: 1, maxLength: 6 }).map((segs) => segs.join('/'))

// A query string body (no leading '?'): key=value pairs joined by '&'. Uses
// url-safe characters so the assertion compares structural preservation.
const queryBody = fc
  .array(
    fc.tuple(segment, segment).map(([k, v]) => `${k}=${v}`),
    { minLength: 1, maxLength: 5 },
  )
  .map((pairs) => pairs.join('&'))

describe('Property 4: Web→admin 301 redirect preserves the sub-path', () => {
  it('drops the /admin prefix and preserves the remainder (incl. leading slash)', () => {
    fc.assert(
      fc.property(subPath, (p) => {
        const result = mapAdminRedirect(`/admin/${p}`)
        expect(result).toBe(`${ADMIN_ORIGIN}/${p}`)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('preserves the query string when provided with a leading "?"', () => {
    fc.assert(
      fc.property(subPath, queryBody, (p, q) => {
        const result = mapAdminRedirect(`/admin/${p}`, `?${q}`)
        expect(result).toBe(`${ADMIN_ORIGIN}/${p}?${q}`)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('accepts a query string without the leading "?" and preserves it', () => {
    fc.assert(
      fc.property(subPath, queryBody, (p, q) => {
        const result = mapAdminRedirect(`/admin/${p}`, q)
        expect(result).toBe(`${ADMIN_ORIGIN}/${p}?${q}`)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('maps bare /admin and /admin/ to the admin origin root', () => {
    fc.assert(
      fc.property(fc.constantFrom('/admin', '/admin/'), (path) => {
        expect(mapAdminRedirect(path)).toBe(ADMIN_ORIGIN)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('preserves the query string on bare /admin (origin root + query)', () => {
    fc.assert(
      fc.property(fc.constantFrom('/admin', '/admin/'), queryBody, (path, q) => {
        expect(mapAdminRedirect(path, `?${q}`)).toBe(`${ADMIN_ORIGIN}?${q}`)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Example-based anchors for the documented invariants.
  it('maps documented examples correctly', () => {
    expect(mapAdminRedirect('/admin/bookings')).toBe('https://admin.theroyalglow.in/bookings')
    expect(mapAdminRedirect('/admin/bookings/123')).toBe(
      'https://admin.theroyalglow.in/bookings/123',
    )
    expect(mapAdminRedirect('/admin/bookings', '?status=pending')).toBe(
      'https://admin.theroyalglow.in/bookings?status=pending',
    )
    expect(mapAdminRedirect('/admin/bookings', 'status=pending')).toBe(
      'https://admin.theroyalglow.in/bookings?status=pending',
    )
    expect(mapAdminRedirect('/admin')).toBe('https://admin.theroyalglow.in')
    expect(mapAdminRedirect('/admin/')).toBe('https://admin.theroyalglow.in')
  })
})
