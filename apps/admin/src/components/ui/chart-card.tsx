/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : chart-card
 * Scope        : Admin — Dashboard Chart Card primitive
 *
 * Description  : Presentation-only chart card for the admin dashboard. Provides
 *                token-driven card chrome + a title and hosts an arbitrary
 *                `recharts` chart (passed as children) inside a
 *                `ResponsiveContainer` so the chart fluidly fills the card width
 *                (Req 14.3). While `loading`, the chart area is replaced by a
 *                chart-shaped loading placeholder announced to assistive tech.
 *
 * Responsibilities :
 * - Render a titled card with a responsive recharts host area (Req 10.2)
 * - Expose brand-token chart colours (CSS-variable references, not hex) so
 *   callers feed recharts series brand colours (Req 1.1, 1.2)
 * - Show a loading placeholder in place of the chart when `loading`
 *
 * Features / Functionality :
 * - ChartCard component (title, children, loading)
 * - CHART_COLORS — brand-token colour references for recharts series
 *
 * Tech Stack   : React, TypeScript, recharts v3, Tailwind CSS v4 (Brand Tokens)
 * Layer        : Presentation (primitive, no I/O, no business logic)
 *
 * Dependencies : recharts (ResponsiveContainer), @rgss/ui/lib/utils (cn)
 *
 * Notes        : Client component — `ResponsiveContainer` measures the DOM.
 *                Uses ONLY semantic Brand-Token utilities / CSS-variable colour
 *                references — no hex / raw Tailwind-palette literals (Req 1.1,
 *                1.2). The loading placeholder is a minimal local fallback
 *                pending the shared `Skeleton` (variant 'card') from
 *                `@/components/ui/state/skeleton` (task 6.12, built in parallel).
 ************************************************************/

'use client'

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@rgss/ui/lib/utils'
import type { ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'

/**
 * Brand-token chart colours for recharts series. Each value is a CSS custom
 * property reference resolving to a Brand-Token hex at runtime (Req 1.1, 1.2) —
 * never a raw hex literal in component source. Pass these to recharts series
 * props (e.g. `<Bar fill={CHART_COLORS.primary} />`).
 */
export const CHART_COLORS = {
  primary: 'var(--chart-1)',
  secondary: 'var(--chart-2)',
  accent: 'var(--chart-3)',
  grid: 'var(--color-outline-gray)',
  axis: 'var(--color-dusty-gray)',
} as const

type ChartCardProps = {
  /** Card heading describing the chart. */
  title: string
  /** A recharts chart element rendered inside the ResponsiveContainer (Req 10.2). */
  children: ReactNode
  /** When true, the chart area is replaced by a loading placeholder. */
  loading?: boolean
  /**
   * When true (default), the chart child is wrapped in a recharts
   * `ResponsiveContainer`. Set false when the child already manages its own
   * sizing (e.g. a shadcn `ChartContainer`), to avoid nesting two responsive
   * containers.
   */
  responsive?: boolean
  className?: string
}

/**
 * Dashboard chart card. Presentation-only: renders token-driven card chrome and
 * a title, then hosts the supplied recharts chart inside a `ResponsiveContainer`
 * so it fills the available width. When `loading`, the chart area becomes a
 * chart-shaped loading placeholder announced via `aria-busy` / `aria-live`.
 */
export function ChartCard({
  title,
  children,
  loading = false,
  responsive = true,
  className,
}: ChartCardProps) {
  return (
    <Card className={cn('gap-4 rounded-cards border-outline-gray p-5', className)}>
      <h3 className="font-display text-base text-cocoa-dark">{title}</h3>

      {loading ? (
        <div aria-busy="true" aria-live="polite">
          <Skeleton className="h-72 w-full rounded-cards bg-cloud-gray" />
          <span className="sr-only">Loading chart</span>
        </div>
      ) : (
        <div className="h-72 w-full">
          {responsive ? (
            <ResponsiveContainer height="100%" width="100%">
              {children}
            </ResponsiveContainer>
          ) : (
            children
          )}
        </div>
      )}
    </Card>
  )
}
