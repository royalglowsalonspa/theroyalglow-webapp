/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Invoice Detail
 * Scope        : Admin Portal — Billing
 *
 * Description  : Read-only invoice view: header (number, status, customer),
 *                line items, and the GST-inclusive money breakdown. Links to the
 *                stored PDF when one exists.
 *
 * Responsibilities :
 * - Fetch the invoice + items from GET /api/billing/[id]
 * - Render line items and the subtotal / discount / taxable / GST / total split
 * - Surface gems earned/redeemed and payment method/reference
 *
 * Features / Functionality :
 * - INR (paise) money formatting; DD/MM/YYYY dates
 * - Loading / error / not-found states
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript
 * Layer        : Presentation (Detail Component)
 *
 * Dependencies : admin bookings lib (formatINR, formatDateDDMMYYYY), next/link,
 *                React hooks
 *
 * Notes        : Read-only. All money is paise from the API.
 ************************************************************/

'use client'

import { formatDateDDMMYYYY, formatINR } from '@/lib/admin/bookings'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

interface InvoiceItem {
  id: string
  serviceNameSnapshot: string
  staffNameSnapshot: string | null
  quantity: number
  unitPricePaise: number
  totalPricePaise: number
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
  items: InvoiceItem[]
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-800',
  refunded: 'bg-red-100 text-red-700',
}

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/billing/${invoiceId}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? 'Could not load the invoice.')
      }
      setInvoice(json.data.invoice as Invoice)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load the invoice.')
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-5">
      <Link
        href="/billing"
        className="inline-flex items-center gap-1 font-ui text-sm text-warm-gray hover:text-cocoa-dark transition-colors"
      >
        ← Back to billing
      </Link>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !invoice ? (
        <ErrorState message="Invoice not found." onRetry={load} />
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 border border-cloud-gray rounded-[6px] bg-canvas-white p-5">
            <div>
              <h1 className="font-display text-2xl text-cocoa-dark tracking-tight">
                {invoice.invoiceNumber}
              </h1>
              <p className="font-sans text-sm text-warm-gray mt-1">
                {invoice.customerName} · {invoice.customerEmail}
              </p>
              <p className="font-sans text-xs text-dusty-gray mt-0.5">
                Issued {formatDateDDMMYYYY(invoice.createdAt)}
                {invoice.paidAt ? ` · Paid ${formatDateDDMMYYYY(invoice.paidAt)}` : ''}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-ui uppercase tracking-[0.5px] ${
                  STATUS_STYLES[invoice.paymentStatus] ?? 'bg-cloud-gray text-warm-gray'
                }`}
              >
                {invoice.paymentStatus}
              </span>
              <span className="font-ui text-[11px] uppercase tracking-[0.5px] text-dusty-gray">
                {invoice.paymentMethod}
                {invoice.paymentReference ? ` · ${invoice.paymentReference}` : ''}
              </span>
              {invoice.pdfUrl && (
                <a
                  href={invoice.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-ui text-sm text-deep-gold hover:text-cocoa-dark transition-colors"
                >
                  Download PDF ↗
                </a>
              )}
            </div>
          </div>

          {/* Line items */}
          <div className="border border-cloud-gray rounded-[6px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cloud-gray/60">
                    <Th>Item</Th>
                    <Th>Staff</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Unit</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud-gray">
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-sans text-cocoa-dark">
                        {item.serviceNameSnapshot}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray">
                        {item.staffNameSnapshot ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray text-right">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 font-sans text-warm-gray text-right">
                        {formatINR(item.unitPricePaise)}
                      </td>
                      <td className="px-4 py-3 font-ui text-cocoa-dark text-right">
                        {formatINR(item.totalPricePaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Money breakdown (GST 18% inclusive) */}
          <div className="border border-cloud-gray rounded-[6px] bg-canvas-white p-5 ml-auto max-w-sm space-y-2">
            <Row label="Subtotal" value={formatINR(invoice.subtotalPaise)} />
            {invoice.discountAmountPaise > 0 && (
              <Row label="Discount" value={`− ${formatINR(invoice.discountAmountPaise)}`} />
            )}
            <Row label="Taxable value" value={formatINR(invoice.taxableValuePaise)} muted />
            <Row label="GST (18%)" value={formatINR(invoice.gstAmountPaise)} muted />
            <div className="border-t border-cloud-gray pt-2 mt-2">
              <Row label="Total" value={formatINR(invoice.totalAmountPaise)} bold />
            </div>
            {(invoice.gemsEarned > 0 || invoice.gemsRedeemed > 0) && (
              <p className="font-sans text-xs text-dusty-gray pt-2">
                {invoice.gemsEarned > 0 ? `+${invoice.gemsEarned} gems earned` : ''}
                {invoice.gemsEarned > 0 && invoice.gemsRedeemed > 0 ? ' · ' : ''}
                {invoice.gemsRedeemed > 0 ? `${invoice.gemsRedeemed} gems redeemed` : ''}
              </p>
            )}
          </div>

          {invoice.notes && (
            <p className="font-sans text-sm text-warm-gray border border-cloud-gray rounded-[6px] bg-canvas-white p-4">
              <span className="font-ui text-[11px] uppercase tracking-[0.5px] text-dusty-gray mr-2">
                Notes
              </span>
              {invoice.notes}
            </p>
          )}
        </div>
      )}
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
        className={`font-sans text-sm ${muted ? 'text-dusty-gray' : 'text-warm-gray'} ${
          bold ? 'font-ui text-cocoa-dark' : ''
        }`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${
          bold ? 'font-ui text-base text-cocoa-dark' : 'font-sans text-sm text-cocoa-dark'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 font-ui text-xs uppercase tracking-wider text-dusty-gray ${className || 'text-left'}`}
    >
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
      <span className="font-sans text-sm text-dusty-gray">Loading invoice…</span>
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
