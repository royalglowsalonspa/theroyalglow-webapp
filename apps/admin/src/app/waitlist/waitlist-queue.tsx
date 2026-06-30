/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Waitlist Queue
 * Scope        : Admin Portal — Waitlist Management
 *
 * Description  : Waitlist queue rebuilt on the admin design-system primitives.
 *                Lists customers waiting for a preferred slot in the reusable
 *                DataTable, with a FilterBar (status tabs + column visibility +
 *                search) and state presenters for loading / empty / error. A
 *                SlideOverPanel exposes the per-entry detail plus the
 *                notify / mark-booked / cancel actions. Consumes
 *                GET /api/waitlist and PATCH /api/waitlist/[id] as-is.
 *
 * Responsibilities :
 * - Fetch and display waitlist entries filtered by status tab
 * - Render entries via the DataTable with a status badge per row
 * - Open a SlideOverPanel with entry detail + notify / mark-booked / cancel
 * - Surface loading / empty / error states via the state presenters
 *
 * Features / Functionality :
 * - Status tabs (waiting, notified, all) driving the server fetch
 * - Client-side global search over the rendered rows
 * - Inline status-transition actions calling PATCH /api/waitlist/[id]
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table
 * Layer        : Presentation (Queue Management Component)
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/filter-bar,
 *                @/components/ui/slide-over-panel, @/components/ui/status-badge,
 *                @/components/ui/state/*, @/components/ui/use-async-data,
 *                @/lib/admin/bookings, @/lib/admin/format
 *
 * Notes        :
 * - Presentation-layer only: no API/RBAC/data-model/business-logic changes.
 * - Uses ONLY semantic Brand-Token utilities — no hex / raw radius literals.
 * - Every pre-redesign field and the notify / mark-booked / cancel actions are
 *   preserved with their original effects (Req 17.6, 17.7). Entries are
 *   status-transitioned, never hard-deleted.
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { DataTable, type RowAction } from '@/components/ui/data-table'
import { type ColumnToggle, FilterBar } from '@/components/ui/filter-bar'
import { SlideOverPanel } from '@/components/ui/slide-over-panel'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateDDMMYYYY, formatTime12h } from '@/lib/admin/bookings'
import { formatDateTimeIST } from '@/lib/admin/format'
import { toast } from '@/lib/admin/toast'
import type { ColumnDef, VisibilityState } from '@tanstack/react-table'
import { Clock, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ─── API shapes (mirror GET /api/waitlist + PATCH /api/waitlist/[id]) ───

type WaitlistStatus = 'waiting' | 'notified' | 'booked' | 'expired' | 'cancelled'

interface WaitlistEntry {
  id: string
  customerId: string
  customerName: string
  customerEmail: string
  serviceId: string
  serviceName: string
  serviceType: 'salon' | 'spa'
  categoryName: string
  preferredStaffId: string | null
  preferredDate: string
  preferredTimeStart: string | null
  preferredTimeEnd: string | null
  status: WaitlistStatus
  notifiedAt: string | null
  createdAt: string
}

const TABS = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'notified', label: 'Notified' },
  { value: 'all', label: 'All' },
] as const

type TabValue = (typeof TABS)[number]['value']

const SERVICE_TYPE_LABEL: Record<string, string> = {
  salon: 'Salon',
  spa: 'SPA',
}

/** Toggleable data columns surfaced to the FilterBar column-visibility control. */
const COLUMN_META: { id: string; label: string }[] = [
  { id: 'customerName', label: 'Customer' },
  { id: 'serviceName', label: 'Service' },
  { id: 'serviceType', label: 'Type' },
  { id: 'categoryName', label: 'Category' },
  { id: 'preferredDate', label: 'Preferred' },
  { id: 'timeWindow', label: 'Window' },
  { id: 'createdAt', label: 'Added' },
  { id: 'status', label: 'Status' },
]

// "10:00" + "12:00" → "10:00 AM – 12:00 PM"; a lone bound renders alone; none → ''.
function formatTimeWindow(start: string | null, end: string | null): string {
  if (start && end) {
    return `${formatTime12h(start)} – ${formatTime12h(end)}`
  }
  if (start) {
    return `from ${formatTime12h(start)}`
  }
  if (end) {
    return `until ${formatTime12h(end)}`
  }
  return ''
}

