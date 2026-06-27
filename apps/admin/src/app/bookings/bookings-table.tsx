/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Bookings Table
 * Scope        : Admin Portal — Booking Management
 *
 * Description  : Interactive bookings list rebuilt on the admin design-system
 *                primitives. Renders the list via the reusable DataTable, its
 *                controls via the FilterBar, statuses via StatusBadge, and
 *                loading / empty / error conditions via the shared state
 *                presenters. Fetch orchestration + timeout is delegated to the
 *                useAsyncData hook. Consumes GET /api/bookings as-is.
 *
 * Responsibilities :
 * - Fetch bookings with filter parameters (status, date, serviceType)
 * - Render the FilterBar (status dropdown, salon/spa tabs, column visibility,
 *   client-side search) plus a preserved date filter control
 * - Render bookings in the DataTable with sortable columns + status badges
 * - Provide the per-row "View details" action linking to the detail page
 * - Surface loading / empty / error states via the state presenters
 *
 * Features / Functionality :
 * - Multi-filter support (status, date, salon/spa type) — unchanged effects
 * - Lifted column-visibility shared between DataTable and FilterBar (Req 7.5)
 * - Client-side global search over the rendered rows (Req 8.2)
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table
 * Layer        : Presentation (Data Table Component)
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/filter-bar,
 *                @/components/ui/status-badge, @/components/ui/state/*,
 *                @/components/ui/use-async-data, @/lib/admin/bookings,
 *                next/navigation
 *
 * Notes        :
 * - Presentation-layer only: no API/RBAC/data-model/business-logic changes.
 * - Uses ONLY semantic Brand-Token utilities — no hex / raw radius literals.
 * - Every pre-redesign field (Booking #, Customer, Date, Time, Services,
 *   Status, Total) and the "View details" action are preserved (Req 17.6, 17.7).
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { DataTable, type RowAction } from '@/components/ui/data-table'
import { type ColumnToggle, FilterBar } from '@/components/ui/filter-bar'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import {
  type AdminBooking,
  formatDateDDMMYYYY,
  formatINR,
  formatTime12h,
} from '@/lib/admin/bookings'
import type { ColumnDef, VisibilityState } from '@tanstack/react-table'
import { CalendarDays, Eye, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'no_show', label: 'No Show' },
]

const SERVICE_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'salon', label: 'Salon' },
  { value: 'spa', label: 'SPA' },
]

/** Toggleable data columns surfaced to the FilterBar column-visibility control. */
const COLUMN_META: { id: string; label: string }[] = [
  { id: 'bookingNumber', label: 'Booking #' },
  { id: 'customerName', label: 'Customer' },
  { id: 'bookingDate', label: 'Date' },
  { id: 'startTime', label: 'Time' },
  { id: 'services', label: 'Services' },
  { id: 'status', label: 'Status' },
  { id: 'totalAmountPaise', label: 'Total' },
]

async function fetchBookings(
  status: string,
  serviceType: string,
  date: string,
): Promise<AdminBooking[]> {
  const params = new URLSearchParams()
  if (status !== 'all') {
    params.set('status', status)
  }
  if (serviceType !== 'all') {
    params.set('serviceType', serviceType)
  }
  if (date) {
    params.set('date', date)
  }
  const qs = params.toString()
  const res = await fetch(`/api/bookings${qs ? `?${qs}` : ''}`)
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load bookings.')
  }
  return json.data.bookings as AdminBooking[]
}

