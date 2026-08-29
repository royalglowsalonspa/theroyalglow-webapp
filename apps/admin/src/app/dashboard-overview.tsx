/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Dashboard Overview
 * Scope        : Admin Portal — Dashboard KPIs, Chart & Recent Activity
 *
 * Description  : Client component that fetches live dashboard data from the
 *                admin bookings API and presents it on the redesigned admin
 *                design-system primitives: KPI cards, a recharts bar chart in a
 *                ChartCard, and a recent-activity DataTable, all driven by the
 *                useAsyncData hook with the 10-second dashboard timeout.
 *
 * Responsibilities :
 * - Fetch all bookings via useAsyncData (10s timeout, retry) (Req 10.4/10.5/10.8)
 * - Compute today's KPIs (bookings, pending, revenue, total) (Req 10.1)
 * - Render a bookings-per-day bar chart with brand-token colours (Req 10.2)
 * - Render a recent-activity DataTable beneath the cards (Req 10.3)
 * - Show skeleton / empty / error+retry state presenters (Req 10.4/10.5/10.7)
 *
 * Features / Functionality :
 * - ≥4 KPICard primitives; monetary KPI via formatINRWithPaise (Req 10.6)
 * - ChartCard hosting a recharts BarChart (CHART_COLORS brand tokens)
 * - DataTable recent-activity list with status badges + row action
 * - lucide icons via the Icon wrapper (no emoji KPI icons) (Req 2.x)
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript, recharts
 * Layer        : Presentation (Dashboard Widget)
 *
 * Dependencies : KPICard, ChartCard (CHART_COLORS), DataTable, StatusBadge,
 *                state presenters (Skeleton/EmptyState/ErrorState),
 *                useAsyncData, admin format/bookings lib, recharts, lucide-react
 *
 * Notes        :
 * - Presentation-only: consumes GET /api/bookings as-is, no business/data
 *   changes. IST date comparison uses Intl.DateTimeFormat('en-CA').
 * - Uses ONLY semantic Brand-Token utilities — no hex / raw colour / radius /
 *   font literals (Req 1.1, 1.2).
 ************************************************************/

'use client'

import { CalendarDays, Clock, IndianRupee, ListChecks, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { StatusBadge } from '@/components/admin/StatusBadge'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { ChartCard } from '@/components/ui/chart-card'
import { type AdminColumnDef, DataTable } from '@/components/ui/data-table'
import { KPICard } from '@/components/ui/kpi-card'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { DASHBOARD_ASYNC_TIMEOUT_MS, useAsyncData } from '@/components/ui/use-async-data'
import { type AdminBooking, formatTime12h } from '@/lib/admin/bookings'
import { formatINRWithPaise } from '@/lib/admin/format'

/** Number of trailing days plotted on the bookings bar chart. */
const CHART_DAY_SPAN = 7

/** Brand-token chart config for the bookings bar series (drives `--color-count`). */
const BOOKINGS_CHART_CONFIG = {
  count: { label: 'Bookings', color: 'var(--chart-1)' },
} satisfies ChartConfig

/** A single KPI summary tile for the dashboard. */
type Kpi = {
  label: string
  value: string
  icon: LucideIcon
}

/** A single bar-chart datum: one calendar day's booking count. */
type ChartDatum = {
  /** ISO `YYYY-MM-DD` day key (IST). */
  day: string
  /** Short `DD/MM` axis label. */
  label: string
  /** Number of bookings on that day. */
  count: number
}

// Today's date in IST as YYYY-MM-DD, to compare against booking dates.
function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date())
}

// The trailing `span` calendar days (IST), oldest first, as YYYY-MM-DD keys.
function lastDaysIST(span: number): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
  const now = Date.now()
  const days: string[] = []
  for (let offset = span - 1; offset >= 0; offset--) {
    days.push(fmt.format(new Date(now - offset * 86_400_000)))
  }
  return days
}

// Fetch all bookings from the admin API. Throws on a non-OK / unsuccessful
// envelope so useAsyncData settles to its error state (Req 10.5).
async function fetchBookings(): Promise<AdminBooking[]> {
  const res = await fetch('/api/bookings')
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load dashboard data.')
  }
  return json.data.bookings as AdminBooking[]
}

