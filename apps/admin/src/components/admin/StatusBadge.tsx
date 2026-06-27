/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : StatusBadge (back-compat shim)
 * Scope        : Admin UI
 *
 * Description  : Thin re-export shim. The Status_Badge implementation now lives
 *                in the token-driven primitive at @/components/ui/status-badge.
 *                This module preserves the existing import path
 *                (`@/components/admin/StatusBadge`) so callers (dashboard-
 *                overview, bookings-table, memberships-list, etc.) keep working
 *                without change.
 *
 * Responsibilities :
 * - Re-export the StatusBadge primitive under its legacy import path
 *
 * Tech Stack   : React, TypeScript
 * Layer        : Presentation (re-export only)
 *
 * Dependencies : @/components/ui/status-badge
 *
 * Notes        : Presentation-layer only. The legacy raw-Tailwind-palette
 *                implementation was replaced by the semantic Brand-Token
 *                primitive (Req 9.1, 9.2, 9.5, 9.6).
 ************************************************************/

export { StatusBadge } from '@/components/ui/status-badge'