export function BookingsTable() {
  const router = useRouter()
  const [status, setStatus] = useState('all')
  const [serviceType, setServiceType] = useState('all')
  const [date, setDate] = useState('')
  const [search, setSearch] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const fetcher = useCallback(
    () => fetchBookings(status, serviceType, date),
    [status, serviceType, date],
  )
  const { state, retry } = useAsyncData(fetcher)

  // Re-request when a filter changes; the initial mount fetch is owned by the
  // hook, so skip the very first effect run to avoid a duplicate request.
  // NOTE: status/serviceType/date are intentional re-run TRIGGERS, not direct
  // references — useAsyncData holds the latest `fetcher` (which closes over
  // these values) in a ref and does NOT auto-re-run on fetcher identity change,
  // so this effect must depend on the raw filter values to re-issue via retry().
  const didMount = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: filter values are intentional re-run triggers (see note above)
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    retry()
  }, [status, serviceType, date, retry])

  const columns = useMemo<ColumnDef<AdminBooking, unknown>[]>(
    () => [
      {
        id: 'bookingNumber',
        accessorKey: 'bookingNumber',
        header: 'Booking #',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.bookingNumber}</span>,
      },
      {
        id: 'customerName',
        accessorKey: 'customerName',
        header: 'Customer',
      },
      {
        id: 'bookingDate',
        accessorKey: 'bookingDate',
        header: 'Date',
        cell: ({ row }) => (
          <span className="text-warm-gray">{formatDateDDMMYYYY(row.original.bookingDate)}</span>
        ),
      },
      {
        id: 'startTime',
        accessorKey: 'startTime',
        header: 'Time',
        cell: ({ row }) => (
          <span className="text-warm-gray">{formatTime12h(row.original.startTime)}</span>
        ),
      },
      {
        id: 'services',
        accessorFn: (booking) =>
          booking.services.map((service) => service.serviceNameSnapshot).join(', '),
        header: 'Services',
        cell: ({ row }) => {
          const names = row.original.services
            .map((service) => service.serviceNameSnapshot)
            .join(', ')
          return (
            <span className="block max-w-[200px] truncate text-warm-gray" title={names}>
              {names || '—'}
            </span>
          )
        },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'totalAmountPaise',
        accessorKey: 'totalAmountPaise',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-ui">{formatINR(row.original.totalAmountPaise)}</span>
        ),
      },
    ],
    [],
  )

  const rowActions = useCallback(
    (row: { original: AdminBooking }): RowAction[] => [
      {
        label: 'View details',
        icon: Eye,
        onSelect: () => router.push(`/bookings/${row.original.id}`),
      },
    ],
    [router],
  )

  const columnToggles: ColumnToggle[] = COLUMN_META.map((meta) => ({
    id: meta.id,
    label: meta.label,
    visible: columnVisibility[meta.id] !== false,
  }))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Bookings</h1>
        {/* Entry point to the walk-in creation flow (root-path link, lucide icon). */}
        <Link
          href="/bookings/new"
          className="inline-flex items-center gap-1.5 rounded-buttons bg-cocoa-dark px-4 py-2 font-ui text-sm text-canvas-white transition-colors hover:bg-cocoa-dark/90 motion-reduce:transition-none"
        >
          <Icon icon={Plus} decorative size={16} />
          New walk-in
        </Link>
      </div>

      {/* Controls: FilterBar (search, status, type tabs, columns) + date filter */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterBar
          config={{
            search: { placeholder: 'Search bookings…', ariaLabel: 'Search bookings' },
            dropdowns: [
              {
                id: 'status',
                label: 'Status',
                options: STATUS_OPTIONS,
                value: status,
              },
            ],
            tabs: {
              ariaLabel: 'Service type filter',
              options: SERVICE_TYPE_OPTIONS,
              value: serviceType,
            },
            columnVisibility: true,
          }}
          search={search}
          onSearchChange={setSearch}
          onFilterChange={(id, value) => {
            if (id === 'status') {
              setStatus(value)
            }
          }}
          onTabChange={setServiceType}
          columns={columnToggles}
          onColumnToggle={(id, visible) =>
            setColumnVisibility((current) => ({ ...current, [id]: visible }))
          }
        />

        {/* Date filter — preserved control (FilterBar has no date input). */}
        <div className="flex items-center gap-1">
          <label htmlFor="booking-date-filter" className="sr-only">
            Filter by date
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-dusty-gray">
              <CalendarDays aria-hidden="true" size={16} />
            </span>
            <input
              id="booking-date-filter"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-9 rounded-buttons border border-outline-gray bg-canvas-white pl-8 pr-3 font-ui text-sm text-cocoa-dark focus:border-cocoa-dark focus:outline-none focus:ring-2 focus:ring-cocoa-dark/20"
            />
          </div>
          {date ? (
            <button
              type="button"
              onClick={() => setDate('')}
              className="h-9 rounded-buttons px-2 font-ui text-xs text-dusty-gray transition-colors hover:bg-cloud-gray hover:text-cocoa-dark"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* Table / states */}
      {state.status === 'loading' ? (
        <Skeleton rows={8} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No bookings found"
          message="Try adjusting the filters above."
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={state.data}
            tableId="bookings"
            caption="Bookings"
            globalFilter={search}
            rowActions={rowActions}
            onRowClick={(booking) => router.push(`/bookings/${booking.id}`)}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
          />
          <p className="font-sans text-sm text-dusty-gray">
            Showing {state.data.length} booking{state.data.length === 1 ? '' : 's'}
          </p>
        </>
      )}
    </div>
  )
}
