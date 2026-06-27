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
  Clock,
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
  '/services': Sparkles,
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
