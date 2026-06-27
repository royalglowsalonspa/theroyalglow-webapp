/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : kpi-card
 * Scope        : Admin — Dashboard KPI Card primitive
 *
 * Description  : Presentation-only KPI card for the admin dashboard. Renders a
 *                metric label, an optional decorative icon, and a single
 *                pre-formatted value (monetary values are formatted by the
 *                caller via `formatINRWithPaise` so the card renders
 *                `₹1,00,000.00` verbatim — the card performs no formatting and
 *                no business logic). While `loading`, the value is replaced by
 *                a KPI-shaped loading placeholder announced to assistive tech.
 *
 * Responsibilities :
 * - Render label + pre-formatted value in token-driven card chrome (Req 10.1)
 * - Render an optional decorative lucide icon via the Icon wrapper (Req 2.4)
 * - Show a KPI loading placeholder in place of the value when `loading` (10.4)
 *
 * Features / Functionality :
 * - KPICard component (label, value, optional icon, loading)
 * - Value is caller-pre-formatted; monetary via formatINRWithPaise (Req 10.6)
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS v4 (Brand Tokens)
 * Layer        : Presentation (primitive, no I/O, no business logic)
 *
 * Dependencies : ./icon (Icon), @rgss/ui/lib/utils (cn)
 *
 * Notes        : Uses ONLY semantic Brand-Token utilities — no hex / raw
 *                Tailwind-palette literals (Req 1.1, 1.2). The loading
 *                placeholder is a minimal local fallback pending the shared
 *                `Skeleton` (variant 'kpi') from `@/components/ui/state/skeleton`
 *                (task 6.12, built in parallel); swap to the shared Skeleton
 *                once available.
 ************************************************************/

import { Icon } from '@/components/ui/icon'
import { cn } from '@rgss/ui/lib/utils'
import type { LucideIcon } from 'lucide-react'

type KPICardProps = {
  /** Short metric name, e.g. "Today's Revenue". */
  label: string
  /**
   * Pre-formatted display value. Monetary values MUST be formatted by the
   * caller via `formatINRWithPaise` (Req 10.6); the card renders this string
   * verbatim and performs no formatting.
   */
  value: string
  /** Optional decorative lucide icon shown beside the label (Req 2.4). */
  icon?: LucideIcon
  /** When true, the value is replaced by a KPI loading placeholder (Req 10.4). */
  loading?: boolean
  className?: string
}

/**
 * Dashboard KPI card. Presentation-only: renders the supplied label and the
 * caller-pre-formatted value inside token-driven card chrome, with an optional
 * decorative icon. When `loading`, the value area becomes a KPI-shaped loading
 * placeholder announced via `aria-busy` / `aria-live`.
 */
export function KPICard({
  label,
  value,
  icon,
  loading = false,
  className,
}: KPICardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-cards border border-outline-gray bg-canvas-white p-5',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-sm text-dusty-gray">{label}</span>
        {icon ? (
          <Icon icon={icon} decorative className="text-deep-gold" />
        ) : null}
      </div>

      {loading ? (
        <div
          aria-busy="true"
          aria-live="polite"
          className="h-8 w-2/3 animate-pulse rounded-cards bg-cloud-gray"
        >
          <span className="sr-only">Loading</span>
        </div>
      ) : (
        <span className="font-display text-2xl text-cocoa-dark">{value}</span>
      )}
    </div>
  )
}
