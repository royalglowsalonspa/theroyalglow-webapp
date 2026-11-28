import { formatINR, IST_TIME_ZONE } from '@rgss/business'
import { html } from 'hono/html'
import type { GstSummary } from './gst-summary'
import { monthlyCloseLink } from './monthly-close-page'

const periodFormat = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: IST_TIME_ZONE,
})
const receiptTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})

export async function renderGstReview(summary: GstSummary, month: string, branch?: string) {
  const query = new URLSearchParams(branch ? { month, branch } : { month }).toString()
  const period = periodFormat.format(new Date(`${month}-01T00:00:00Z`))

  return new Response(
    String(
      await html`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/portal/styles.css"><title>Monthly GST review · Royal Glow</title></head>
      <body><main class="dashboard gst-review">
        <nav aria-label="Invoice portal"><a href="/portal/home?${query}">Dashboard and filters</a></nav>
        <h1>Monthly GST review</h1>
        <p>${period} (IST) · ${branch ?? 'All assigned branches'}</p>
        <p class="dashboard-note">Based on invoices received by the portal. Figures reflect payment and tax facts saved at issuance. Review credits, refunds, and filing adjustments separately.</p>
        <dl class="dashboard-totals">
          <div><dt>Reviewed GST</dt><dd>${formatINR(summary.reviewed.gstPaise)}</dd>
            <small>${summary.reviewed.invoiceCount} ${summary.reviewed.invoiceCount === 1 ? 'invoice' : 'invoices'} · ${formatINR(summary.reviewed.taxablePaise)} taxable</small></div>
          <div><dt>Provisional GST</dt><dd>${formatINR(summary.provisional.gstPaise)}</dd>
            <small>${summary.provisional.invoiceCount} ${summary.provisional.invoiceCount === 1 ? 'invoice' : 'invoices'} · ${formatINR(summary.provisional.taxablePaise)} taxable</small></div>
          <div><dt>Invoices needing review</dt><dd>${summary.exceptionCount}</dd></div>
          <div><dt>Membership usage records</dt><dd>${summary.usageCount}</dd></div>
        </dl>
        <p class="dashboard-note">${summary.invoiceCount.toLocaleString('en-IN')} invoices in scope. Membership usage and invoices needing review are excluded from GST totals.${
          summary.latestReceivedAt === null
            ? ''
            : ` Latest facts received ${receiptTime.format(summary.latestReceivedAt)} IST.`
        }</p>
        <nav aria-label="Invoice exports">
          <a href="/portal/reports/invoices.csv?${query}">Invoice register (CSV)</a>
          <a href="/portal/reports/line-tax.csv?${query}">Line-tax register (CSV)</a>
          <a href="${monthlyCloseLink(month, branch)}">Monthly close drafts</a>
        </nav>
        <section aria-labelledby="gst-breakdown">
          <h2 id="gst-breakdown">GST by branch, SAC and rate</h2>
          ${summary.groupCount > summary.groups.length ? html`<p>Showing ${summary.groups.length} of ${summary.groupCount} groups. Download the line-tax register for all included records.</p>` : ''}
          ${
            summary.groups.length
              ? html`
            <div class="gst-review-table" role="region" aria-label="GST breakdown table" tabindex="0">
            <table aria-labelledby="gst-breakdown">
              <thead><tr><th scope="col">Branch and GSTIN</th><th scope="col">SAC and rate</th><th scope="col">Taxable</th><th scope="col">GST</th></tr></thead>
              <tbody>${summary.groups.map(
                (group) => html`
                <tr><th scope="row">${group.branchId}<small>${group.gstin ?? 'GSTIN missing'} · ${group.reviewStatus}</small></th>
                <td>${group.sacCode}<small>${group.rateBps / 100}% · ${group.lineCount} ${group.lineCount === 1 ? 'line' : 'lines'}</small></td>
                <td>${formatINR(group.taxablePaise)}</td>
                <td>${formatINR(group.gstPaise)}<small>CGST ${formatINR(group.cgstPaise)}<br>SGST ${formatINR(group.sgstPaise)}</small></td></tr>
              `,
              )}</tbody>
            </table></div>`
              : html`<p>No invoices with complete GST facts in this selection.</p>`
          }
        </section>
        ${
          summary.exceptions.length
            ? html`<section aria-labelledby="gst-exceptions">
          <h2 id="gst-exceptions">Invoices needing review</h2>
          ${summary.exceptionCount > summary.exceptions.length ? html`<p>Showing the latest ${summary.exceptions.length} of ${summary.exceptionCount}. Use the registers to review the full selection.</p>` : ''}
          <ul>${summary.exceptions.map(
            (invoice) => html`
            <li><a href="/portal/search?booking=${encodeURIComponent(invoice.invoiceId)}">${invoice.number}</a>
            <small>${invoice.branchId} · ${invoice.reason}</small></li>`,
          )}
          </ul></section>`
            : ''
        }
      </main></body></html>`,
    ),
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}
