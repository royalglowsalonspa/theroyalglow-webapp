/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/email
 * Scope        : Business Logic — Invoicing
 *
 * Description  : Pure builder for the booking-confirmation / invoice email
 *                (subject + inline-styled HTML). No I/O, no framework deps — the
 *                caller passes pre-computed paise values and the customer's
 *                details, and gets back a ready-to-send { subject, html }.
 *
 * Responsibilities :
 * - Render a branded, table-based invoice summary safe for email clients
 * - Format money via formatINR (paise → ₹) and the issue date via formatDateIN
 * - Print the stored taxable value, CGST/SGST and the lines' shared rate, and
 *   the issuer as issued (multi-branch R6.1); never a built-in rate
 * - Say a provisional-rate invoice is a test invoice (TX-10)
 * - Escape all interpolated text to prevent HTML injection
 *
 * Features / Functionality :
 * - buildInvoiceEmailHtml(data) → { subject, html }
 * - sharedRatePercentLabel(rates) → "5%" when every line used one rate
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic (pure)
 *
 * Dependencies : ../utils/currency, ../utils/date
 *
 * Notes        : Inline styles only (email clients ignore <style>/external CSS).
 *                All money is paise (integer). GST is price-inclusive.
 ************************************************************/

import { formatINR } from '../utils/currency'
import { formatDateIN } from '../utils/date'

export interface InvoiceEmailItem {
  name: string
  staff?: string | null
  pricePaise: number
}

export interface InvoiceEmailData {
  customerName: string
  invoiceNumber: string
  bookingNumber?: string | null
  items: InvoiceEmailItem[]
  subtotalPaise: number
  discountPaise: number
  /** The stored taxable value; older invoices without one derive it. */
  taxableValuePaise?: number | null
  gstPaise: number
  /** The stored halves of the tax, printed when present (multi-branch R6.1). */
  cgstPaise?: number | null
  sgstPaise?: number | null
  /** The rate the lines used, when they all used one ("5%"). */
  ratePercentLabel?: string | null
  totalPaise: number
  gemsEarned: number
  paymentMethod: string
  issuedAt: Date
  /** The branch as issued; older invoices name no issuer here. */
  issuerName?: string | null
  issuerGstin?: string | null
  /** Provisional rates: says it is a test invoice (TX-10). */
  provisional?: boolean
}

// Escape the five HTML-significant characters so customer/service names can
// never break the markup or inject content.
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const COCOA = '#1a0f0a'
const GOLD = '#bfa05a'
const MUTED = '#9a9388'
const LINE = '#ece7df'

