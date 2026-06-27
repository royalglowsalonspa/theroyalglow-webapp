/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : status-badge
 * Scope        : Admin — Status Badge system
 *
 * Description  : Pure presentation mapping for the admin Status_Badge. Maps a
 *                recognised snake_case status value to one of four semantic
 *                Brand-Token variants and formats the status into a
 *                human-readable Title Case label.
 *
 * Responsibilities :
 * - Map recognised status values to a semantic badge variant
 * - Fall back to a neutral variant for empty / unrecognised values
 * - Format snake_case status values into Title Case labels
 * - Provide a fixed placeholder label when no value is present
 *
 * Features / Functionality :
 * - BadgeVariant type ('success' | 'warning' | 'error' | 'neutral')
 * - STATUS_VARIANT recognised-status → variant map
 * - variantForStatus() — variant resolution with neutral fallback
 * - labelForStatus() — snake_case → Title Case with placeholder fallback
 *
 * Tech Stack   : TypeScript
 * Layer        : Presentation (pure helper, no I/O, no business logic)
 *
 * Notes        : No colour literals live here — this is the pure mapping only.
 *                The variant → token CSS classes live in the StatusBadge
 *                component (task 3.1). Confined to apps/admin/src/lib/admin/.
 ************************************************************/

/**
 * The four semantic badge variants, each backed by a Brand-Token colour in the
 * StatusBadge component: success (positive/completed), warning (pending/
 * in-progress), error (negative/terminal-failure), and neutral (default).
 */
export type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral'

/**
 * Fixed placeholder label used when no status value is present
 * (empty, null, or undefined).
 */
export const STATUS_LABEL_PLACEHOLDER = 'Unknown'

/**
 * Recognised snake_case status values mapped to their semantic
 * {@link BadgeVariant}. Any value absent from this map resolves to `neutral`
 * via {@link variantForStatus} (Req 9.2, 9.4).
 */
export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  // success — positive or completed states
  confirmed: 'success',
  completed: 'success',
  active: 'success',
  paid: 'success',
  won: 'success',
  approved: 'success',
  // warning — pending or in-progress states
  pending: 'warning',
  follow_up: 'warning',
  in_progress: 'warning',
  contacted: 'warning',
  rescheduled: 'warning',
  // error — negative or terminal-failure states
  rejected: 'error',
  cancelled: 'error',
  no_show: 'error',
  expired: 'error',
  lost: 'error',
  // branch lifecycle (branch_status enum) — operational is positive, an
  // imminent open or a temporary closure is a transitional/warning state, and
  // a shutdown is terminal.
  operational: 'success',
  opens_soon: 'warning',
  temporarily_closed: 'warning',
  shutdown: 'error',
  // account access state — a usable account is positive; a banned account is
  // a terminal-failure (negative) state.
  banned: 'error',
  // integration health states (/integrations) — `unconfigured` falls back to
  // neutral via variantForStatus.
  ok: 'success',
  degraded: 'warning',
  // audit-log action categories (/logs).
  create: 'success',
  update: 'warning',
  status_change: 'warning',
  delete: 'error',
}

/**
 * Resolve a status value to its semantic {@link BadgeVariant}.
 *
 * Empty, whitespace-only, null, or undefined values, and any value with no
 * defined mapping in {@link STATUS_VARIANT}, resolve to `neutral` (Req 9.4).
 *
 * Pure function: no I/O, no side effects, no business logic.
 */
export function variantForStatus(status: string | null | undefined): BadgeVariant {
  if (status == null || status.trim() === '') {
    return 'neutral'
  }
  // Own-key guard: prototype keys ('__proto__', 'constructor', etc.) would
  // resolve to inherited Object.prototype members via index access, so they
  // must be excluded explicitly — anything not an own key falls back to neutral.
  return Object.hasOwn(STATUS_VARIANT, status) ? (STATUS_VARIANT[status] ?? 'neutral') : 'neutral'
}

/**
 * Format a status value into a human-readable Title Case label.
 *
 * Each underscore is replaced with a single space and the first letter of every
 * word is capitalised (Req 9.3). Empty, whitespace-only, null, or undefined
 * values yield the fixed {@link STATUS_LABEL_PLACEHOLDER} (Req 9.4).
 *
 * Pure function: no I/O, no side effects, no business logic.
 */
export function labelForStatus(status: string | null | undefined): string {
  if (status == null || status.trim() === '') {
    return STATUS_LABEL_PLACEHOLDER
  }
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
