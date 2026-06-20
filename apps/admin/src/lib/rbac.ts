/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : rbac
 * Scope        : Admin RBAC decision core
 *
 * Description  : Pure, I/O-free role-based access control logic for the admin
 *                portal. Resolves role levels, maps routes to minimum levels via
 *                longest-prefix matching, and decides middleware actions from an
 *                auth state. Also provides a pure sidebar nav-visibility filter.
 *
 * Notes        : NO I/O here. No `fetch`, no `next/server`, no framework deps.
 *                Everything is a pure function so it can be unit- and
 *                property-tested with fast-check (Properties P1-P3).
 *
 * Requirements : 5.1, 5.2, 5.3, 5.7, 4.3, 4.4, 4.5, 4.6 (nav: 5.4)
 ************************************************************/

/**
 * Role hierarchy with numeric levels. Higher level grants access to everything
 * accessible by lower levels (Req 5.1).
 */
export const ROLE_LEVELS = {
  customer: 0,
  staff: 1,
  receptionist: 2,
  manager: 3,
  owner: 4,
  developer: 5,
} as const

export type Role = keyof typeof ROLE_LEVELS

/** The lowest level — used for unknown/absent roles (Req 5.7). */
export const MIN_ROLE_LEVEL = 0

/**
 * Resolve a role string to its numeric level. Unknown or absent roles resolve
 * to the lowest level (0) for access-control decisions (Req 5.7).
 */
export function resolveRoleLevel(role: string | null | undefined): number {
  return role && role in ROLE_LEVELS ? ROLE_LEVELS[role as Role] : MIN_ROLE_LEVEL
}

/**
 * Route -> minimum role level table (Root-Path Convention — no `/admin`
 * prefix). Ordered most-specific first for readability; the matcher below uses
 * a longest-prefix match so ordering does not affect correctness (Req 5.3).
 */
export const ROUTE_MIN_LEVEL: ReadonlyArray<readonly [string, number]> = [
  ['/integrations', 5],
  ['/logs', 5],
  ['/branches', 4],
  ['/users', 4],
  ['/services', 3],
  ['/offers', 3],
  ['/staff', 3],
  ['/schedule', 3],
  ['/reports', 3],
  ['/settings', 3],
  ['/bookings', 2],
  ['/waitlist', 2],
  ['/customers', 2],
  ['/leads', 2],
  ['/billing', 2],
  ['/leave', 2],
  ['/memberships', 2],
  ['/', 2], // dashboard root — matched last (shortest prefix)
] as const

/**
 * True when `prefix` is a path-segment prefix of `pathname`. The root `/`
 * matches everything; any other prefix matches an exact path or a path whose
 * next character is a `/` boundary (so `/users` matches `/users` and
 * `/users/123` but not `/userszzz`).
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
 * Resolve the minimum role level required for a route via longest-prefix match.
 * The most specific (longest) matching prefix wins; `/` is the fallback for the
 * dashboard root. Unmatched paths default to the dashboard minimum (level 2) so
 * the admin app never fails open (Req 5.3).
 */
export function routeMinLevel(pathname: string): number {
  let bestPrefixLength = -1
  let bestLevel: number = ROLE_LEVELS.receptionist // safe default for the admin app

  for (const [prefix, level] of ROUTE_MIN_LEVEL) {
    if (isPathPrefix(pathname, prefix) && prefix.length > bestPrefixLength) {
      bestPrefixLength = prefix.length
      bestLevel = level
    }
  }

  return bestLevel
}

/**
 * Authentication state derived by the edge middleware before a decision is
 * made. Tagged union so `decide` can map each case exactly (Req 4.3-4.6).
 */
export type AuthState =
  | { kind: 'no_cookie' } // no session cookie present
  | { kind: 'invalid' } // session lookup returned a non-2xx response
  | { kind: 'error' } // network/server failure during the lookup
  | { kind: 'valid'; roleLevel: number } // valid session with resolved role level

