/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : breadcrumbs
 * Scope        : Admin Design System — Breadcrumb derivation
 *
 * Description  : Pure, I/O-free helper that derives the breadcrumb trail for the
 *                admin Top_Bar from the current pathname and the shared
 *                ADMIN_NAV config. Uses the same longest-path-prefix matching
 *                semantics as the RBAC route matcher so the breadcrumb agrees
 *                with navigation and middleware.
 *
 * Responsibilities :
 * - Resolve the ADMIN_NAV item whose href is the longest path-prefix of the
 *   current pathname and use its label as the section/page crumb.
 * - Append a current crumb for a detail sub-route (e.g. /bookings/123).
 * - Guarantee a non-empty, ordered (ancestor → current) list with exactly one
 *   current crumb (the last); all earlier crumbs carry link hrefs.
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation (pure helper)
 *
 * Dependencies : @/lib/rbac (NavSection type only — consumed, not modified)
 *
 * Notes        : NO I/O, NO framework deps. Pure function so it is unit- and
 *                property-testable (Property 5 — breadcrumb derivation
 *                well-formed). Presentation-layer only.
 *
 * Requirements : 5.1, 5.2, 5.3, 5.4, 5.6
 ************************************************************/

import type { NavSection } from '@/lib/rbac'

/** A single breadcrumb entry. The last crumb in a trail is the current page. */
export type Crumb = {
  label: string
  href: string
  current: boolean
}

/**
 * True when `prefix` is a path-segment prefix of `pathname`. Mirrors the prefix
 * semantics in `@/lib/rbac`: the root `/` matches everything; any other prefix
 * matches an exact path or a path whose next character is a `/` boundary (so
 * `/users` matches `/users` and `/users/123` but not `/userszzz`).
 */
function isPathPrefix(pathname: string, prefix: string): boolean {
  if (prefix === '/') {
    return true
  }
  if (pathname === prefix) {
    return true
  }
  return pathname.startsWith(`${prefix}/`)
}

/**
 * Normalise a pathname for matching: strip any trailing slash (except the root)
 * so `/bookings/` is treated the same as `/bookings`. An empty input is treated
 * as the root.
 */
function normalisePathname(pathname: string): string {
  if (!pathname) {
    return '/'
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/, '') || '/'
  }
  return pathname
}

/**
 * Humanise a raw path segment into a readable label (e.g. `monthly-report` →
 * `Monthly Report`, `123` → `123`). Used for the detail crumb of a sub-route
 * that has no dedicated ADMIN_NAV entry.
 */
function humaniseSegment(segment: string): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })()

  return decoded
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Find the ADMIN_NAV item whose `href` is the longest path-prefix of the given
 * pathname. Returns the matched item's label and href, or `null` when no item
 * matches (only possible when `nav` contains no root/ancestor entry).
 */
function findLongestPrefixItem(
  pathname: string,
  nav: ReadonlyArray<NavSection>,
): { label: string; href: string } | null {
  let best: { label: string; href: string } | null = null
  let bestLength = -1

  for (const section of nav) {
    for (const item of section.items) {
      if (isPathPrefix(pathname, item.href) && item.href.length > bestLength) {
        best = { label: item.label, href: item.href }
        bestLength = item.href.length
      }
    }
  }

  return best
}

/**
 * Derive the ordered breadcrumb trail (highest ancestor → current page) for the
 * current route.
 *
 * Strategy (Req 5.1, 5.2, 5.6):
 * 1. Find the ADMIN_NAV item whose href is the longest path-prefix of the
 *    pathname; its label is the section/page crumb.
 * 2. When the pathname extends beyond that item (a detail sub-route such as
 *    `/bookings/123`), append a current crumb for the detail segment and demote
 *    the matched item to a link.
 * 3. The last crumb is always `current` and non-interactive; every earlier
 *    crumb carries its link href (Req 5.3, 5.4).
 *
 * The returned list is always non-empty. A top-level route (e.g. `/`) yields a
 * single current-only crumb (Req 5.6).
 */
export function deriveBreadcrumbs(
  pathname: string,
  nav: ReadonlyArray<NavSection>,
): Crumb[] {
  const path = normalisePathname(pathname)
  const matched = findLongestPrefixItem(path, nav)

  // No nav entry matched (nav has no root/ancestor): fall back to a single
  // current crumb derived from the path so the trail is never empty.
  if (!matched) {
    const segments = path.split('/').filter(Boolean)
    const lastSegment = segments.at(-1)
    return [
      {
        label: lastSegment ? humaniseSegment(lastSegment) : 'Home',
        href: path,
        current: true,
      },
    ]
  }

  // Exact match: the matched item IS the current page (single crumb).
  if (path === matched.href) {
    return [{ label: matched.label, href: matched.href, current: true }]
  }

  // Sub-route: the matched item becomes a link ancestor, and the trailing
  // detail segment becomes the current crumb.
  const detailSegment = path.split('/').filter(Boolean).at(-1) ?? ''

  return [
    { label: matched.label, href: matched.href, current: false },
    { label: humaniseSegment(detailSegment), href: path, current: true },
  ]
}
