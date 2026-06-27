/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Customers Table
 * Scope        : Admin Portal — Customer Management
 *
 * Description  : Customer directory rebuilt on the admin design-system
 *                primitives. Renders the list via the reusable DataTable, its
 *                controls (search, sort, tag filter, column visibility) via the
 *                FilterBar, and loading / empty / error conditions via the
 *                shared state presenters. Fetch orchestration + timeout is
 *                delegated to the useAsyncData hook. Consumes GET /api/customers
 *                as-is (server-side search, sort, tag filter, and paging).
 *
 * Responsibilities :
 * - Fetch customers with server params (q, sort, tag, page) — unchanged API
 * - Render the FilterBar (search, sort dropdown, tag dropdown, columns)
 * - Render customers in the DataTable with every pre-redesign field
 * - Provide the per-row "View profile" action linking to the profile page
 * - Surface loading / empty / error states via the state presenters
 * - Page across server windows when the directory exceeds one fetch
 *
 * Features / Functionality :
 * - Debounced + trimmed search (handled by the FilterBar, 300 ms)
 * - Server-driven sort (LTV, visits, last visit, name, gems, no-shows)
 * - Tag filter populated from GET /api/tags
 * - Tag chips with custom colours rendered inline (data-driven)
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table
 * Layer        : Presentation (Data Table Component)
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/filter-bar,
 *                @/components/ui/state/*, @/components/ui/use-async-data,
 *                @/components/ui/icon, @/lib/admin/bookings, next/navigation
 *
 * Notes        :
 * - Presentation-layer only: no API/RBAC/data-model/business-logic changes.
 * - Uses ONLY semantic Brand-Token utilities — no hex / raw radius literals.
 * - Every pre-redesign field (Name, Phone, Tags, Visits, LTV, Gems, Last
 *   Visit) and the profile navigation action are preserved (Req 17.6, 17.7).
 * - Column sorting is server-driven (via the sort dropdown), so the table
 *   columns are not independently re-sortable — matching prior behaviour.
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { DataTable } from '@/components/ui/data-table'
import { type ColumnToggle, FilterBar } from '@/components/ui/filter-bar'
import { Icon } from '@/components/ui/icon'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateDDMMYYYY, formatINR } from '@/lib/admin/bookings'
import type { ColumnDef, VisibilityState } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface CustomerTagChip {
  slug: string
  name: string
  color: string | null
}

interface CustomerListRow {
  id: string
  name: string
  email: string
  phone: string | null
  totalVisits: number
  totalSpentPaise: number
  noshowCount: number
  lastVisitAt: string | null
  gemsBalance: number | null
  tags: CustomerTagChip[]
}

interface PaginationMeta {
  page: number
  totalPages: number
  totalCount: number
}

interface TagOption {
  id: string
  slug: string
  name: string
}

interface CustomersResult {
  rows: CustomerListRow[]
  meta: PaginationMeta
}

const SORT_OPTIONS = [
  { value: 'ltv', label: 'LTV (high → low)' },
  { value: 'visits', label: 'Visits (high → low)' },
  { value: 'last_visit', label: 'Last Visit (recent first)' },
  { value: 'name', label: 'Name (A → Z)' },
  { value: 'gems', label: 'Gems (high → low)' },
  { value: 'noshows', label: 'No-shows (high → low)' },
]

/** Server-window size — the maximum the API permits in a single fetch. */
const PAGE_SIZE = 100

/** Toggleable data columns surfaced to the FilterBar column-visibility control. */
const COLUMN_META: { id: string; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'phone', label: 'Phone' },
  { id: 'tags', label: 'Tags' },
  { id: 'visits', label: 'Visits' },
  { id: 'ltv', label: 'LTV' },
  { id: 'gems', label: 'Gems' },
  { id: 'lastVisit', label: 'Last Visit' },
]

async function fetchCustomers(
  q: string,
  sort: string,
  tag: string,
  page: number,
): Promise<CustomersResult> {
  const params = new URLSearchParams()
  if (q) {
    params.set('q', q)
  }
  params.set('sort', sort)
  params.set('page', String(page))
  params.set('pageSize', String(PAGE_SIZE))
  if (tag) {
    params.set('tag', tag)
  }
  const res = await fetch(`/api/customers?${params.toString()}`)
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json?.error?.message ?? 'Could not load customers.')
  }
  return {
    rows: json.data.customers as CustomerListRow[],
    meta: (json.meta as PaginationMeta | undefined) ?? {
      page,
      totalPages: 1,
      totalCount: (json.data.customers as CustomerListRow[]).length,
    },
  }
}

