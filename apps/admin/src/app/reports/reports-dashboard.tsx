/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Reports Dashboard
 * Scope        : Admin Portal — Reports / Analytics
 *
 * Description  : Interactive analytics dashboard. A range selector drives a
 *                single fetch of GET /api/reports; the response feeds KPI cards,
 *                a recharts revenue-trend area chart, a recharts bookings-by-
 *                status bar chart, and a @tanstack/react-table Top Services table.
 *
 * Responsibilities :
 * - Select a date range (7d / 30d / 90d / MTD) and fetch the combined payload
 * - Render KPI cards, two charts, and a sortable services table
 * - Handle loading / error / empty states accessibly
 *
 * Features / Functionality :
 * - recharts ResponsiveContainer charts; bar + area
 * - @tanstack/react-table sortable Top Services table
 * - INR amounts via formatINR; respects prefers-reduced-motion (no chart anim)
 *
 * Tech Stack   : Next.js 16, React (Client Component), recharts,
 *                @tanstack/react-table, TypeScript
 * Layer        : Presentation (Data Dashboard Component)
 *
 * Dependencies : recharts, @tanstack/react-table, admin bookings lib (formatINR),
 *                React hooks, @rgss/types (view-model types)
 *
 * Notes        : Read-only. All aggregation happens server-side in SQL.
 ************************************************************/

'use client'

import { formatINR } from '@/lib/admin/bookings'
import type {
  BookingsByStatusPoint,
  ReportRange,
  ReportsResponse,
  RevenueTrendPoint,
  TopServiceRow,
} from '@rgss/types'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
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

export function ReportsDashboard() {
  const [range, setRange] = useState<ReportRange>('30d')
  const [data, setData] = useState<ReportsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports?range=${range}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load reports.')
      }
      setData(json.data as ReportsResponse)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load reports.')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Reports</h1>
          <p className="font-sans text-sm text-dusty-gray mt-0.5">
            Revenue, bookings, and top services across your chosen date range.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="report-range"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Date range
          </label>
          <select
            id="report-range"
            value={range}
            onChange={(e) => setRange(e.target.value as ReportRange)}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <KpiCards data={data} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <RevenueTrendChart points={data.revenueTrend} reducedMotion={reducedMotion} />
            <BookingsStatusChart points={data.bookingsByStatus} reducedMotion={reducedMotion} />
          </div>

          <TopServicesTable rows={data.topServices} />
        </div>
      )}
    </div>
  )
}

function KpiCards({ data }: { data: ReportsResponse }) {
  const { summary } = data
  const cards = [
    { label: 'Revenue (range)', value: formatINR(summary.rangeRevenuePaise) },
    { label: 'Bookings (range)', value: String(summary.bookingCount) },
    { label: 'Avg ticket', value: formatINR(summary.avgTicketPaise) },
    { label: 'Month to date', value: formatINR(summary.mtdRevenuePaise) },
  ]
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="border border-cloud-gray rounded-[6px] bg-canvas-white px-4 py-3.5"
        >
          <dt className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray">
            {card.label}
          </dt>
          <dd className="mt-1 text-xl font-display text-cocoa-dark tracking-tight">{card.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="border border-cloud-gray rounded-[6px] bg-canvas-white p-4"
      aria-label={title}
    >
      <h2 className="text-sm font-ui uppercase tracking-wider text-dusty-gray mb-3">{title}</h2>
      {children}
    </section>
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
  return (
    <ChartCard title="Revenue trend">
      {hasData ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#bfa05a" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#bfa05a" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ece7df" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => v.slice(5)}
                tick={{ fontSize: 11, fill: '#9a9388' }}
                tickLine={false}
                axisLine={{ stroke: '#ece7df' }}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(v: number) => formatINR(v)}
                tick={{ fontSize: 11, fill: '#9a9388' }}
                tickLine={false}
                axisLine={false}
                width={72}
              />
              <Tooltip
                formatter={(value: unknown) => [formatINR(Number(value)), 'Revenue']}
                labelFormatter={(label: unknown) => `Date: ${String(label)}`}
                contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: '#ece7df' }}
              />
              <Area
                type="monotone"
                dataKey="revenuePaise"
                stroke="#bfa05a"
                strokeWidth={2}
                fill="url(#revenueFill)"
                isAnimationActive={!reducedMotion}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ChartEmpty message="No paid revenue in this range yet." />
      )}
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
  return (
    <ChartCard title="Bookings by status">
      {chartData.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ece7df" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9a9388' }}
                tickLine={false}
                axisLine={{ stroke: '#ece7df' }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={48}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#9a9388' }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                formatter={(value: unknown) => [String(value), 'Bookings']}
                contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: '#ece7df' }}
                cursor={{ fill: '#f5f1ea' }}
              />
              <Bar
                dataKey="count"
                fill="#8a6d3b"
                radius={[4, 4, 0, 0]}
                isAnimationActive={!reducedMotion}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ChartEmpty message="No bookings in this range yet." />
      )}
    </ChartCard>
  )
}

function TopServicesTable({ rows }: { rows: TopServiceRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'revenuePaise', desc: true }])

  const columns = useMemo<ColumnDef<TopServiceRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Service',
        cell: (info) => (
          <span className="font-sans text-cocoa-dark">{info.getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'bookings',
        header: 'Bookings',
        cell: (info) => (
          <span className="font-ui text-warm-gray tabular-nums">{info.getValue<number>()}</span>
        ),
      },
      {
        accessorKey: 'revenuePaise',
        header: 'Revenue',
        cell: (info) => (
          <span className="font-ui text-cocoa-dark tabular-nums">
            {formatINR(info.getValue<number>())}
          </span>
        ),
      },
    ],
    [],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <ChartCard title="Top services">
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="bg-cloud-gray/60">
                  {headerGroup.headers.map((header) => {
                    const sorted = header.column.getIsSorted()
                    return (
                      <th
                        key={header.id}
                        className="text-left px-4 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray"
                        aria-sort={
                          sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
                        }
                      >
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-cocoa-dark transition-colors focus:outline-none focus:ring-2 focus:ring-deep-gold rounded-[4px]"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span aria-hidden="true" className="text-[10px]">
                            {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}
                          </span>
                        </button>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-cloud-gray">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-cloud-gray/30 transition-colors">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ChartEmpty message="No services sold in this range yet." />
      )}
    </ChartCard>
  )
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-center">
      <p className="font-sans text-sm text-dusty-gray">{message}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <output
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading reports…</span>
    </output>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border border-error/40 bg-error/5 rounded-[6px] px-5 py-10 text-center">
      <p className="font-sans text-sm text-error mb-3" role="alert">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-[6px] bg-cocoa-dark text-canvas-white text-sm font-ui hover:bg-warm-gray transition-colors"
      >
        Try Again
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 text-center">
      <p className="font-sans text-sm text-cocoa-dark mb-1">No report data</p>
      <p className="font-sans text-xs text-dusty-gray">
        Reports populate as bookings are completed and invoices are paid.
      </p>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-deep-gold"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
