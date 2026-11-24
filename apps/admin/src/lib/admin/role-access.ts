/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : role-access
 * Scope        : Admin Portal — Users & Roles presentation helper
 *
 * Description  : Describes what a role change means in admin-portal terms:
 *                which pages the person can open before and after, and which
 *                pages they gain or lose. Shown in the role-assignment
 *                confirmation so the owner sees the real effect of a change.
 *
 * Responsibilities :
 * - List the admin pages a role can open, in sidebar order
 * - Diff two roles into gained / lost pages and a raise / lower / same direction
 *
 * Features / Functionality :
 * - Derived from ADMIN_NAV, whose minLevel values mirror ROUTE_MIN_LEVEL, so
 *   the summary cannot drift from what the middleware and sidebar allow
 * - Set difference keyed by href (labels are display only)
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation helper (pure — no I/O, no React)
 *
 * Dependencies : @/lib/rbac (ADMIN_NAV, filterNavByLevel, resolveRoleLevel)
 *
 * Notes        : Unknown or absent roles resolve to the lowest level, exactly as
 *                the RBAC core does, so they have no admin pages.
 ************************************************************/

import { ADMIN_NAV, filterNavByLevel, resolveRoleLevel } from '@/lib/rbac'

/** Which way a role change moves someone's admin access. */
export type AccessDirection = 'raise' | 'lower' | 'same'

/** The admin-portal effect of changing someone's role. */
export interface RoleAccessChange {
  direction: AccessDirection
  /** Pages they can open after the change but not before (sidebar order). */
  gained: string[]
  /** Pages they could open before the change but not after (sidebar order). */
  lost: string[]
  /** Every page they can open after the change (sidebar order). */
  after: string[]
}

type NavPage = { href: string; label: string }

// Sidebar pages visible at a role level, in sidebar order.
function pagesForLevel(level: number): NavPage[] {
  return filterNavByLevel(ADMIN_NAV, level).flatMap((section) =>
    section.items.map(({ href, label }) => ({ href, label })),
  )
}

function directionOf(fromLevel: number, toLevel: number): AccessDirection {
  if (toLevel > fromLevel) {
    return 'raise'
  }
  if (toLevel < fromLevel) {
    return 'lower'
  }
  return 'same'
}

/** Labels of the admin pages a role can open, in sidebar order. */
export function adminPagesForRole(role: string | null | undefined): string[] {
  return pagesForLevel(resolveRoleLevel(role)).map((page) => page.label)
}

/** The pages gained and lost when someone's role changes from `from` to `to`. */
export function roleAccessChange(
  from: string | null | undefined,
  to: string | null | undefined,
): RoleAccessChange {
  const fromLevel = resolveRoleLevel(from)
  const toLevel = resolveRoleLevel(to)
  const before = pagesForLevel(fromLevel)
  const after = pagesForLevel(toLevel)
  const beforeHrefs = new Set(before.map((page) => page.href))
  const afterHrefs = new Set(after.map((page) => page.href))

  return {
    direction: directionOf(fromLevel, toLevel),
    gained: after.filter((page) => !beforeHrefs.has(page.href)).map((page) => page.label),
    lost: before.filter((page) => !afterHrefs.has(page.href)).map((page) => page.label),
    after: after.map((page) => page.label),
  }
}
