/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : nav-icons
 * Scope        : Admin — App Shell / Sidebar / Iconography
 *
 * Description  : Pure presentation helper mapping each admin navigation
 *                Root-Path href to exactly one lucide-react icon. Replaces the
 *                emoji NAV_ICONS map previously used in admin-sidebar.tsx.
 *
 * Responsibilities :
 * - Map each Root-Path navigation href to one LucideIcon
 * - Provide a single predefined fallback icon for unmapped hrefs
 *
 * Features / Functionality :
 * - NAV_ICON_MAP   — per-route icon map keyed by Root-Path href
 * - DEFAULT_NAV_ICON — single predefined fallback icon
 * - navIconFor()   — total resolver returning a defined LucideIcon for any href
 *
 * Tech Stack   : TypeScript, lucide-react
 * Layer        : Presentation (pure helper, no I/O, no business logic)
 *
 ************************************************************/

import {
  Building2,
  CalendarDays,
  CalendarRange,
  CircleDot,
  CircleUserRound,
  Clock,
  Contact,
  Gem,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
  Palmtree,
  Plug,
  ReceiptText,
  Scissors,
  ScrollText,
  Settings,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'

/** Per-route icon map keyed by Root-Path href (Req 2.2). */
export const NAV_ICON_MAP: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/bookings': CalendarDays,
  '/waitlist': Clock,
  '/customers': Users,
  '/leads': Target,
  '/staff': Scissors,
  '/schedule': CalendarRange,
  '/leave': Palmtree,
  // No '/services' entry — the sidebar nav item was removed when service
  // authoring moved to Payload CMS. `/services` is now only a redirect, so it
  // needs no icon (navIconFor falls back to DEFAULT_NAV_ICON).
  '/offers': Tag,
  '/memberships': Gem,
  '/billing': ReceiptText,
  '/reports': TrendingUp,
  '/settings': Settings,
  '/branches': Building2,
  '/users': KeyRound,
  '/integrations': Plug,
  '/logs': ScrollText,
  '/me/schedule': CalendarRange,
  '/me/leave': Palmtree,
}

/** Single predefined fallback icon (Req 2.6). */
export const DEFAULT_NAV_ICON: LucideIcon = CircleDot

/**
 * Resolve a navigation href to its lucide-react icon.
 *
 * Total function: returns the mapped icon for a known Root-Path href, or the
 * single predefined {@link DEFAULT_NAV_ICON} fallback for any unmapped href
 * (Req 2.1, 2.2, 2.6).
 *
 * Pure function: no I/O, no side effects, no business logic.
 */
export function navIconFor(href: string): LucideIcon {
  const icon = Object.hasOwn(NAV_ICON_MAP, href) ? NAV_ICON_MAP[href] : undefined
  return icon ?? DEFAULT_NAV_ICON
}

/**
 * Per-section icon map keyed by the ADMIN_NAV section title. Used by the
 * collapsible sidebar navigation to give each section's collapsible parent
 * (the `sidebar-07` NavMain pattern) a single lucide icon.
 */
export const SECTION_ICON_MAP: Record<string, LucideIcon> = {
  'Self-Service': CircleUserRound,
  Operations: LayoutDashboard,
  CRM: Contact,
  Staff: Users,
  Catalog: Sparkles,
  Finance: Wallet,
  System: Settings,
}

/**
 * Resolve a nav SECTION title to its collapsible-parent lucide icon.
 *
 * Total function: returns the mapped icon for a known section title, or the
 * single predefined {@link DEFAULT_NAV_ICON} fallback for any unmapped title.
 * Pure — no I/O, no side effects.
 */
export function sectionIconFor(title: string): LucideIcon {
  return SECTION_ICON_MAP[title] ?? DEFAULT_NAV_ICON
}
