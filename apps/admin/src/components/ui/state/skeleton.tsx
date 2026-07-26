/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : state/skeleton
 * Scope        : Admin — State Presenters / Loading Skeleton
 *
 * Description  : Loading-state presenter for the admin design system. Renders a
 *                token-styled skeleton placeholder that occupies the same
 *                footprint as the content it stands in for, showing one
 *                placeholder row per expected record up to a hard maximum of 10
 *                rows. The wrapper announces the loading state to assistive
 *                technology via a polite live region.
 *
 * Responsibilities :
 * - Render `min(max(0, rows), 10)` placeholder rows (Req 12.1)
 * - Match the table / card / KPI content footprint via `variant`
 * - Announce loading via `aria-live="polite"` + `aria-busy="true"` (Req 12.7)
 *
 * Features / Functionality :
 * - skeletonRowCount(n) — pure row-count clamp helper (Property 14)
 * - Skeleton — variant-aware loading placeholder presenter
 *
 * Tech Stack   : React, TypeScript, Tailwind CSS v4 (Brand Tokens)
 * Layer        : Presentation (primitive, no I/O, no business logic)
 *
 * Dependencies : @rgss/ui/lib/utils
 *
 * Notes        : Uses ONLY semantic Brand-Token utilities — no hex / raw
 *                colour literals (Req 1.2). The pulse animation is suppressed
 *                under `prefers-reduced-motion` via `motion-reduce:animate-none`
 *                (Req 13.6).
 ************************************************************/

import { cn } from '@rgss/ui/lib/utils'
import { Skeleton as ShadcnSkeleton } from '@/components/ui/skeleton'

/** Hard upper bound on rendered skeleton rows (Req 12.1). */
const MAX_SKELETON_ROWS = 10

/**
 * Stable, unique keys for the (interchangeable) placeholder rows. Sliced to the
 * clamped row count so React keys never fall back to the array index.
 */
const SKELETON_ROW_KEYS = Array.from(
  { length: MAX_SKELETON_ROWS },
  (_, index) => `skeleton-row-${index}`,
)

/** Default number of placeholder rows when `rows` is not supplied. */
const DEFAULT_SKELETON_ROWS = 5

/**
 * Pure row-count clamp used by the {@link Skeleton} presenter.
 *
 * Clamps an expected-record count into the inclusive range `[0, 10]`, so the
 * skeleton renders one placeholder row per expected record up to a maximum of
 * ten (Req 12.1). Negative inputs floor to `0`.
 *
 * @param n - Expected record count (may be any number, incl. negative).
 * @returns `Math.min(Math.max(0, n), 10)`.
 */
export function skeletonRowCount(n: number): number {
  return Math.min(Math.max(0, n), MAX_SKELETON_ROWS)
}

/** Visual footprint the skeleton should mimic. */
type SkeletonVariant = 'table' | 'card' | 'kpi'

type SkeletonProps = {
  /** Expected record count; clamped to `[0, 10]` rows (defaults to 5). */
  rows?: number
  /** Content footprint to mimic (defaults to `'table'`). */
  variant?: SkeletonVariant
  className?: string
}

/** Shared bar styling layered onto the shadcn Skeleton (brand surface). */
const BAR = 'rounded-cards bg-cloud-gray'

/**
 * Render the placeholder body for a single skeleton row, shaped per variant.
 */
function SkeletonRow({ variant }: { variant: SkeletonVariant }) {
  if (variant === 'kpi') {
    return (
      <div className="flex flex-col gap-3 rounded-cards border border-cloud-gray p-5">
        <ShadcnSkeleton className={cn(BAR, 'h-3 w-24')} />
        <ShadcnSkeleton className={cn(BAR, 'h-7 w-32')} />
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className="flex flex-col gap-3 rounded-cards border border-cloud-gray p-5">
        <ShadcnSkeleton className={cn(BAR, 'h-4 w-2/3')} />
        <ShadcnSkeleton className={cn(BAR, 'h-3 w-full')} />
        <ShadcnSkeleton className={cn(BAR, 'h-3 w-5/6')} />
      </div>
    )
  }

  // table
  return (
    <div className="flex items-center gap-4 border-b border-cloud-gray px-4 py-3">
      <ShadcnSkeleton className={cn(BAR, 'h-4 w-1/4')} />
      <ShadcnSkeleton className={cn(BAR, 'h-4 w-1/4')} />
      <ShadcnSkeleton className={cn(BAR, 'h-4 w-1/6')} />
      <ShadcnSkeleton className={cn(BAR, 'ml-auto h-4 w-16')} />
    </div>
  )
}

/**
 * Loading-state presenter.
 *
 * Renders exactly `skeletonRowCount(rows)` placeholder rows matching the chosen
 * content footprint (Req 12.1). The wrapper is a polite live region marked
 * `aria-busy`, so assistive technology announces that content is loading
 * without interrupting the user (Req 12.7).
 *
 * Presentation-only: no I/O, no business logic.
 *
 * @param props - {@link SkeletonProps}
 * @returns The rendered loading skeleton.
 */
export function Skeleton({
  rows = DEFAULT_SKELETON_ROWS,
  variant = 'table',
  className,
}: SkeletonProps) {
  const count = skeletonRowCount(rows)

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn(
        variant === 'kpi' || variant === 'card'
          ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'
          : 'flex flex-col',
        className,
      )}
    >
      <span className="sr-only">Loading…</span>
      {SKELETON_ROW_KEYS.slice(0, count).map((key) => (
        <SkeletonRow key={key} variant={variant} />
      ))}
    </div>
  )
}