function itemRow(item: InvoiceEmailItem): string {
  const staff = item.staff ? `<span style="color:${MUTED}"> · ${esc(item.staff)}</span>` : ''
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid ${LINE};color:${COCOA};font-size:14px">${esc(item.name)}${staff}</td>
    <td style="padding:8px 0;border-bottom:1px solid ${LINE};color:${COCOA};font-size:14px;text-align:right;white-space:nowrap">${formatINR(item.pricePaise)}</td>
  </tr>`
}

// "5%" → "2.5%": each of CGST and SGST is half the intra-state rate.
function halfRate(label: string): string {
  const percent = Number.parseFloat(label)
  return Number.isFinite(percent) ? `${percent / 2}%` : label
}

/** The rate label of a set of lines when they share one: 500 bps → "5%". */
export function sharedRatePercentLabel(rates: readonly (number | null)[]): string | null {
  const known = rates.filter((rate): rate is number => rate !== null)
  if (known.length === 0 || known.length !== rates.length) {
    return null
  }
  const first = known[0] as number
  return known.every((rate) => rate === first) ? `${first / 100}%` : null
}

function totalRow(
  label: string,
  value: string,
  opts: { bold?: boolean; muted?: boolean } = {},
): string {
  const color = opts.bold ? COCOA : opts.muted ? MUTED : '#5b5249'
  const weight = opts.bold ? '700' : '400'
  const size = opts.bold ? '16px' : '13px'
  return `<tr>
    <td style="padding:4px 0;color:${color};font-size:${size};font-weight:${weight}">${esc(label)}</td>
    <td style="padding:4px 0;color:${color};font-size:${size};font-weight:${weight};text-align:right;white-space:nowrap">${value}</td>
  </tr>`
}

/**
 * Build the confirmation/invoice email. Returns the subject and a complete,
 * inline-styled HTML document suitable for Resend.
 */
export function buildInvoiceEmailHtml(data: InvoiceEmailData): { subject: string; html: string } {
  const subject = `Your Royal Glow invoice ${data.invoiceNumber}`

  const itemsHtml = data.items.map(itemRow).join('')
  const discountHtml =
    data.discountPaise > 0 ? totalRow('Discount', `− ${formatINR(data.discountPaise)}`) : ''
  const gemsHtml =
    data.gemsEarned > 0
      ? `<p style="margin:16px 0 0;color:${GOLD};font-size:13px">◆ You earned ${data.gemsEarned} gems on this visit.</p>`
      : ''
  const bookingRef = data.bookingNumber
    ? `<p style="margin:2px 0;color:${MUTED};font-size:12px">Booking ${esc(data.bookingNumber)}</p>`
    : ''
  // Stored CGST/SGST when the invoice has them; one GST line otherwise. The
  // rate is the one stored on the lines, never a constant (multi-branch R6.4).
  // totalRow escapes its label, so the rate goes in as plain text.
  const rate = data.ratePercentLabel ? ` @ ${data.ratePercentLabel}` : ''
  const taxHtml =
    data.cgstPaise != null && data.sgstPaise != null
      ? `${totalRow(`CGST${data.ratePercentLabel ? ` @ ${halfRate(data.ratePercentLabel)}` : ''}`, formatINR(data.cgstPaise), { muted: true })}
        ${totalRow(`SGST${data.ratePercentLabel ? ` @ ${halfRate(data.ratePercentLabel)}` : ''}`, formatINR(data.sgstPaise), { muted: true })}`
      : totalRow(`GST${rate}, inclusive`, formatINR(data.gstPaise), { muted: true })
  const issuer = data.issuerName
    ? `${esc(data.issuerName)}${data.issuerGstin ? ` · GSTIN ${esc(data.issuerGstin)}` : ''}`
    : 'Royal Glow Salon &amp; Spa'
  const footerText = data.provisional
    ? 'This is a test invoice: its tax rates are provisional and have not been reviewed.'
    : `Issued by ${issuer}. Prices include GST.`

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#faf7f2;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:28px">
      <h1 style="margin:0 0 4px;color:${COCOA};font-size:22px">Royal Glow Salon &amp; Spa</h1>
      <p style="margin:0;color:${MUTED};font-size:13px">Thank you for visiting us, ${esc(data.customerName)}.</p>

      <div style="margin:20px 0;padding:12px 16px;background:#faf7f2;border-radius:8px">
        <p style="margin:2px 0;color:${COCOA};font-size:14px;font-weight:700">Invoice ${esc(data.invoiceNumber)}</p>
        ${bookingRef}
        <p style="margin:2px 0;color:${MUTED};font-size:12px">Issued ${esc(formatDateIN(data.issuedAt))} · Paid by ${esc(data.paymentMethod)}</p>
      </div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <thead><tr>
          <th style="text-align:left;padding:0 0 6px;color:${MUTED};font-size:11px;text-transform:uppercase;letter-spacing:.5px">Service</th>
          <th style="text-align:right;padding:0 0 6px;color:${MUTED};font-size:11px;text-transform:uppercase;letter-spacing:.5px">Amount</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px">
        ${totalRow('Subtotal', formatINR(data.subtotalPaise))}
        ${discountHtml}
        ${totalRow('Taxable value', formatINR(data.taxableValuePaise ?? data.totalPaise - data.gstPaise), { muted: true })}
        ${taxHtml}
        ${totalRow('Total', formatINR(data.totalPaise), { bold: true })}
      </table>

      ${gemsHtml}

      <p style="margin:24px 0 0;color:${MUTED};font-size:12px;line-height:1.5">
        ${footerText} For any query, reply to this email or call your branch.
      </p>
    </div>
    <p style="text-align:center;color:${MUTED};font-size:11px;margin:16px 0 0">Royal Glow Salon &amp; Spa · Bengaluru</p>
  </div>
</body></html>`

  return { subject, html }
}
