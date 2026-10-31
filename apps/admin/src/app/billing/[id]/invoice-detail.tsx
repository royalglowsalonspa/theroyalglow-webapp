/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Invoice Detail
 * Scope        : Admin Portal — Billing
 *
 * Description  : Read-only invoice view rebuilt on the admin design-system
 *                primitives. Renders the header (number, status, customer),
 *                line items via the reusable DataTable, the GST-inclusive money
 *                breakdown, gems, and notes. Loading / error conditions use the
 *                shared state presenters and the payment status uses StatusBadge.
 *                Consumes GET /api/billing/[id] as-is.
 *
 * Responsibilities :
 * - Fetch the invoice + items via useAsyncData
 * - Render line items through the DataTable primitive
 * - Render the subtotal / discount / taxable / CGST / SGST / total split, as
 *   the invoice stored it when issued (multi-branch R6.1), with each line's
 *   SAC code and rate, the issuer and a test-invoice marker
 * - Surface gems earned/redeemed, payment method/reference, and the PDF link
 *
 * Features / Functionality :
 * - INR (paise) money formatting via formatINRWithPaise; IST date-times
 * - Loading (skeleton) / error / not-found states via the state presenters
 * - Payment status via the StatusBadge primitive
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript,
 *                @tanstack/react-table
 * Layer        : Presentation (Detail Component)
 *
 * Dependencies : @/components/ui/data-table, @/components/ui/status-badge,
 *                @/components/ui/state/*, @/components/ui/use-async-data,
 *                @/lib/admin/format, next/link
 *
 * Notes        :
 * - Presentation-layer only. All money is paise from the API. Every
 *   pre-redesign field and the Download PDF action are preserved.
 *
 * Requirements : 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7
 ************************************************************/

'use client'

import { cn } from '@rgss/ui/lib/utils'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useMemo } from 'react'
import { type AdminColumnDef, DataTable } from '@/components/ui/data-table'
import { ErrorState } from '@/components/ui/state/error-state'
import { Skeleton } from '@/components/ui/state/skeleton'
import { StatusBadge } from '@/components/ui/status-badge'
import { useAsyncData } from '@/components/ui/use-async-data'
import { formatDateTimeIST, formatINRWithPaise, PLACEHOLDER } from '@/lib/admin/format'

interface InvoiceItem {
  id: string
  serviceNameSnapshot: string
  staffNameSnapshot: string | null
  quantity: number
  unitPricePaise: number
  totalPricePaise: number
  /** The line's stored tax facts; null on invoices issued before them. */
  sacCode: string | null
  rateBps: number | null
  discountPaise: number | null
  taxPaise: number | null
}

interface Invoice {
  id: string
  invoiceNumber: string
  customerId: string
  customerName: string
  customerEmail: string
  bookingId: string | null
  subtotalPaise: number
  discountAmountPaise: number
  taxableValuePaise: number
  gstAmountPaise: number
  cgstPaise: number | null
  sgstPaise: number | null
  totalAmountPaise: number
  invoiceType: string
  paymentMethod: string
  paymentStatus: string
  paymentReference: string | null
  gemsEarned: number
  gemsRedeemed: number
  pdfUrl: string | null
  notes: string | null
  paidAt: string | null
  createdAt: string
  // Issue facts (multi-branch R6.1); null on invoices issued before them.
  taxPointAt: string | null
  taxReviewStatus: 'provisional' | 'reviewed' | null
  issuerName: string | null
  issuerLegalName: string | null
  issuerGstin: string | null
  items: InvoiceItem[]
}

/** The GST rate the lines share (500 → "5%"), or null when they differ or carry none. */
function sharedRate(items: readonly InvoiceItem[]): string | null {
  const first = items[0]?.rateBps
  if (first === null || first === undefined) {
    return null
  }
  return items.every((item) => item.rateBps === first) ? `${first / 100}%` : null
}

