/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : admin-redirect
 * Scope        : Shared — Admin Subdomain Redirect Mapping
 *
 * Description  : Pure, framework-free mapping that translates legacy
 *                `/admin/*` paths on theroyalglow.in to the new admin
 *                subdomain (admin.theroyalglow.in). The admin portal moved to
 *                its own app during the admin-subdomain migration; the customer
 *                site issues a permanent (301) redirect for the old paths.
 *
 * Responsibilities :
 * - Drop the `/admin` prefix and preserve the remainder of the path
 * - Preserve the query string when present
 * - Map bare `/admin` (and `/admin/`) to the admin origin root
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation (pure helper)
 *
 * Dependencies : None
 *
 * Notes        : Pure so it can be property-tested (Property 4) without the
 *                edge runtime. The edge middleware wraps this to emit a real
 *                301 NextResponse.redirect.
 ************************************************************/

// New admin app origin (no trailing slash).
export const ADMIN_ORIGIN = 'https://admin.theroyalglow.in'

/**
 * Map a legacy `/admin/*` path on the customer domain to the absolute URL on
 * the admin subdomain.
 *
 * - `/admin/{rest}` -> `https://admin.theroyalglow.in/{rest}` (prefix dropped,
 *   remainder preserved)
 * - bare `/admin` and `/admin/` -> `https://admin.theroyalglow.in` (origin root)
 * - the query string, when provided, is preserved verbatim
 *
 * @param path   The incoming pathname (e.g. `/admin/bookings/123`). Values not
 *               starting with `/admin` are treated as the admin root.
 * @param search Optional query string, with or without the leading `?`
 *               (e.g. `?status=pending` or `status=pending`).
 * @returns The absolute destination URL on the admin subdomain.
 */
export function mapAdminRedirect(path: string, search?: string): string {
  // Normalize the query string: accept "?a=b", "a=b", or empty/undefined.
  let query = ''
  if (search && search !== '?') {
    query = search.startsWith('?') ? search : `?${search}`
  }

  // Strip the `/admin` prefix. Anything that is not under `/admin` (defensive)
  // collapses to the admin root.
  let rest = ''
  if (path === '/admin' || path === '/admin/') {
    rest = ''
  } else if (path.startsWith('/admin/')) {
    rest = path.slice('/admin'.length) // keeps the leading slash of the remainder
  }

  return `${ADMIN_ORIGIN}${rest}${query}`
}
