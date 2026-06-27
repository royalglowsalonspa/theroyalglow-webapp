/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Billing Table
 * Scope        : Admin Portal — Billing
 *
 * Description  : Interactive invoice ledger rebuilt on the admin design-system
 *                primitives. Renders the list via the reusable DataTable, its
 *                controls via the FilterBar, payment statuses via StatusBadge,
 *                and loading / empty / error conditions via the shared state
 *                presenters. Fetch orchestration + timeout is delegated to the
 *                useAsyncData hook. Consumes GET /api/billing as-is.
 *
 * Responsibilities :
 * - Load the full invoice ledger by walking the paginated API (consumed as-is)
 * - Render the FilterBar (search, payment-status + invoice-type dropdowns,
 *   column visibility) emitting to shared page state
 * - Render invoices in the DataTable with INR amounts + status badges
 * - Provide the per-row "View invoice" action linking to the detail page
 * - Surface loading / empty / error states via the state presenters
 *
 * Features / Functionality :
 * - Client-side search over invoice number, customer name, and email (Req 8.2)
 * - Status + type dropdown filters over the loaded set
 * - Lifted column-visibility shared between DataTable and FilterBar (Req 7.5)
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table
 * Layer        : Presentation (Data Table Component)
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/filter-bar,
 *                @/components/ui/status-badge, @/components/ui/state/*,
 *                @/components/ui/use-async-data, @/lib/admin/format, next/navigation
 *
 * Notes        :
 * - Presentation-layer only: no API/RBAC/data-model/business-logic changes.
 * - The original page paginated server-side (pageSize cap 100); to adopt the
 *   cohesive DataTable pagination/search/filter while preserving access to the
 *   ENTIRE ledger, the fetcher walks every server page once and hands the full
 *   set to the DataTable. Every pre-redesign field (Invoice, Customer, Type,
 *   Amount, Status, Date) and the detail link action are preserved.
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { DataTable, type RowAction } from '@/components/ui/data-table'
import { type ColumnToggle, FilterBar } from '@/components/ui/filter-bar'
import { EmptyState } from '@/components/ui/state/empty-state'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateTimeIST, formatINRWithPaise } from '@/lib/admin/format'
import type { ColumnDef, VisibilityState } from '@tanstack/react-table'
import { Eye, ReceiptText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

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

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
]

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'service', label: 'Service' },
  { value: 'membership_purchase', label: 'Membership purchase' },
  { value: 'membership_session', label: 'Membership session' },
]

const TYPE_LABEL: Record<string, string> = {
  service: 'Service',
  membership_purchase: 'Membership',
  membership_session: 'Session',
}

/** Toggleable data columns surfaced to the FilterBar column-visibility control. */
const COLUMN_META: { id: string; label: string }[] = [
  { id: 'invoiceNumber', label: 'Invoice' },
  { id: 'customer', label: 'Customer' },
  { id: 'invoiceType', label: 'Type' },
  { id: 'totalAmountPaise', label: 'Amount' },
  { id: 'paymentStatus', label: 'Status' },
  { id: 'createdAt', label: 'Date' },
]

// Server page size — the maximum the API accepts (Req: consume as-is).
const FETCH_PAGE_SIZE = 100

// Walk every server page of the ledger once and return the full invoice set, so
// the DataTable can own search / filter / pagination client-side without losing
// access to invoices beyond the first server page.
async function fetchAllInvoices(): Promise<InvoiceRow[]> {
  const fetchPage = async (page: number) => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(FETCH_PAGE_SIZE),
    })
    const res = await fetch(`/api/billing?${params.toString()}`)
    const json = await res.json()
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message ?? 'Could not load invoices.')
    }
    return {
      invoices: json.data.invoices as InvoiceRow[],
      totalPages: (json.meta?.totalPages as number | undefined) ?? 1,
    }
  }

  const first = await fetchPage(1)
  if (first.totalPages <= 1) {
    return first.invoices
  }

  const restPages = Array.from({ length: first.totalPages - 1 }, (_, index) => index + 2)
  const rest = await Promise.all(restPages.map((page) => fetchPage(page)))
  return rest.reduce((all, chunk) => all.concat(chunk.invoices), first.invoices)
}