async function fetchWaitlist(tab: TabValue): Promise<WaitlistEntry[]> {
  const qs = tab === 'all' ? '' : `?status=${tab}`
  const res = await fetch(`/api/waitlist${qs}`)
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load the waitlist.')
  }
  return json.data.entries as WaitlistEntry[]
}

export function WaitlistQueue() {
  const [tab, setTab] = useState<TabValue>('waiting')
  const [search, setSearch] = useState('')
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [selected, setSelected] = useState<WaitlistEntry | null>(null)

  const fetcher = useCallback(() => fetchWaitlist(tab), [tab])
  const { state, retry } = useAsyncData(fetcher)

  // Re-request when the tab changes; the hook owns the initial mount fetch.
  const didMount = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tab` is an intentional re-run trigger (useAsyncData holds the latest fetcher closure in a ref and does not auto-re-run on its identity change)
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    retry()
  }, [tab, retry])

  const columns = useMemo<ColumnDef<WaitlistEntry, unknown>[]>(
    () => [
      {
        id: 'customerName',
        accessorKey: 'customerName',
        header: 'Customer',
      },
      {
        id: 'serviceName',
        accessorKey: 'serviceName',
        header: 'Service',
        cell: ({ row }) => <span className="text-warm-gray">{row.original.serviceName}</span>,
      },
      {
        id: 'serviceType',
        accessorFn: (entry) => SERVICE_TYPE_LABEL[entry.serviceType] ?? entry.serviceType,
        header: 'Type',
        cell: ({ row }) => (
          <span className="text-warm-gray">
            {SERVICE_TYPE_LABEL[row.original.serviceType] ?? row.original.serviceType}
          </span>
        ),
      },
      {
        id: 'categoryName',
        accessorKey: 'categoryName',
        header: 'Category',
        cell: ({ row }) => <span className="text-warm-gray">{row.original.categoryName}</span>,
      },
      {
        id: 'preferredDate',
        accessorKey: 'preferredDate',
        header: 'Preferred',
        cell: ({ row }) => (
          <time dateTime={row.original.preferredDate} className="text-warm-gray">
            {formatDateDDMMYYYY(row.original.preferredDate)}
          </time>
        ),
      },
      {
        id: 'timeWindow',
        accessorFn: (entry) => formatTimeWindow(entry.preferredTimeStart, entry.preferredTimeEnd),
        header: 'Window',
        cell: ({ row }) => {
          const window = formatTimeWindow(
            row.original.preferredTimeStart,
            row.original.preferredTimeEnd,
          )
          return <span className="text-warm-gray">{window || '—'}</span>
        },
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'Added',
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt} className="text-warm-gray">
            {formatDateTimeIST(row.original.createdAt)}
          </time>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [],
  )

  const rowActions = useCallback(
    (row: { original: WaitlistEntry }): RowAction[] => [
      {
        label: 'Manage entry',
        icon: Settings2,
        onSelect: () => setSelected(row.original),
      },
    ],
    [],
  )

  const columnToggles: ColumnToggle[] = COLUMN_META.map((meta) => ({
    id: meta.id,
    label: meta.label,
    visible: columnVisibility[meta.id] !== false,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Waitlist</h1>
        <p className="mt-0.5 font-sans text-sm text-dusty-gray">
          Customers waiting for a preferred slot. Notify them when one opens up, then mark booked
          once they confirm.
        </p>
      </div>

      <FilterBar
        config={{
          search: { placeholder: 'Search waitlist…', ariaLabel: 'Search waitlist' },
          tabs: {
            ariaLabel: 'Waitlist status',
            options: TABS.map((entry) => ({ value: entry.value, label: entry.label })),
            value: tab,
          },
          columnVisibility: true,
        }}
        search={search}
        onSearchChange={setSearch}
        onTabChange={(value) => setTab(value as TabValue)}
        columns={columnToggles}
        onColumnToggle={(id, visible) =>
          setColumnVisibility((current) => ({ ...current, [id]: visible }))
        }
      />

      {state.status === 'loading' ? (
        <Skeleton rows={6} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={`No ${tab === 'all' ? '' : tab} waitlist entries`.replace('  ', ' ')}
          message="Customers waiting for a preferred slot will appear here."
        />
      ) : (
        <DataTable
          columns={columns}
          data={state.data}
          tableId="waitlist"
          caption="Waitlist entries"
          globalFilter={search}
          rowActions={rowActions}
          onRowClick={(entry) => setSelected(entry)}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
        />
      )}

      <WaitlistDetailPanel
        entry={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null)
          retry()
        }}
      />
    </div>
  )
}

/**
 * Slide-over detail + action panel for a single waitlist entry. Renders the
 * full entry detail and the notify / mark-booked / cancel transitions (each a
 * PATCH /api/waitlist/[id]), surfacing per-action busy + error state. Preserves
 * the original transition logic and effects (Req 17.6, 17.7).
 */
function WaitlistDetailPanel({
  entry,
  onClose,
  onChanged,
}: {
  entry: WaitlistEntry | null
  onClose: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Reset transient action state whenever a different entry is opened.
  useEffect(() => {
    setBusy(false)
    setActionError(null)
  }, [])

  const transition = async (status: WaitlistStatus) => {
    if (!entry) {
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/waitlist/${entry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not update the entry.')
      }
      toast.success(
        status === 'notified'
          ? 'Customer notified'
          : status === 'booked'
            ? 'Marked as booked'
            : 'Waitlist entry cancelled',
      )
      onChanged()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not update the entry.'
      setActionError(message)
      toast.error('Could not update entry', message)
    } finally {
      setBusy(false)
    }
  }

  const canNotify = entry?.status === 'waiting'
  const canBook = entry?.status === 'notified'
  const canCancel = entry?.status === 'waiting' || entry?.status === 'notified'
  const timeWindow = entry ? formatTimeWindow(entry.preferredTimeStart, entry.preferredTimeEnd) : ''

  return (
    <SlideOverPanel
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
      title={entry?.customerName ?? 'Waitlist entry'}
      description={entry?.serviceName}
      footer={
        entry && (canNotify || canBook || canCancel) ? (
          <div className="flex flex-wrap items-center gap-2">
            {canNotify ? (
              <button
                type="button"
                onClick={() => transition('notified')}
                disabled={busy}
                className="h-9 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
              >
                {busy ? 'Working…' : 'Notify'}
              </button>
            ) : null}
            {canBook ? (
              <button
                type="button"
                onClick={() => transition('booked')}
                disabled={busy}
                className="h-9 rounded-buttons bg-cocoa-dark px-4 font-ui text-sm text-canvas-white transition-colors hover:bg-warm-gray disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
              >
                {busy ? 'Working…' : 'Mark booked'}
              </button>
            ) : null}
            {canCancel ? (
              <button
                type="button"
                onClick={() => transition('cancelled')}
                disabled={busy}
                className="h-9 rounded-buttons border border-outline-gray bg-canvas-white px-4 font-ui text-sm text-warm-gray transition-colors hover:bg-cloud-gray disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
              >
                Cancel
              </button>
            ) : null}
          </div>
        ) : null
      }
    >
      {entry ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={entry.status} />
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <DetailField label="Customer" value={entry.customerName} />
            <DetailField label="Email" value={entry.customerEmail} />
            <DetailField label="Service" value={entry.serviceName} />
            <DetailField
              label="Type"
              value={SERVICE_TYPE_LABEL[entry.serviceType] ?? entry.serviceType}
            />
            <DetailField label="Category" value={entry.categoryName} />
            <DetailField label="Preferred date" value={formatDateDDMMYYYY(entry.preferredDate)} />
            {timeWindow ? <DetailField label="Time window" value={timeWindow} /> : null}
            <DetailField label="Added" value={formatDateTimeIST(entry.createdAt)} />
            {entry.notifiedAt ? (
              <DetailField label="Notified" value={formatDateTimeIST(entry.notifiedAt)} />
            ) : null}
          </dl>

          {actionError ? (
            <p className="font-sans text-sm text-error" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>
      ) : null}
    </SlideOverPanel>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-ui text-[10px] uppercase tracking-wider text-dusty-gray">{label}</dt>
      <dd className="font-sans text-cocoa-dark">{value}</dd>
    </div>
  )
}
