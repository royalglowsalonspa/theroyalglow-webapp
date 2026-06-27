/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : active-nav
 * Scope        : Admin — App Shell / Sidebar navigation
 *
 * Description  : Pure presentation helper that resolves which sidebar
 *                navigation item is "active" for the current route. Selection
 *                is by LONGEST matching route prefix so that at most ONE item is
 *                active for any pathname. Mirrors the prefix semantics used by
 *                `@/lib/rbac` (segment-boundary match) but treats the dashboard
 *                root `/` as an exact match only — matching the prior inline
 *                `isActive` behaviour in `admin-sidebar.tsx`.
 *
 * Responsibilities :
 * - Decide whether a single href matches a pathname (segment-boundary prefix)
 * - Resolve the single longest-prefix matching href from a candidate set
 * - Expose a set-aware `isActive` so exactly one item can be marked active
 *
 * Features / Functionality :
 * - matchesHrefPrefix() — per-href predicate; root `/` matches only exact `/`
 * - resolveActiveHref() — longest-prefix winner across a candidate href list
 * - isActive() — true iff the href is the resolved active href for the set
 * - navHrefs() — flatten NavSection[] into its ordered href list
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation (pure helper, no I/O, no business logic)
 *
 * Notes        : Consumes the `NavSection` TYPE from `@/lib/rbac` only; it does
 *                NOT modify or re-implement any RBAC access-control logic.
 *
 * Requirements : 4.5, 4.6
 ************************************************************/

import type { NavSection } from '@/lib/rbac'

/**
 * True when `href` matches `pathname` as a path-segment prefix.
 *
 * The dashboard root `/` matches ONLY the exact pathname `/` (so the dashboard
 * link is not perpetually active on every route). Any other href matches an
 * exact path or a path whose next character is a `/` boundary, so `/users`
 * matches `/users` and `/users/123` but not `/userszzz`.
 *
 * Pure function: no I/O, no side effects.
 */
export function matchesHrefPrefix(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/'
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Resolve the single active href for a pathname from a list of candidate hrefs
 * by LONGEST matching route prefix.
 *
 * Among every candidate that {@link matchesHrefPrefix}, the one with the longest
 * `href` wins. Because two distinct hrefs cannot both be segment-boundary
 * prefixes of the same pathname while sharing the same length, the winner is
 * unique — guaranteeing at most one active item (Req 4.5). Returns `null` when
 * no candidate matches.
 *
 * Pure function: no I/O, no side effects; the input array is not mutated.
 */
export function resolveActiveHref(pathname: string, hrefs: readonly string[]): string | null {
  let active: string | null = null
  let bestLength = -1

  for (const href of hrefs) {
    if (matchesHrefPrefix(pathname, href) && href.length > bestLength) {
      active = href
      bestLength = href.length
    }
  }

  return active
}

/**
 * Set-aware active check: `true` iff `href` is the single longest-prefix match
 * for `pathname` among `hrefs`. Pass the full candidate set (e.g. every visible
 * nav href) so that exactly one item is reported active (Req 4.5, 4.6).
 *
 * Pure function: no I/O, no side effects.
 */
export function isActive(pathname: string, href: string, hrefs: readonly string[]): boolean {
  return resolveActiveHref(pathname, hrefs) === href
}

/**
 * Flatten the ordered nav sections into their ordered list of hrefs. Useful for
 * feeding {@link resolveActiveHref} / {@link isActive} with the complete set of
 * candidate routes the sidebar renders.
 *
 * Pure function: no I/O, no side effects.
 */
export function navHrefs(sections: ReadonlyArray<NavSection>): string[] {
  return sections.flatMap((section) => section.items.map((item) => item.href))
}
