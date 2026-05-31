'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { formatDateDDMMYYYY, formatINR } from '@/lib/admin/bookings'

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

const SORT_OPTIONS = [
  { value: 'ltv', label: 'LTV (high → low)' },
  { value: 'visits', label: 'Visits (high → low)' },
  { value: 'last_visit', label: 'Last Visit (recent first)' },
  { value: 'name', label: 'Name (A → Z)' },
  { value: 'gems', label: 'Gems (high → low)' },
  { value: 'noshows', label: 'No-shows (high → low)' },
] as const

const PAGE_SIZE = 20

export function CustomersTable() {
  const [rows, setRows] = useState<CustomerListRow[] | null>(null)
  const [meta, setMeta] = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<string>('ltv')
  const [tag, setTag] = useState('')
  const [page, setPage] = useState(1)

  const [tagOptions, setTagOptions] = useState<TagOption[]>([])

  // Debounce the search box → `q`, resetting to the first page on a new term.
  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(searchInput.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(handle)
  }, [searchInput])

  // Tag filter options (fetched once).
  useEffect(() => {
    let active = true
    fetch('/api/admin/tags')
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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
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
      const res = await fetch(`/api/admin/customers?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load customers.')
      }
      setRows(json.data.customers as CustomerListRow[])
      setMeta((json.meta as PaginationMeta | undefined) ?? null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load customers.')
    } finally {
      setLoading(false)
    }
  }, [q, sort, tag, page])

  useEffect(() => {
    load()
  }, [load])

  const totalCount = meta?.totalCount ?? 0
  const totalPages = meta?.totalPages ?? 1
  const currentPage = meta?.page ?? page
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalCount)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">
          Customers
        </h1>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 p-3 border border-cloud-gray rounded-[6px] bg-cloud-gray/30">
        {/* Search */}
        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <label
            htmlFor="customer-search"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Search
          </label>
          <input
            id="customer-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, phone, or email…"
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          />
        </div>

        {/* Sort */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="customer-sort"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Sort
          </label>
          <select
            id="customer-sort"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value)
              setPage(1)
            }}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tag filter */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="customer-tag"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Tag
          </label>
          <select
            id="customer-tag"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value)
              setPage(1)
            }}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            <option value="">All tags</option>
            {tagOptions.map((opt) => (
              <option key={opt.id} value={opt.slug}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table / states */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows || rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cloud-gray/60">
                    <Th>Name</Th>
                    <Th>Phone</Th>
                    <Th>Tags</Th>
                    <Th>Visits</Th>
                    <Th>LTV</Th>
                    <Th>Gems</Th>
                    <Th>Last Visit</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud-gray">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-cloud-gray/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-sans text-cocoa-dark whitespace-nowrap">
                        <Link
                          href={`/admin/customers/${row.id}`}
                          className="text-deep-gold hover:text-cocoa-dark transition-colors"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {row.phone ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.tags.length === 0 ? (
                          <span className="text-dusty-gray">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {row.tags.map((t) => (
                              <TagChip key={t.slug} tag={t} />
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {row.totalVisits}
                      </td>
                      <td className="px-4 py-3 font-ui text-cocoa-dark whitespace-nowrap">
                        {formatINR(row.totalSpentPaise)}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {row.gemsBalance ?? 0}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {row.lastVisitAt
                          ? formatDateDDMMYYYY(row.lastVisitAt)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-dusty-gray font-sans">
              Showing {rangeStart}–{rangeEnd} of {totalCount} customer
              {totalCount === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-cocoa-dark hover:bg-cloud-gray transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-deep-gold"
              >
                ← Prev
              </button>
              <span className="text-sm font-sans text-warm-gray">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-ui text-cocoa-dark hover:bg-cloud-gray transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-deep-gold"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TagChip({ tag }: { tag: CustomerTagChip }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-ui bg-golden-mist text-warm-gray"
      style={tag.color ? { backgroundColor: `${tag.color}1a`, color: tag.color } : undefined}
    >
      {tag.name}
    </span>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray">
      {children}
    </th>
  )
}

function LoadingState() {
  return (
    <div
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      role="status"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading customers…</span>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
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
      <p className="font-sans text-sm text-cocoa-dark mb-1">No customers found</p>
      <p className="font-sans text-xs text-dusty-gray">
        Try adjusting your search or filters.
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
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