export function BillingTable() {
  const router = useRouter()
  const { state, retry } = useAsyncData(fetchAllInvoices)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const handleFilterChange = useCallback((id: string, value: string) => {
    if (id === 'status') {
      setStatus(value)
    } else if (id === 'type') {
      setType(value)
    }
  }, [])

  const invoices = state.status === 'success' ? state.data : []

  const filtered = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          (status === 'all' || invoice.paymentStatus === status) &&
          (type === 'all' || invoice.invoiceType === type),
      ),
    [invoices, status, type],
  )

  const columns = useMemo<ColumnDef<InvoiceRow, unknown>[]>(
    () => [
      {
        id: 'invoiceNumber',
        accessorKey: 'invoiceNumber',
        header: 'Invoice',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-deep-gold">{row.original.invoiceNumber}</span>
        ),
      },
      {
        id: 'customer',
        // Combine name + email so the global search matches either (preserves
        // the original server-side search across customer name and email).
        accessorFn: (invoice) => `${invoice.customerName} ${invoice.customerEmail}`,
        header: 'Customer',
        cell: ({ row }) => (
          <span className="block">
            <span className="block text-cocoa-dark">{row.original.customerName}</span>
            <span className="block text-[11px] text-dusty-gray">{row.original.customerEmail}</span>
          </span>
        ),
      },
      {
        id: 'invoiceType',
        accessorKey: 'invoiceType',
        header: 'Type',
        cell: ({ row }) => (
          <span className="text-warm-gray">
            {TYPE_LABEL[row.original.invoiceType] ?? row.original.invoiceType}
          </span>
        ),
      },
      {
        id: 'totalAmountPaise',
        accessorKey: 'totalAmountPaise',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="font-ui text-cocoa-dark">
            {formatINRWithPaise(row.original.totalAmountPaise)}
          </span>
        ),
      },
      {
        id: 'paymentStatus',
        accessorKey: 'paymentStatus',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.paymentStatus} />,
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'Date',
        cell: ({ row }) => (
          <span className="text-warm-gray">{formatDateTimeIST(row.original.createdAt)}</span>
        ),
      },
    ],
    [],
  )

  const rowActions = useCallback(
    (row: { original: InvoiceRow }): RowAction[] => [
      {
        label: 'View invoice',
        icon: Eye,
        onSelect: () => router.push(`/billing/${row.original.id}`),
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
      <div>
        <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">Billing</h1>
        <p className="mt-0.5 font-sans text-sm text-dusty-gray">
          GST-compliant invoices from completed bookings and memberships.
        </p>
      </div>

      {state.status === 'loading' ? (
        <Skeleton rows={8} variant="table" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : (
        <>
          <FilterBar
            config={{
              search: {
                placeholder: 'Invoice number, customer name, or email…',
                ariaLabel: 'Search invoices',
              },
              dropdowns: [
                { id: 'status', label: 'Filter by status', options: STATUS_OPTIONS, value: status },
                { id: 'type', label: 'Filter by type', options: TYPE_OPTIONS, value: type },
              ],
              columnVisibility: true,
            }}
            search={search}
            onSearchChange={setSearch}
            onFilterChange={handleFilterChange}
            columns={columnToggles}
            onColumnToggle={(id, visible) =>
              setColumnVisibility((current) => ({ ...current, [id]: visible }))
            }
          />

          {filtered.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No invoices found"
              message="Invoices appear here once bookings are completed or memberships are sold. Try adjusting the filters above."
            />
          ) : (
            <>
              <DataTable
                columns={columns}
                data={filtered}
                tableId="billing"
                caption="GST-compliant invoices with customer, type, amount, status, and date"
                globalFilter={search}
                rowActions={rowActions}
                onRowClick={(invoice) => router.push(`/billing/${invoice.id}`)}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={setColumnVisibility}
              />
              <p className="font-sans text-sm text-dusty-gray">
                Showing {filtered.length} invoice{filtered.length === 1 ? '' : 's'}
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
