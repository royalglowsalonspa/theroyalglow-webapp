// Adapted from pdfcn's Takumi Invoice Classic, Table and Divider. See PDFCN-LICENSE.md.
import { formatDateIN, formatINR, formatSplitPayment } from '@rgss/business'
import type { invoiceIssueSnapshotSchema } from '@rgss/types'
import { html } from 'hono/html'
import type { z } from 'zod'

type IssuedInvoice = z.output<typeof invoiceIssueSnapshotSchema>['invoice']

const paymentLabels = { cash: 'Cash', upi: 'UPI', card: 'Card', online: 'Online' }

export function renderPdfcnInvoice(invoice: IssuedInvoice) {
  const { seller, customer, items, totals } = invoice
  const isSession = invoice.invoiceType === 'membership_session'
  const title = isSession
    ? 'Membership session'
    : invoice.taxReviewStatus === 'reviewed' && seller.gstin
      ? 'Tax invoice'
      : 'Invoice'
  const summary = [
    ['Subtotal', totals.subtotalPaise],
    ['Discount', -totals.discountPaise],
    ['Taxable value', totals.taxableValuePaise],
    ['CGST', totals.cgstPaise],
    ['SGST', totals.sgstPaise],
    ['GST included', totals.gstPaise],
  ] as const
  const rows = items.map((item, index) => {
    const taxFacts = [
      item.sacCode && `SAC ${item.sacCode}`,
      item.rateBps != null && `GST ${item.rateBps / 100}%`,
      item.taxableValuePaise != null && `Taxable ${formatINR(item.taxableValuePaise)}`,
      item.taxPaise != null && `GST ${formatINR(item.taxPaise)}`,
    ].filter(Boolean)
    return html`
      <div class="table-row ${index % 2 === 1 ? 'striped' : ''}">
        <div class="service wrap">
          <p class="item-name">${item.name}</p>
          ${item.gemsCovered ? html`<p class="subtle">Covered by gems</p>` : ''}
          ${taxFacts.length ? html`<p class="subtle item-tax">${taxFacts.join(' · ')}</p>` : ''}
        </div>
        <p class="qty">${item.quantity}</p>
        <p class="amount">${formatINR(item.unitPricePaise)}</p>
        <p class="amount">${formatINR(item.totalPricePaise)}</p>
      </div>`
  })

  return html`
    <style>
      body { color: #2e241d; font-size: 14px; line-height: 1.35; }
      h1, p { margin: 0; }
      h1 { font-size: 32px; line-height: 1.15; }
      .masthead, .parties, .table-row, .summary-row { display: flex; }
      .masthead { justify-content: space-between; align-items: center; gap: 24px;
        background: #f7efe5; padding: 20px; break-inside: avoid; }
      .brand { display: flex; align-items: center; gap: 12px; width: 48%; }
      .brand img { flex-shrink: 0; }
      .brand p { font-size: 17px; font-weight: 700; }
      .invoice-meta { width: 48%; text-align: right; }
      .label { color: #674a39; font-size: 11px; font-weight: 700; letter-spacing: 0.7px; }
      .subtle { color: #624c3f; font-size: 12px; }
      .invoice-number { font-size: 16px; font-weight: 700; margin-top: 5px; }
      .notice { padding: 10px 14px; margin-top: 14px; background: #fff4db; color: #55330d;
        border-left: 3px solid #a16417; break-inside: avoid; }
      .parties { gap: 22px; margin: 18px 0; break-inside: avoid; }
      .party { width: 48%; min-width: 0; }
      .party .label { margin-bottom: 5px; }
      .party-name { font-weight: 700; }
      .payment { padding-top: 9px; border-top: 1px solid #dacbbd; margin-bottom: 16px; }
      .wrap { overflow-wrap: anywhere; }
      .table-row { align-items: flex-start; padding: 7px 10px; border-bottom: 1px solid #e7ded5;
        break-inside: avoid; }
      .table-heading { color: #fff; background: #503528; font-size: 12px; font-weight: 700;
        break-after: avoid; }
      .striped { background: #faf6f1; }
      .service { width: 52%; padding-right: 10px; }
      .qty { width: 10%; text-align: right; }
      .amount { width: 19%; text-align: right; }
      .item-name { font-weight: 700; }
      .item-tax { margin-top: 3px; }
      .closing { break-inside: avoid; }
      .summary { margin-top: 18px; margin-left: 53%; }
      .summary-row { justify-content: space-between; padding: 4px 10px; gap: 12px; }
      .total { background: #503528; color: #fff; font-size: 17px; font-weight: 700;
        margin-top: 4px; padding: 10px; }
      .notes { margin-top: 14px; padding-top: 9px; border-top: 1px solid #dacbbd;
        break-inside: avoid; }
    </style>
    <div class="masthead">
      <div class="brand">
        <img src="rgss-logo.png" alt="Royal Glow" width="53" height="53">
        <p class="wrap">${seller.name}</p>
      </div>
      <div class="invoice-meta">
        <h1>${title}</h1>
        <p class="invoice-number wrap">${invoice.invoiceNumber}</p>
        <p class="subtle">Issued ${formatDateIN(new Date(invoice.issuedAt))}</p>
      </div>
    </div>
    ${invoice.taxReviewStatus === 'provisional' ? html`<p class="notice">Test invoice · provisional tax rates</p>` : ''}
    <div class="parties">
      <div class="party wrap">
        <p class="label">ISSUED BY</p>
        <p class="party-name">${seller.legalName ?? seller.name}</p>
        ${seller.addressLines.map((line) => html`<p>${line}</p>`)}
        ${seller.gstin ? html`<p>GSTIN ${seller.gstin}</p>` : ''}
        ${seller.email ? html`<p>${seller.email}</p>` : ''}
        ${seller.phone ? html`<p>${seller.phone}</p>` : ''}
      </div>
      <div class="party wrap">
        <p class="label">BILLED TO</p>
        <p class="party-name">${customer.name}</p>
        ${customer.email ? html`<p>${customer.email}</p>` : ''}
        ${customer.phone ? html`<p>${customer.phone}</p>` : ''}
      </div>
    </div>
    <p class="payment wrap">${
      isSession
        ? 'Membership usage record'
        : invoice.paymentTenders
          ? `Paid via ${formatSplitPayment(invoice.paymentTenders)}`
          : `${invoice.paymentStatus === 'paid' ? 'Paid via' : 'Payment method'} ${paymentLabels[invoice.paymentMethod]}`
    }${invoice.bookingNumber ? ` · Booking ${invoice.bookingNumber}` : ''}</p>
    <div class="table-row table-heading"><span class="service">Description</span><span class="qty">Qty</span>
      <span class="amount">Unit price</span><span class="amount">Amount</span></div>
    ${rows.slice(0, -1)}
    <div class="closing">
      ${rows.at(-1) ?? ''}
      <div class="summary">
        ${summary.map(([label, amount]) => html`<div class="summary-row"><span>${label}</span><span>${formatINR(amount || 0)}</span></div>`)}
        <div class="summary-row total"><span>Total</span><span>${formatINR(totals.totalPaise)}</span></div>
      </div>
      ${invoice.offer ? html`<p class="notes wrap">Offer applied: ${invoice.offer.name}</p>` : ''}
      ${invoice.notes ? html`<p class="notes wrap">${invoice.notes}</p>` : ''}
    </div>
  `
}