/**
 * The action the middleware should take for a given auth state and route.
 */
export type Decision =
  | { action: 'redirect' } // 302 -> https://theroyalglow.in
  | { action: 'clear_and_redirect' } // clear cookie, then 302 -> redirect
  | { action: 'forbid' } // 403, no redirect
  | { action: 'allow' } // forward request

/**
 * Map an auth state + route minimum level to a middleware decision.
 *
 * - no cookie            -> redirect              (Req 4.4, 5.5)
 * - invalid/expired      -> clear cookie + redirect (Req 4.5)
 * - lookup error         -> redirect (fail closed) (Req 4.6, 5.6)
 * - valid, level < min   -> forbid (403, no redirect) (Req 4.6, 5.2)
 * - valid, level >= min  -> allow
 */
export function decide(state: AuthState, routeMin: number): Decision {
  switch (state.kind) {
    case 'no_cookie':
      return { action: 'redirect' }
    case 'invalid':
      return { action: 'clear_and_redirect' }
    case 'error':
      return { action: 'redirect' }
    case 'valid':
      return state.roleLevel < routeMin ? { action: 'forbid' } : { action: 'allow' }
  }
}

/* ------------------------------------------------------------------------- *
 * Sidebar navigation visibility (pure)                                       *
 * ------------------------------------------------------------------------- */

/** A single navigation entry. `minLevel` is the minimum role level to see it. */
export type NavItem = {
  label: string
  href: string
  minLevel: number
}

/** A titled group of navigation items. */
export type NavSection = {
  title: string
  items: NavItem[]
}

/**
 * Default admin navigation config (Root-Path Convention). `minLevel` values are
 * derived from `ROUTE_MIN_LEVEL` so the sidebar and the middleware agree.
 */
export const ADMIN_NAV: ReadonlyArray<NavSection> = [
  {
    title: 'Operations',
    items: [
      { label: 'Dashboard', href: '/', minLevel: 2 },
      { label: 'Bookings', href: '/bookings', minLevel: 2 },
      { label: 'Waitlist', href: '/waitlist', minLevel: 2 },
    ],
  },
  {
    title: 'CRM',
    items: [
      { label: 'Customers', href: '/customers', minLevel: 2 },
      { label: 'Leads', href: '/leads', minLevel: 2 },
    ],
  },
  {
    title: 'Staff',
    items: [
      { label: 'Staff', href: '/staff', minLevel: 3 },
      { label: 'Schedule', href: '/schedule', minLevel: 3 },
      { label: 'Leave', href: '/leave', minLevel: 2 },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { label: 'Services', href: '/services', minLevel: 3 },
      { label: 'Offers', href: '/offers', minLevel: 3 },
      { label: 'Memberships', href: '/memberships', minLevel: 2 },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Billing', href: '/billing', minLevel: 2 },
      { label: 'Reports', href: '/reports', minLevel: 3 },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Settings', href: '/settings', minLevel: 3 },
      { label: 'Branches', href: '/branches', minLevel: 4 },
      { label: 'Users', href: '/users', minLevel: 4 },
      { label: 'Integrations', href: '/integrations', minLevel: 5 },
      { label: 'Logs', href: '/logs', minLevel: 5 },
    ],
  },
]

/**
 * Pure nav-visibility filter (Req 5.4 / Property 3).
 *
 * Returns only the sections and items the given role level may see: an item is
 * visible iff `item.minLevel <= roleLevel`, and any section left with zero
 * visible items is omitted entirely. The input config is never mutated.
 */
export function filterNavByLevel(
  sections: ReadonlyArray<NavSection>,
  roleLevel: number,
): NavSection[] {
  const result: NavSection[] = []

  for (const section of sections) {
    const items = section.items.filter((item) => item.minLevel <= roleLevel)
    if (items.length > 0) {
      result.push({ title: section.title, items })
    }
  }

  return result
}