// Recent-activity table columns. Presentation-only cell renderers.
const RECENT_COLUMNS: AdminColumnDef<AdminBooking, unknown>[] = [
  {
    accessorKey: 'bookingNumber',
    header: 'Booking #',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-cocoa-dark">{row.original.bookingNumber}</span>
    ),
  },
  {
    accessorKey: 'customerName',
    header: 'Customer',
    cell: ({ row }) => <span className="text-cocoa-dark">{row.original.customerName}</span>,
  },
  {
    id: 'services',
    header: 'Services',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="block max-w-[14rem] truncate text-warm-gray">
        {row.original.services.map((s) => s.serviceNameSnapshot).join(', ') || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'startTime',
    header: 'Time',
    cell: ({ row }) => (
      <span className="text-warm-gray">{formatTime12h(row.original.startTime)}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: 'actions',
    header: 'Actions',
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        href={`/bookings/${row.original.id}`}
        className="font-ui text-sm text-deep-gold transition-colors hover:text-cocoa-dark"
        aria-label={`View details for booking ${row.original.bookingNumber}`}
      >
        View →
      </Link>
    ),
  },
]

/**
 * Dashboard overview widget.
 *
 * Drives all data through {@link useAsyncData} with the 10-second dashboard
 * timeout, rendering skeleton placeholders while loading, an error presenter
 * with retry on failure/timeout, and — on success — four KPI cards, a bookings
 * bar chart, and a recent-activity data table (with an empty-state presenter
 * when there are no bookings).
 */
export function DashboardOverview() {
  const { state, retry } = useAsyncData<AdminBooking[]>(fetchBookings, {
    timeoutMs: DASHBOARD_ASYNC_TIMEOUT_MS,
  })

  const loading = state.status === 'loading'
  const bookings = state.status === 'success' ? state.data : []

  const { kpis, chartData, recent } = useMemo(() => {
    const today = todayIST()
    const todaysBookings = bookings.filter((b) => b.bookingDate.slice(0, 10) === today)
    const pending = bookings.filter((b) => b.status === 'pending')
    const todaysRevenuePaise = bookings
      .filter((b) => b.bookingDate.slice(0, 10) === today && b.status === 'completed')
      .reduce((sum, b) => sum + b.totalAmountPaise, 0)

    const dayKeys = lastDaysIST(CHART_DAY_SPAN)
    const countByDay = new Map<string, number>(dayKeys.map((day) => [day, 0]))
    for (const b of bookings) {
      const day = b.bookingDate.slice(0, 10)
      if (countByDay.has(day)) {
        countByDay.set(day, (countByDay.get(day) ?? 0) + 1)
      }
    }
    const chart: ChartDatum[] = dayKeys.map((day) => ({
      day,
      label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
      count: countByDay.get(day) ?? 0,
    }))

    return {
      kpis: [
        { label: "Today's Bookings", value: String(todaysBookings.length), icon: CalendarDays },
        { label: 'Pending Approval', value: String(pending.length), icon: Clock },
        {
          label: "Today's Revenue",
          value: formatINRWithPaise(todaysRevenuePaise),
          icon: IndianRupee,
        },
        { label: 'Total Bookings', value: String(bookings.length), icon: ListChecks },
      ] satisfies Kpi[],
      chartData: chart,
      recent: bookings.slice(0, 5),
    }
  }, [bookings])

  // Failure / timeout: replace the whole dashboard with a retryable error
  // presenter (Req 10.5, 10.8).
  if (state.status === 'error') {
    return <ErrorState message={state.message} onRetry={retry} />
  }

  return (
    <div className="space-y-6">
      {/* KPI cards (Req 10.1) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((card) => (
          <KPICard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            loading={loading}
          />
        ))}
      </div>

      {/* Bookings trend chart (Req 10.2) */}
      <ChartCard
        title={`Bookings — last ${CHART_DAY_SPAN} days`}
        loading={loading}
        responsive={false}
      >
        <ChartContainer config={BOOKINGS_CHART_CONFIG} className="aspect-auto h-full w-full">
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={32}
              fontSize={12}
            />
            <ChartTooltip
              cursor={{ fill: 'var(--color-cloud-gray)' }}
              content={<ChartTooltipContent />}
            />
            <Bar dataKey="count" name="Bookings" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* Recent activity (Req 10.3) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-cocoa-dark">Recent Bookings</h2>
          <Link
            href="/bookings"
            className="font-ui text-sm text-deep-gold transition-colors hover:text-cocoa-dark"
          >
            View all →
          </Link>
        </div>

        {loading ? (
          <Skeleton variant="table" rows={5} />
        ) : recent.length === 0 ? (
          <EmptyState
            title="No bookings yet."
            message="New bookings will appear here as they come in."
            icon={CalendarDays}
          />
        ) : (
          <DataTable<AdminBooking>
            tableId="dashboard-recent"
            caption="Recent bookings"
            columns={RECENT_COLUMNS}
            data={recent}
          />
        )}
      </section>
    </div>
  )
}
