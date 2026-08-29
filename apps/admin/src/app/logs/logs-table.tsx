/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : Audit Logs Table
 * Scope        : Admin Portal — Audit Logs (Developer)
 *
 * Description  : Developer-only audit-log viewer rebuilt on the admin
 *                design-system primitives. The audit_log list renders via the
 *                reusable DataTable, its controls (entity search, action
 *                filter, column visibility) via the FilterBar, action
 *                categories via StatusBadge, timestamps via formatDateTimeIST,
 *                and loading / empty / error conditions via the shared state
 *                presenters. A row opens the full audit entry in a
 *                SlideOverPanel so a developer can inspect actor email, the
 *                full entity id, and IP without leaving the list.
 *
 *                The audit volume is large, so the API is server-paged: the
 *                DataTable runs in `manualPagination` mode with its built-in
 *                pager suppressed, and a single server pager drives page
 *                navigation. Pages are never loaded client-side.
 *
 * Responsibilities :
 * - Fetch a server page of audit entries (GET /api/logs) via useAsyncData
 * - Drive the action + entity filters and page navigation against the server
 * - Render entries in the DataTable with StatusBadge + IST timestamps
 * - Open the full audit entry in a SlideOverPanel on row activation
 * - Surface loading / empty / error states via the state presenters
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table
 * Layer        : Presentation (Data Table Component)
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/filter-bar,
 *                @/components/ui/status-badge, @/components/ui/slide-over-panel,
 *                @/components/ui/state/*, @/components/ui/use-async-data,
 *                @/components/ui/icon, @/lib/admin/format, @rgss/types
 *
 * Notes        :
 * - Presentation-layer only: no API / RBAC / data-model / business-logic
 *   changes. Consumes the existing GET /api/logs contract unchanged.
 * - Uses ONLY semantic Brand-Token utilities — no hex / raw palette literals.
 * - Every pre-redesign field (Time, Actor, Action, Entity, IP) and the
 *   action/entity filters + paging are preserved; the slide-over additionally
 *   surfaces the actor email and full entity id the dense list truncates.
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { AUDIT_ACTIONS } from '@rgss/types'
import type { ColumnVisibilityState } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type AdminColumnDef, DataTable } from '@/components/ui/data-table'
import { FilterBar } from '@/components/ui/filter-bar'
import { Icon } from '@/components/ui/icon'
import { SlideOverPanel } from '@/components/ui/slide-over-panel'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateTimeIST, PLACEHOLDER } from '@/lib/admin/format'

type LogEntry = {
  id: string
  actorName: string
  actorEmail: string
  action: string
  entityType: string
  entityId: string
  ipAddress: string | null
  createdAt: string
}

type LogsPage = {
  logs: LogEntry[]
  totalPages: number
}

// Server page size — mirrors the API default. The whole page is rendered, so
// the DataTable runs in manualPagination mode (no client slicing).
const PAGE_SIZE = 30

// 'all' is a UI sentinel mapped to an absent `action` server param.
const ACTION_OPTIONS = [
  { value: 'all', label: 'All actions' },
  ...AUDIT_ACTIONS.map((a) => ({ value: a, label: a.replace(/_/g, ' ') })),
]

async function fetchLogs(args: {
  action: string
  entity: string
  page: number
}): Promise<LogsPage> {
  const params = new URLSearchParams()
  if (args.action && args.action !== 'all') {
    params.set('action', args.action)
  }
  if (args.entity.trim()) {
    params.set('entity', args.entity.trim())
  }
  params.set('page', String(args.page))
  params.set('pageSize', String(PAGE_SIZE))

  const res = await fetch(`/api/logs?${params}`)
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load logs.')
  }
  return {
    logs: json.data.logs as LogEntry[],
    totalPages: json.meta?.totalPages ?? 1,
  }
}

export function LogsTable() {
  const [action, setAction] = useState('all')
  const [entity, setEntity] = useState('')
  const [page, setPage] = useState(1)
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({})
  const [activeId, setActiveId] = useState<string | null>(null)

  const fetcher = useCallback(() => fetchLogs({ action, entity, page }), [action, entity, page])
  const { state, retry } = useAsyncData(fetcher)

  // Re-request when a filter or the page changes; the hook owns the mount fetch.
  const didMount = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: action/entity/page are the re-fetch triggers; retry() reads the latest params through the fetcher closure.
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    retry()
  }, [action, entity, page, retry])

  const columns = useMemo<AdminColumnDef<LogEntry, unknown>[]>(
    () => [
      {
        id: 'time',
        accessorKey: 'createdAt',
        header: 'Time',
        cell: ({ row }) => (
          <time dateTime={row.original.createdAt} className="text-warm-gray">
            {formatDateTimeIST(row.original.createdAt)}
          </time>
        ),
      },
      {
        id: 'actor',
        accessorKey: 'actorName',
        header: 'Actor',
        cell: ({ row }) => (
          <span className="font-ui font-medium text-cocoa-dark">{row.original.actorName}</span>
        ),
      },
      {
        id: 'action',
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => <StatusBadge status={row.original.action} />,
      },
      {
        id: 'entity',
        accessorFn: (entry) => `${entry.entityType} ${entry.entityId}`,
        header: 'Entity',
        cell: ({ row }) => (
          <span className="text-warm-gray">
            {row.original.entityType} ·{' '}
            <span className="text-cocoa-dark">{row.original.entityId.slice(0, 8)}…</span>
          </span>
        ),
      },
      {
        id: 'ip',
        accessorFn: (entry) => entry.ipAddress ?? PLACEHOLDER,
        header: 'IP',
        cell: ({ row }) => (
          <span className="text-dusty-gray">{row.original.ipAddress ?? PLACEHOLDER}</span>
        ),
      },
    ],
    [],
  )

  const totalPages = state.status === 'success' ? state.data.totalPages : 1
  const activeEntry =
    state.status === 'success' && activeId
      ? state.data.logs.find((entry) => entry.id === activeId)
      : undefined

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Audit Logs</h1>

      {/* Controls: FilterBar (entity search, action filter, columns). Filtering
          is server-driven, so selections reset to the first page. */}
      <FilterBar
        config={{
          search: { placeholder: 'Filter by entity type…', ariaLabel: 'Filter by entity type' },
          dropdowns: [{ id: 'action', label: 'Action', options: ACTION_OPTIONS, value: action }],
          columnVisibility: true,
        }}
        search={entity}
        onSearchChange={(value) => {
          setEntity(value)
          setPage(1)
        }}
        onFilterChange={(id, value) => {
          if (id === 'action') {
            setAction(value)
            setPage(1)
          }
        }}
        columns={[
          { id: 'time', label: 'Time', visible: columnVisibility.time !== false },
          { id: 'actor', label: 'Actor', visible: columnVisibility.actor !== false },
          { id: 'action', label: 'Action', visible: columnVisibility.action !== false },
          { id: 'entity', label: 'Entity', visible: columnVisibility.entity !== false },
          { id: 'ip', label: 'IP', visible: columnVisibility.ip !== false },
        ]}
        onColumnToggle={(id, visible) =>
          setColumnVisibility((current) => ({ ...current, [id]: visible }))
        }
      />

      {/* Table / states */}
      {state.status === 'loading' ? (
        <Skeleton rows={10} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : state.data.logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit entries"
          message="No audit-log entries match the current filters."
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={state.data.logs}
            tableId="logs"
            caption="Audit log entries"
            manualPagination
            pageCount={totalPages}
            hidePaginationFooter
            onRowClick={(entry) => setActiveId(entry.id)}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
          />

          {/* Server pager — the single source of page navigation (the built-in
              DataTable pager is suppressed in manualPagination mode). */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1.5 rounded-buttons border border-outline-gray bg-canvas-white px-3 py-2 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon icon={ChevronLeft} decorative size={16} />
              Prev
            </button>
            <span className="font-ui text-sm text-warm-gray" aria-live="polite">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1.5 rounded-buttons border border-outline-gray bg-canvas-white px-3 py-2 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <Icon icon={ChevronRight} decorative size={16} />
            </button>
          </div>
        </>
      )}

      {/* Full audit entry in a slide-over so the list stays in view. */}
      <SlideOverPanel
        open={activeId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveId(null)
          }
        }}
        title="Audit entry"
        description={activeEntry ? formatDateTimeIST(activeEntry.createdAt) : undefined}
      >
        {activeEntry ? (
          <dl className="space-y-4">
            <DetailRow label="Actor">
              <span className="text-cocoa-dark">{activeEntry.actorName}</span>
              <span className="block font-sans text-sm text-warm-gray">
                {activeEntry.actorEmail}
              </span>
            </DetailRow>
            <DetailRow label="Action">
              <StatusBadge status={activeEntry.action} />
            </DetailRow>
            <DetailRow label="Entity type">
              <span className="text-cocoa-dark">{activeEntry.entityType}</span>
            </DetailRow>
            <DetailRow label="Entity ID">
              <span className="break-all font-sans text-sm text-cocoa-dark">
                {activeEntry.entityId}
              </span>
            </DetailRow>
            <DetailRow label="IP address">
              <span className="text-cocoa-dark">{activeEntry.ipAddress ?? PLACEHOLDER}</span>
            </DetailRow>
            <DetailRow label="Time">
              <time dateTime={activeEntry.createdAt} className="text-cocoa-dark">
                {formatDateTimeIST(activeEntry.createdAt)}
              </time>
            </DetailRow>
          </dl>
        ) : null}
      </SlideOverPanel>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-ui text-[11px] uppercase tracking-wider text-dusty-gray">{label}</dt>
      <dd className="font-sans">{children}</dd>
    </div>
  )
}
