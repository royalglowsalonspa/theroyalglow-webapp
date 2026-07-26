/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : lib/admin/command-items
 * Scope        : Admin — Command palette nav selector
 *
 * Description  : Pure helper that flattens the role-filtered admin navigation
 *                into a flat list of command-palette destinations. Delegates
 *                ALL visibility logic to the shared `filterNavByLevel` (no new
 *                filtering rule), so the command palette, the sidebar, and the
 *                edge middleware always agree on what a role may reach.
 *
 * Responsibilities :
 * - Flatten `filterNavByLevel(nav, roleLevel)` to `{ label, href }[]`
 * - Treat an unresolved / unknown / absent role level as the minimum level 0
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation (pure helper, no I/O, no business logic)
 *
 * Dependencies : @/lib/rbac (filterNavByLevel, NavSection)
 *
 * Requirements : 9.4, 9.5
 ************************************************************/

import { filterNavByLevel, type NavSection } from '@/lib/rbac'

/** A single flat command-palette destination. */
export type CommandNavItem = {
  /** Visible label (also the cmdk filter value). */
  label: string
  /** Root-Path destination href. */
  href: string
}

/**
 * Flatten the role-visible navigation into command-palette items.
 *
 * Visibility is delegated entirely to {@link filterNavByLevel}; this helper
 * introduces no new filtering rule. An unresolved / non-finite / negative role
 * level is floored to the minimum level 0 (Req 9.5).
 *
 * @param nav - The navigation config (e.g. `ADMIN_NAV`).
 * @param roleLevel - The signed-in user's resolved role level.
 * @returns The flat, role-visible command items.
 */
export function commandItemsForLevel(
  nav: ReadonlyArray<NavSection>,
  roleLevel: number,
): CommandNavItem[] {
  const level = Number.isFinite(roleLevel) ? Math.max(0, Math.trunc(roleLevel)) : 0
  return filterNavByLevel(nav, level).flatMap((section) =>
    section.items.map((item) => ({ label: item.label, href: item.href })),
  )
}