export function CustomersTable() {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('ltv')
  const [tag, setTag] = useState('')
  const [page, setPage] = useState(1)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [tagOptions, setTagOptions] = useState<TagOption[]>([])

  const fetcher = useCallback(() => fetchCustomers(q, sort, tag, page), [q, sort, tag, page])
  const { state, retry } = useAsyncData(fetcher)

  // Re-request when a server param changes; the initial mount fetch is owned by
  // the hook, so skip the first effect run to avoid a duplicate request.
  const didMount = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-fetch only when a server param changes; retry() reads the latest params through the fetcher closure.
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    retry()
  }, [q, sort, tag, page, retry])

  // Tag filter options (fetched once). Failure leaves the directory usable.
  useEffect(() => {
    let active = true
    fetch('/api/tags')
      .then((res) => res.json())
      .then((json) => {
        if (active && json?.success) {
          setTagOptions(json.data.tags as TagOption[])
        }
      })
      .catch(() => {
        /* tag filter stays empty; directory still works */
      })
    return () => {
      active = false
    }
  }, [])

  const columns = useMemo<ColumnDef<CustomerListRow, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Name',
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/customers/${row.original.id}`}
            className="font-ui font-medium text-deep-gold transition-colors hover:text-cocoa-dark"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'phone',
        accessorKey: 'phone',
        header: 'Phone',
        enableSorting: false,
        cell: ({ row }) => <span className="text-warm-gray">{row.original.phone ?? '—'}</span>,
      },
      {
        id: 'tags',
        header: 'Tags',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.tags.length === 0 ? (
            <span className="text-dusty-gray">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.tags.map((chip) => (
                <TagChip key={chip.slug} tag={chip} />
              ))}
            </div>
          ),
      },
      {
        id: 'visits',
        accessorKey: 'totalVisits',
        header: 'Visits',
        enableSorting: false,
        cell: ({ row }) => <span className="text-warm-gray">{row.original.totalVisits}</span>,
      },
      {
        id: 'ltv',
        accessorKey: 'totalSpentPaise',
        header: 'LTV',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-ui">{formatINR(row.original.totalSpentPaise)}</span>
        ),
      },
      {
        id: 'gems',
        accessorKey: 'gemsBalance',
        header: 'Gems',
        enableSorting: false,
        cell: ({ row }) => <span className="text-warm-gray">{row.original.gemsBalance ?? 0}</span>,
      },
      {
        id: 'lastVisit',
        accessorKey: 'lastVisitAt',
        header: 'Last Visit',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-warm-gray">
            {row.original.lastVisitAt ? formatDateDDMMYYYY(row.original.lastVisitAt) : '—'}
          </span>
        ),
      },
    ],
    [],
  )

  const columnToggles: ColumnToggle[] = COLUMN_META.map((meta) => ({
    id: meta.id,
    label: meta.label,
    visible: columnVisibility[meta.id] !== false,
  }))

  const tagDropdownOptions = [
    { value: '', label: 'All tags' },
    ...tagOptions.map((opt) => ({ value: opt.slug, label: opt.name })),
  ]

  const meta = state.status === 'success' ? state.data.meta : null
  const totalCount = meta?.totalCount ?? 0
  const totalPages = meta?.totalPages ?? 1
  const currentPage = meta?.page ?? page
  const windowStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const windowEnd = Math.min(currentPage * PAGE_SIZE, totalCount)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Customers</h1>
      </div>

      {/* Controls: FilterBar (search, sort, tag, columns) */}
      <FilterBar
        config={{
          search: {
            placeholder: 'Search by name, phone, or email…',
            ariaLabel: 'Search customers',
          },
          dropdowns: [
            { id: 'sort', label: 'Sort', options: SORT_OPTIONS, value: sort },
            { id: 'tag', label: 'Tag', options: tagDropdownOptions, value: tag },
          ],
          columnVisibility: true,
        }}
        search={q}
        onSearchChange={(value) => {
          setQ(value)
          setPage(1)
        }}
        onFilterChange={(id, value) => {
          if (id === 'sort') {
            setSort(value)
          } else if (id === 'tag') {
            setTag(value)
          }
          setPage(1)
        }}
        columns={columnToggles}
        onColumnToggle={(id, visible) =>
          setColumnVisibility((current) => ({ ...current, [id]: visible }))
        }
      />

      {/* Table / states */}
      {state.status === 'loading' ? (
        <Skeleton rows={8} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : state.data.rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers found"
          message="Try adjusting your search or filters."
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={state.data.rows}
            tableId="customers"
            caption="Customers"
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
          />

          {/* Server-window footer + total. Window paging shows only when the
              directory exceeds a single fetch (Req 17.6 — preserves paging). */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-sans text-sm text-dusty-gray">
              Showing {windowStart}–{windowEnd} of {totalCount} customer
              {totalCount === 1 ? '' : 's'}
            </p>
            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="flex h-9 items-center gap-1 rounded-buttons border border-outline-gray bg-canvas-white px-3 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon icon={ChevronLeft} decorative size={16} />
                  Prev
                </button>
                <span className="font-sans text-sm text-warm-gray">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="flex h-9 items-center gap-1 rounded-buttons border border-outline-gray bg-canvas-white px-3 font-ui text-sm text-cocoa-dark transition-colors hover:bg-cloud-gray disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <Icon icon={ChevronRight} decorative size={16} />
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

function TagChip({ tag }: { tag: CustomerTagChip }) {
  return (
    <span
      className="inline-flex items-center rounded-pill bg-golden-mist px-2 py-0.5 font-ui text-[11px] text-warm-gray"
      style={tag.color ? { backgroundColor: `${tag.color}1a`, color: tag.color } : undefined}
    >
      {tag.name}
    </span>
  )
}
