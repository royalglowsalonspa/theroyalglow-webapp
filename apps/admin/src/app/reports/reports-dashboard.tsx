/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Reports Dashboard
 * Scope        : Admin Portal — Reports / Analytics
 *
 * Description  : Interactive analytics dashboard rebuilt on the admin design-
 *                system primitives. A range selector (via the FilterBar) drives
 *                a single fetch of GET /api/reports; the response feeds KPICard
 *                summaries, two ChartCard visualisations (a recharts revenue-
 *                trend area chart and a bookings-by-status bar chart), and a
 *                DataTable Top Services list. Loading / empty / error states use
 *                the shared state presenters; the fetch + timeout is delegated
 *                to useAsyncData.
 *
 * Responsibilities :
 * - Select a date range (7d / 30d / 90d / MTD) and re-fetch the payload
 * - Render KPICards, two ChartCards, and a sortable DataTable of services
 * - Handle loading / error / empty states accessibly
 *
 * Features / Functionality :
 * - recharts ResponsiveContainer charts hosted by the ChartCard primitive
 * - DataTable Top Services table (sortable, INR amounts)
 * - INR figures via formatINRWithPaise; respects prefers-reduced-motion
 * - Brand-token chart colours via CHART_COLORS / CSS variables (no hex)
 *
 * Tech Stack   : Next.js 16, React (Client Component), recharts,
 *                @tanstack/react-table, TypeScript
 * Layer        : Presentation (Data Dashboard Component)
 *
 * Dependencies : @/components/ui/{kpi-card,chart-card,data-table,filter-bar},
 *                @/components/ui/state/*, @/components/ui/use-async-data,
 *                @/lib/admin/format, recharts, @rgss/types (view-model types)
 *
 * Notes        :
 * - Presentation-layer only. All aggregation happens server-side in SQL; the
 *   report figures are rendered verbatim. Every pre-redesign figure and the
 *   range selector are preserved.
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { ChartCard, CHART_COLORS } from '@/components/ui/chart-card'
import { DataTable } from '@/components/ui/data-table'
import { FilterBar } from '@/components/ui/filter-bar'
import { KPICard } from '@/components/ui/kpi-card'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatINR, formatINRWithPaise } from '@/lib/admin/format'
import type {
  BookingsByStatusPoint,
  ReportRange,
  ReportsResponse,
  RevenueTrendPoint,
  TopServiceRow,
} from '@rgss/types'
import type { ColumnDef } from '@tanstack/react-table'
import { CalendarRange, Gem, IndianRupee, Receipt, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const RANGE_OPTIONS: { value: ReportRange; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'mtd', label: 'Month to date' },
]

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  rejected: 'Rejected',
  rescheduled: 'Rescheduled',
}

// Shared recharts presentation constants (brand-token colour references, never
// hex literals) so axes / grids / tooltips stay on-brand.
const AXIS_TICK = { fontSize: 11, fill: CHART_COLORS.axis } as const
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 6, borderColor: CHART_COLORS.grid } as const

// SSR-safe prefers-reduced-motion hook. Disables chart animations when the user
// has requested reduced motion.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

async function fetchReports(range: ReportRange): Promise<ReportsResponse> {
  const res = await fetch(`/api/reports?range=${range}`)
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load reports.')
  }
  return json.data as ReportsResponse
}

export function ReportsDashboard() {
  const [range, setRange] = useState<ReportRange>('30d')
  const reducedMotion = usePrefersReducedMotion()

  const fetcher = useCallback(() => fetchReports(range), [range])
  const { state, retry } = useAsyncData(fetcher)

  // Re-request when the range changes; the initial mount fetch is owned by the
  // hook, so skip the very first effect run to avoid a duplicate request.
  const didMount = useRef(false)
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    retry()
  }, [range, retry])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Reports</h1>
          <p className="mt-0.5 font-sans text-sm text-dusty-gray">
            Revenue, bookings, and top services across your chosen date range.
          </p>
        </div>
        <FilterBar
          config={{
            dropdowns: [
              {
                id: 'range',
                label: 'Date range',
                options: RANGE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
                value: range,
              },
            ],
          }}
          onFilterChange={(id, value) => {
            if (id === 'range') {
              setRange(value as ReportRange)
            }
          }}
        />
      </div>

      {state.status === 'loading' ? (
        <Skeleton rows={4} variant="kpi" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : (
        <div className="space-y-6">
          <KpiCards data={state.data} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <RevenueTrendChart points={state.data.revenueTrend} reducedMotion={reducedMotion} />
            <BookingsStatusChart
              points={state.data.bookingsByStatus}
              reducedMotion={reducedMotion}
            />
          </div>

          <TopServicesTable rows={state.data.topServices} />
        </div>
      )}
    </div>
  )
}

function KpiCards({ data }: { data: ReportsResponse }) {
  const { summary } = data
  const cards = [
    { label: 'Revenue (range)', value: formatINRWithPaise(summary.rangeRevenuePaise), icon: IndianRupee },
    { label: 'Bookings (range)', value: String(summary.bookingCount), icon: Receipt },
    { label: 'Avg ticket', value: formatINRWithPaise(summary.avgTicketPaise), icon: Gem },
    { label: 'Month to date', value: formatINRWithPaise(summary.mtdRevenuePaise), icon: TrendingUp },
  ]
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <KPICard key={card.label} label={card.label} value={card.value} icon={card.icon} />
      ))}
    </div>
  )
}

function RevenueTrendChart({
  points,
  reducedMotion,
}: {
  points: RevenueTrendPoint[]
  reducedMotion: boolean
}) {
  const hasData = points.some((p) => p.revenuePaise > 0)
  if (!hasData) {
    return (
      <EmptyChartCard title="Revenue trend" message="No paid revenue in this range yet." />
    )
  }
  return (
    <ChartCard title="Revenue trend">
      <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.5} />
            <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => v.slice(5)}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: CHART_COLORS.grid }}
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(v: number) => formatINR(v)}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <Tooltip
          formatter={(value: unknown) => [formatINRWithPaise(Number(value)), 'Revenue']}
          labelFormatter={(label: unknown) => `Date: ${String(label)}`}
          contentStyle={TOOLTIP_STYLE}
        />
        <Area
          type="monotone"
          dataKey="revenuePaise"
          stroke={CHART_COLORS.primary}
          strokeWidth={2}
          fill="url(#revenueFill)"
          isAnimationActive={!reducedMotion}
        />
      </AreaChart>
    </ChartCard>
  )
}

function BookingsStatusChart({
  points,
  reducedMotion,
}: {
  points: BookingsByStatusPoint[]
  reducedMotion: boolean
}) {
  const chartData = useMemo(
    () => points.map((p) => ({ ...p, label: STATUS_LABEL[p.status] ?? p.status })),
    [points],
  )
  if (chartData.length === 0) {
    return (
      <EmptyChartCard title="Bookings by status" message="No bookings in this range yet." />
    )
  }
  return (
    <ChartCard title="Bookings by status">
      <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: CHART_COLORS.grid }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={48}
        />
        <YAxis
          allowDecimals={false}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          formatter={(value: unknown) => [String(value), 'Bookings']}
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: 'var(--color-cloud-gray)' }}
        />
        <Bar
          dataKey="count"
          fill={CHART_COLORS.secondary}
          radius={[4, 4, 0, 0]}
          isAnimationActive={!reducedMotion}
        />
      </BarChart>
    </ChartCard>
  )
}

function TopServicesTable({ rows }: { rows: TopServiceRow[] }) {
  const columns = useMemo<ColumnDef<TopServiceRow, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Service',
        cell: ({ row }) => <span className="text-cocoa-dark">{row.original.name}</span>,
      },
      {
        accessorKey: 'bookings',
        header: 'Bookings',
        cell: ({ row }) => (
          <span className="block text-right font-ui tabular-nums text-warm-gray">
            {row.original.bookings}
          </span>
        ),
      },
      {
        accessorKey: 'revenuePaise',
        header: 'Revenue',
        cell: ({ row }) => (
          <span className="block text-right font-ui tabular-nums text-cocoa-dark">
            {formatINRWithPaise(row.original.revenuePaise)}
          </span>
        ),
      },
    ],
    [],
  )

  if (rows.length === 0) {
    return (
      <EmptyChartCard title="Top services" message="No services sold in this range yet." />
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-cards border border-outline-gray bg-canvas-white p-5">
      <h3 className="font-display text-base text-cocoa-dark">Top services</h3>
      <DataTable
        columns={columns}
        data={rows}
        tableId="top-services"
        caption="Top services by revenue for the selected range"
      />
    </section>
  )
}

// Titled card chrome matching ChartCard, used to present the empty-state for a
// chart slot via the shared EmptyState presenter (Req 17.4).
function EmptyChartCard({ title, message }: { title: string; message: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-cards border border-outline-gray bg-canvas-white p-5">
      <h3 className="font-display text-base text-cocoa-dark">{title}</h3>
      <EmptyState icon={CalendarRange} title="Nothing to show yet" message={message} />
    </section>
  )
}
