/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : roles
 * Scope        : Authorization (client + server safe)
 *
 * Description  : Tiny, dependency-free helpers for deciding admin-portal
 *                eligibility on the customer site. Used to conditionally show
 *                the "Admin Portal" shortcut in the account menu to staff and
 *                above (never to customers), and to resolve the admin origin
 *                the shortcut links to.
 *
 * Responsibilities :
 * - Define which roles are "admin-assigned" (non-customer)
 * - Decide eligibility from a role string (unknown/absent → not eligible)
 * - Resolve the admin portal URL (env-driven, with a prod fallback)
 *
 * Tech Stack   : TypeScript
 * Layer        : Shared (presentation-safe — no I/O, no framework deps)
 *
 * Dependencies : none
 *
 * Notes        :
 * - This only controls UI VISIBILITY. The real access boundary is enforced by
 *   the admin app's edge middleware + RBAC (and server-side requireRole). A
 *   customer who forced the link would still be redirected/forbidden there.
 * - We read NEXT_PUBLIC_ADMIN_URL via process.env directly (the bundler inlines
 *   NEXT_PUBLIC_* literals) rather than importing the t3-env `env` object, so
 *   this module stays safe to pull into client components without triggering
 *   client-side env validation.
 ************************************************************/

/** Roles that may enter the admin portal (everything above `customer`). */
export const ADMIN_ROLES = ['staff', 'receptionist', 'manager', 'owner', 'developer'] as const

/**
 * True when the role is an assigned, non-customer admin role. Unknown, null, or
 * 'customer' roles are not eligible (fails closed).
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role)
}

/**
 * Origin of the admin portal the "Admin Portal" shortcut links to. Driven by
 * NEXT_PUBLIC_ADMIN_URL (e.g. http://localhost:3001 in dev), falling back to
 * the production subdomain.
 */
export function adminPortalUrl(): string {
  return process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.theroyalglow.in'
}
