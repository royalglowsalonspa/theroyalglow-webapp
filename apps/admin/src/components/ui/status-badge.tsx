/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : status-badge
 * Scope        : Admin — Status Badge primitive
 *
 * Description  : Token-driven Status_Badge primitive for the admin design
 *                system. Renders a pill (colour-coded dot + Title Case text
 *                label) for any booking / payment / membership / lead status.
 *                Colour is mapped through the pure @/lib/admin/status-badge
 *                helpers to one of four semantic Brand-Token variants.
 *
 * Responsibilities :
 * - Resolve a status value to a semantic variant + Title Case label
 * - Render a token-styled pill with an aria-hidden dot and visible label
 * - Guarantee colour is never the sole signal (text label always present)
 *
 * Features / Functionality :
 * - VARIANT_CLASSES variant → semantic Brand-Token utility map
 * - StatusBadge component (status + optional className props)
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS v4 (Brand Tokens)
 * Layer        : Presentation (primitive, no I/O, no business logic)
 *
 * Dependencies : @/lib/admin/status-badge, @rgss/ui/lib/utils
 *
 * Notes        : Uses ONLY semantic Brand-Token utilities — no hex / raw
 *                Tailwind-palette literals (Req 1.2). Contrast verified
 *                ≥4.5:1 per the design variant → token table (Req 9.5).
 ************************************************************/

import { type BadgeVariant, labelForStatus, variantForStatus } from '@/lib/admin/status-badge'
import { cn } from '@rgss/ui/lib/utils'

/**
 * Variant → semantic Brand-Token utility classes. Each entry is
 * contrast-verified ≥4.5:1 against its background per the design's variant →
 * token table (Req 9.5). The `warning` variant deliberately uses
 * `text-warm-gray` (not gold-on-white) to keep small-text contrast ≥4.5:1.
 */
const VARIANT_CLASSES: Record<BadgeVariant, { pill: string; dot: string }> = {
  success: { pill: 'bg-success/10 text-success-dark', dot: 'bg-success' },
  warning: { pill: 'bg-warning/15 text-warm-gray', dot: 'bg-warning' },
  error: { pill: 'bg-error/10 text-error', dot: 'bg-error' },
  neutral: { pill: 'bg-cloud-gray text-warm-gray', dot: 'bg-dusty-gray' },
}

type StatusBadgeProps = {
  /** Raw status value (snake_case). Null / undefined / empty → neutral. */
  status: string | null | undefined
  className?: string
}

/**
 * Render a semantic status pill: an `aria-hidden` colour dot followed by the
 * Title Case status label. The text label is the accessible content, so
 * colour is never the sole signal (Req 9.1, 9.6).
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = variantForStatus(status)
  const label = labelForStatus(status)
  const classes = VARIANT_CLASSES[variant]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 font-ui text-xs font-medium',
        classes.pill,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-pill', classes.dot)} aria-hidden="true" />
      {label}
    </span>
  )
}
