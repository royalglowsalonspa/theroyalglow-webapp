import { DurableObject } from 'cloudflare:workers'
import devanagari from '@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff2'
import kannada from '@fontsource/noto-sans-kannada/files/noto-sans-kannada-kannada-400-normal.woff2'
import telugu from '@fontsource/noto-sans-telugu/files/noto-sans-telugu-telugu-400-normal.woff2'
import { formatDateIN, formatINR, formatSplitPayment } from '@rgss/business'
import type { InvoicePdfPayload } from '@rgss/types'
import { html } from 'hono/html'
import { render } from 'takumi-pdf'
import logo from '../../web/public/icons/icon-192.png'
import { type InvoiceRecord, pdfKey } from './contracts'
import { deliverInvoice, type InvoiceDelivery } from './delivery'
import type { InvoiceEnv } from './env'
import { loadSnapshot } from './snapshot'
import { renderPdfcnInvoice } from './template/pdfcn-invoice'

const fonts = [
  { name: 'Noto Kannada', data: kannada },
  { name: 'Noto Telugu', data: telugu },
  { name: 'Noto Devanagari', data: devanagari },
]

function document(invoice: InvoicePdfPayload) {
  const totals = invoice.totals
  const title = invoice.invoiceType === 'membership_session' ? 'Membership session' : 'Invoice'
  return html`
    <style>
      * { font-family: Geist, 'Noto Kannada', 'Noto Telugu', 'Noto Devanagari'; }
      h1 { color: #553d2a; font-size: 26px; margin-bottom: 4px; }
      p { font-size: 12px; margin: 4px 0; }
      .header, .row { display: flex; align-items: center; }
      .header { gap: 12px; margin-bottom: 12px; }
      .row { justify-content: space-between; padding: 8px; border-bottom: 1px solid #ded6cf;
             font-size: 12px; break-inside: avoid; }
      .description { width: 73%; }
      .total { background: #f6eee6; font-weight: 700; }
      .details { margin: 12px 0; }
    </style>
    <div class="header"><img src="rgss-logo.png" alt="Royal Glow" width="52" height="52">
      <div><h1>${invoice.seller.name}</h1><p>${invoice.seller.legalName ?? ''}</p></div>
    </div>
    <p>${invoice.seller.addressLines.join(', ')}</p>
    ${invoice.seller.gstin ? html`<p>GSTIN ${invoice.seller.gstin}</p>` : ''}
    <div class="details">
      <p>${title} ${invoice.invoiceNumber} · ${formatDateIN(new Date(invoice.issuedAt))}</p>
      ${invoice.taxReviewStatus === 'provisional' ? html`<p>Test invoice · provisional rates</p>` : ''}
      ${invoice.bookingNumber ? html`<p>Booking ${invoice.bookingNumber}</p>` : ''}
      <p>Billed to ${invoice.customer.name}</p>
      ${invoice.paymentTenders ? html`<p>Paid via ${formatSplitPayment(invoice.paymentTenders)}</p>` : ''}
    </div>
    <div class="row total"><span>Item</span><span>Line amount</span></div>
    ${invoice.items.map(
      (item) => html`
      <div class="row"><span class="description">${item.name} × ${item.quantity}
        ${item.sacCode ? ` · SAC ${item.sacCode}` : ''}
        ${item.gemsCovered ? ' · Covered by gems' : ''}</span>
        <span>${formatINR(item.totalPricePaise)}</span></div>`,
    )}
    <div class="row"><span>Subtotal</span><span>${formatINR(totals.subtotalPaise)}</span></div>
    <div class="row"><span>Discount</span><span>${formatINR(totals.discountPaise)}</span></div>
    <div class="row"><span>Taxable value</span><span>${formatINR(totals.taxableValuePaise)}</span></div>
    <div class="row"><span>CGST</span><span>${formatINR(totals.cgstPaise)}</span></div>
    <div class="row"><span>SGST</span><span>${formatINR(totals.sgstPaise)}</span></div>
    <div class="row total"><span>Total</span><span>${formatINR(totals.totalPaise)}</span></div>
    ${invoice.notes ? html`<p>${invoice.notes}</p>` : ''}
  `
}

export class InvoicePdf extends DurableObject<InvoiceEnv> {
  #pending: Promise<void> | undefined

  async deliver(invoice: InvoiceDelivery): Promise<void> {
    await deliverInvoice(this.env, invoice, () => this.ensure(invoice))
  }

  async ensure(invoice: InvoiceRecord): Promise<void> {
    if (this.#pending) return this.#pending
    this.#pending = this.#create(invoice)
    try {
      await this.#pending
    } finally {
      this.#pending = undefined
    }
  }

  async #create(invoice: InvoiceRecord): Promise<void> {
    const key = pdfKey(invoice)
    if (await this.env.FILES.head(key)) return
    const snapshot = await loadSnapshot(this.env.FILES, invoice)
    const source = snapshot.invoice
    const isPdfcn = source.templateVersion === 'takumi-v2'
    // Hono brands escaped markup as a boxed string. Takumi parses primitive HTML strings.
    const markup = String(await (isPdfcn ? renderPdfcnInvoice(source) : document(source)))
    const bytes = await render(markup, {
      size: 'a4',
      fonts,
      images: [{ src: 'rgss-logo.png', data: new Uint8Array(logo) }],
      ...(isPdfcn
        ? {
            fontFamilies: ['Geist', ...fonts.map(({ name }) => name)],
            margin: { top: 38, right: 44, bottom: 'auto' as const, left: 44 },
            footer: String(
              await html`<div style="margin:0 44px;padding-top:8px;border-top:1px solid #dacbbd;color:#624c3f;font-size:10px;display:flex;justify-content:space-between">
              <span>${source.invoiceNumber}</span>
              <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
            </div>`,
            ),
          }
        : {}),
    })
    await this.env.FILES.put(key, bytes, {
      onlyIf: { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/pdf' },
    })
  }
}