function halfRate(rate: string | null): string {
  return rate ? ` @ ${Number.parseFloat(rate) / 2}%` : ''
}

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const fetchInvoice = useCallback(async (): Promise<Invoice> => {
    const res = await fetch(`/api/billing/${invoiceId}`)
    const json = await res.json()
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message ?? 'Could not load the invoice.')
    }
    return json.data.invoice as Invoice
  }, [invoiceId])

  const { state, retry } = useAsyncData(fetchInvoice)

  const columns = useMemo<AdminColumnDef<InvoiceItem, unknown>[]>(
    () => [
      {
        accessorKey: 'serviceNameSnapshot',
        header: 'Item',
        cell: ({ row }) => (
          <span className="text-cocoa-dark">{row.original.serviceNameSnapshot}</span>
        ),
      },
      {
        accessorKey: 'staffNameSnapshot',
        header: 'Staff',
        cell: ({ row }) => (
          <span className="text-warm-gray">{row.original.staffNameSnapshot ?? PLACEHOLDER}</span>
        ),
      },
      {
        id: 'tax',
        header: 'SAC · GST',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.sacCode ? (
            <span className="whitespace-nowrap font-mono text-xs text-warm-gray">
              {row.original.sacCode}
              {row.original.rateBps !== null ? ` · ${row.original.rateBps / 100}%` : ''}
            </span>
          ) : (
            <span className="text-dusty-gray">{PLACEHOLDER}</span>
          ),
      },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        cell: ({ row }) => (
          <span className="block text-right tabular-nums text-warm-gray">
            {row.original.quantity}
          </span>
        ),
      },
      {
        accessorKey: 'unitPricePaise',
        header: 'Unit',
        cell: ({ row }) => (
          <span className="block text-right tabular-nums text-warm-gray">
            {formatINRWithPaise(row.original.unitPricePaise)}
          </span>
        ),
      },
      {
        accessorKey: 'totalPricePaise',
        header: 'Total',
        cell: ({ row }) => (
          <span className="block text-right font-ui tabular-nums text-cocoa-dark">
            {formatINRWithPaise(row.original.totalPricePaise)}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-5">
      <Link
        href="/billing"
        className="inline-flex items-center gap-1.5 font-ui text-sm text-warm-gray transition-colors hover:text-cocoa-dark"
      >
        <ArrowLeft aria-hidden="true" size={16} />
        Back to billing
      </Link>

      {state.status === 'loading' ? (
        <Skeleton rows={3} variant="card" />
      ) : state.status === 'error' ? (
        <ErrorState message={state.message} onRetry={retry} />
      ) : (
        <InvoiceBody invoice={state.data} columns={columns} />
      )}
    </div>
  )
}

function InvoiceBody({
  invoice,
  columns,
}: {
  invoice: Invoice
  columns: AdminColumnDef<InvoiceItem, unknown>[]
}) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-cards border border-cloud-gray bg-canvas-white p-5">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-cocoa-dark">
            {invoice.invoiceNumber}
          </h1>
          <p className="mt-1 font-sans text-sm text-warm-gray">
            {invoice.customerName} · {invoice.customerEmail}
          </p>
          {invoice.issuerName ? (
            <p className="mt-0.5 font-sans text-xs text-dusty-gray">
              Issued by {invoice.issuerLegalName ?? invoice.issuerName}
              {invoice.issuerGstin ? ` · GSTIN ${invoice.issuerGstin}` : ' · no GSTIN'}
            </p>
          ) : null}
          <p className="mt-0.5 font-sans text-xs text-dusty-gray">
            Issued {formatDateTimeIST(invoice.taxPointAt ?? invoice.createdAt)}
            {invoice.paidAt ? ` · Paid ${formatDateTimeIST(invoice.paidAt)}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={invoice.paymentStatus} />
          {invoice.taxReviewStatus === 'provisional' ? (
            <span className="rounded-pill bg-cloud-gray px-2.5 py-0.5 font-ui text-[11px] uppercase tracking-[0.5px] text-warm-gray">
              Test invoice · provisional rates
            </span>
          ) : null}
          <span className="font-ui text-[11px] uppercase tracking-[0.5px] text-dusty-gray">
            {invoice.paymentMethod}
            {invoice.paymentReference ? ` · ${invoice.paymentReference}` : ''}
          </span>
          {invoice.pdfUrl ? (
            <a
              href={invoice.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-ui text-sm text-deep-gold transition-colors hover:text-cocoa-dark"
            >
              Download PDF
              <ExternalLink aria-hidden="true" size={14} />
            </a>
          ) : null}
        </div>
      </div>

      {/* Line items */}
      <DataTable
        columns={columns}
        data={invoice.items}
        tableId="invoice-items"
        caption={`Line items for invoice ${invoice.invoiceNumber}`}
      />

      {/* Money breakdown, as stored when issued (prices include GST) */}
      <div className="ml-auto max-w-sm space-y-2 rounded-cards border border-cloud-gray bg-canvas-white p-5">
        <Row label="Subtotal" value={formatINRWithPaise(invoice.subtotalPaise)} />
        {invoice.discountAmountPaise > 0 ? (
          <Row label="Discount" value={`− ${formatINRWithPaise(invoice.discountAmountPaise)}`} />
        ) : null}
        <Row label="Taxable value" value={formatINRWithPaise(invoice.taxableValuePaise)} muted />
        {invoice.cgstPaise !== null && invoice.sgstPaise !== null ? (
          <>
            <Row
              label={`CGST${halfRate(sharedRate(invoice.items))}`}
              value={formatINRWithPaise(invoice.cgstPaise)}
              muted
            />
            <Row
              label={`SGST${halfRate(sharedRate(invoice.items))}`}
              value={formatINRWithPaise(invoice.sgstPaise)}
              muted
            />
          </>
        ) : (
          <Row label="GST" value={formatINRWithPaise(invoice.gstAmountPaise)} muted />
        )}
        <div className="mt-2 border-t border-cloud-gray pt-2">
          <Row label="Total" value={formatINRWithPaise(invoice.totalAmountPaise)} bold />
        </div>
        {invoice.gemsEarned > 0 || invoice.gemsRedeemed > 0 ? (
          <p className="pt-2 font-sans text-xs text-dusty-gray">
            {invoice.gemsEarned > 0 ? `+${invoice.gemsEarned} gems earned` : ''}
            {invoice.gemsEarned > 0 && invoice.gemsRedeemed > 0 ? ' · ' : ''}
            {invoice.gemsRedeemed > 0 ? `${invoice.gemsRedeemed} gems redeemed` : ''}
          </p>
        ) : null}
      </div>

      {invoice.notes ? (
        <p className="rounded-cards border border-cloud-gray bg-canvas-white p-4 font-sans text-sm text-warm-gray">
          <span className="mr-2 font-ui text-[11px] uppercase tracking-[0.5px] text-dusty-gray">
            Notes
          </span>
          {invoice.notes}
        </p>
      ) : null}
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string
  value: string
  bold?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={cn(
          'font-sans text-sm',
          muted ? 'text-dusty-gray' : 'text-warm-gray',
          bold && 'font-ui text-cocoa-dark',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          bold ? 'font-ui text-base text-cocoa-dark' : 'font-sans text-sm text-cocoa-dark',
        )}
      >
        {value}
      </span>
    </div>
  )
}
