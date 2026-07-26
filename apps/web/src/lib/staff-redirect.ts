/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : staff-redirect
 * Scope        : Shared — Staff Self-Service Subdomain Redirect Mapping
 *
 * Description  : Pure, framework-free mapping that translates legacy
 *                `/staff/*` paths on theroyalglow.in to their canonical
 *                destination on the admin subdomain under the `/me/*`
 *                self-service namespace. Staff self-service moved to the admin
 *                app (admin.theroyalglow.in) during the admin-web-separation
 *                feature; the customer site issues a permanent (301) redirect.
 *
 *                CANONICAL LOCATION: the staff schedule/leave self-service
 *                surfaces now live in apps/admin at `/me/schedule` and
 *                `/me/leave`. There is no `/staff` page in apps/web — only this
 *                redirect map, wired into apps/web/src/middleware.ts.
 *
 * Responsibilities :
 * - Swap the `/staff` prefix for `/me` and preserve the remainder of the path
 * - Preserve the query string when present
 * - Map bare `/staff` (and `/staff/`) to the admin `/me` root
 * - Be idempotent: an already-canonical `/me*` path maps to itself
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation (pure helper)
 *
 * Dependencies : None
 *
 * Notes        : Pure so it can be property-tested without the edge runtime.
 *                Mirrors lib/admin-redirect.ts. The edge middleware wraps this
 *                to emit a real 301 NextResponse.redirect.
 ************************************************************/

// New admin app origin (no trailing slash). Mirrors admin-redirect.ts.
export const ADMIN_ORIGIN = 'https://admin.theroyalglow.in'

/**
 * Map a legacy `/staff/*` path on the customer domain to its canonical
 * Admin_App destination under the `/me` self-service namespace.
 *
 * - `/staff/{rest}` -> `https://admin.theroyalglow.in/me/{rest}` (prefix
 *   swapped, remainder preserved)
 * - bare `/staff` and `/staff/` -> `https://admin.theroyalglow.in/me`
 * - an already-canonical `/me` or `/me/*` path -> the same `/me*` path
 *   (idempotent re-map)
 * - any other path (defensive) -> `https://admin.theroyalglow.in/me`
 * - the query string, when provided, is preserved verbatim
 *
 * @param path   The incoming pathname (e.g. `/staff/leave`).
 * @param search Optional query string, with or without the leading `?`.
 * @returns The absolute destination URL on the admin subdomain.
 */
export function mapStaffRedirect(path: string, search?: string): string {
  // Normalize the query string: accept "?a=b", "a=b", or empty/undefined.
  let query = ''
  if (search && search !== '?') {
    query = search.startsWith('?') ? search : `?${search}`
  }

  // Compute the remainder under the `/me` self-service namespace.
  let rest = '/me'
  if (path === '/staff' || path === '/staff/') {
    rest = '/me'
  } else if (path.startsWith('/staff/')) {
    // Keep the leading slash of the remainder: `/staff/schedule` -> `/me/schedule`.
    rest = `/me${path.slice('/staff'.length)}`
  } else if (path === '/me' || path.startsWith('/me/')) {
    // Already canonical — identity mapping gives idempotence.
    rest = path
  }

  // A `..` segment in the preserved remainder climbs OUT of the `/me`
  // namespace: `/staff/..` would otherwise yield `/me/..`, which a client
  // resolves to the admin root, breaking this function's core guarantee. Guard
  // it two ways and collapse to the `/me` root when either trips:
  //   1. resolve the remainder and require the result to stay inside `/me`
  //      (catches `..`, including nested cases like `/staff/a/../..`), and
  //   2. reject a percent-encoded `..` segment, which URL resolution leaves
  //      intact but a client may still decode and traverse.
  // A single `.` segment is deliberately allowed: it resolves within `/me`
  // (`/me/./x` -> `/me/x`), so the remainder is preserved verbatim as callers
  // expect.
  const hasEncodedParentSegment = rest.split('/').some((segment) => {
    if (segment === '..' || !segment.includes('%')) return false
    try {
      return decodeURIComponent(segment) === '..'
    } catch {
      // Malformed escape sequence — nothing decodable to traverse with.
      return false
    }
  })

  const { pathname: resolved } = new URL(rest, ADMIN_ORIGIN)
  const staysInNamespace = resolved === '/me' || resolved.startsWith('/me/')
  if (hasEncodedParentSegment || !staysInNamespace) {
    rest = '/me'
  }

  return `${ADMIN_ORIGIN}${rest}${query}`
}
