/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Billing Table
 * Scope        : Admin Portal — Billing
 *
 * Description  : Interactive invoice ledger with search, status/type filters,
 *                and pagination. Each row links to the invoice detail view.
 *
 * Responsibilities :
 * - Debounced search by invoice number / customer name / email
 * - Filter by payment status and invoice type
 * - Paginated table with prev/next navigation
 *
 * Features / Functionality :
 * - Status + type badges; INR amounts; DD/MM/YYYY dates
 * - Loading / error / empty states with retry
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Data Table Component)
 *
 * Dependencies : admin bookings lib (formatINR, formatDateDDMMYYYY), next/link,
 *                React hooks
 *
 * Notes        : Read-only ledger. Search debounces at 350ms.
 ************************************************************/

'use client'

import { formatDateDDMMYYYY, formatINR } from '@/lib/admin/bookings'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

interface InvoiceRow {
  id: string
  invoiceNumber: string
  customerId: string
  customerName: string
  customerEmail: string
  totalAmountPaise: number
  invoiceType: 'service' | 'membership_purchase' | 'membership_session'
  paymentStatus: 'pending' | 'paid' | 'refunded'
  paymentMethod: 'cash' | 'upi' | 'card' | 'online'
  createdAt: string
  paidAt: string | null
}

interface PaginationMeta {
  page: number
  totalPages: number
  totalCount: number
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
] as const

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'service', label: 'Service' },
  { value: 'membership_purchase', label: 'Membership purchase' },
  { value: 'membership_session', label: 'Membership session' },
] as const

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-800',
  refunded: 'bg-red-100 text-red-700',
}

const TYPE_LABEL: Record<string, string> = {
  service: 'Service',
  membership_purchase: 'Membership',
  membership_session: 'Session',
}

const PAGE_SIZE = 20

export function BillingTable() {
  const [rows, setRows] = useState<InvoiceRow[] | null>(null)
  const [meta, setMeta] = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(searchInput.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(handle)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q) {
        params.set('q', q)
      }
      if (status) {
        params.set('status', status)
      }
      if (type) {
        params.set('type', type)
      }
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))
      const res = await fetch(`/api/billing?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load invoices.')
      }
      setRows(json.data.invoices as InvoiceRow[])
      setMeta((json.meta as PaginationMeta | undefined) ?? null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load invoices.')
    } finally {
      setLoading(false)
    }
  }, [q, status, type, page])

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
      <div>
        <h1 className="text-2xl font-display text-cocoa-dark tracking-tight">Billing</h1>
        <p className="font-sans text-sm text-dusty-gray mt-0.5">
          GST-compliant invoices from completed bookings and memberships.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 p-3 border border-cloud-gray rounded-[6px] bg-cloud-gray/30">
        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <label
            htmlFor="invoice-search"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Search
          </label>
          <input
            id="invoice-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Invoice number, customer name, or email…"
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="invoice-status"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Status
          </label>
          <select
            id="invoice-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="invoice-type"
            className="text-[10px] font-ui uppercase tracking-wider text-dusty-gray"
          >
            Type
          </label>
          <select
            id="invoice-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              setPage(1)
            }}
            className="h-9 px-3 rounded-[6px] border border-outline-gray bg-canvas-white text-sm font-sans text-cocoa-dark focus:outline-none focus:ring-2 focus:ring-deep-gold"
          >
            {TYPE_OPTIONS.map((opt) => (
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
      ) : !rows || rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cloud-gray/60">
                    <Th>Invoice</Th>
                    <Th>Customer</Th>
                    <Th>Type</Th>
                    <Th>Amount</Th>
                    <Th>Status</Th>
                    <Th>Date</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud-gray">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-cloud-gray/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link
                          href={`/billing/${row.id}`}
                          className="font-ui text-deep-gold hover:text-cocoa-dark transition-colors"
                        >
                          {row.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-sans text-cocoa-dark whitespace-nowrap">
                        {row.customerName}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {TYPE_LABEL[row.invoiceType] ?? row.invoiceType}
                      </td>
                      <td className="px-4 py-3 font-ui text-cocoa-dark whitespace-nowrap">
                        {formatINR(row.totalAmountPaise)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={row.paymentStatus} />
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray whitespace-nowrap">
                        {formatDateDDMMYYYY(row.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-dusty-gray font-sans">
              Showing {rangeStart}–{rangeEnd} of {totalCount} invoice
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-ui uppercase tracking-[0.5px] ${
        STATUS_STYLES[status] ?? 'bg-cloud-gray text-warm-gray'
      }`}
    >
      {status}
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
    <output
      className="flex items-center gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white px-5 py-16 justify-center"
      aria-live="polite"
    >
      <Spinner />
      <span className="font-sans text-sm text-dusty-gray">Loading invoices…</span>
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
      <p className="font-sans text-sm text-cocoa-dark mb-1">No invoices found</p>
      <p className="font-sans text-xs text-dusty-gray">
        Invoices appear here once bookings are completed or memberships are sold.
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
