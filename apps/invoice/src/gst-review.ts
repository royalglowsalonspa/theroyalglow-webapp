import { formatINR, IST_TIME_ZONE, istMonthBounds, istToday } from '@rgss/business'
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

export async function renderGstReview(
  result: GstSummary | Response,
  month: string,
  branch?: string,
) {
  const summary = result instanceof Response ? null : result
  const error = result instanceof Response ? await result.text() : null
  const query = new URLSearchParams(branch ? { month, branch } : { month }).toString()
  const period = periodFormat.format(new Date(`${month}-01T00:00:00Z`))
  const firstDay = `${month}-01`
  const lastDay = istToday(new Date(istMonthBounds(month)[1].getTime() - 1)).padStart(10, '0')

  return new Response(
    String(
      await html`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/portal/styles.css"><title>Monthly GST review · Royal Glow</title></head>
      <body><main class="dashboard gst-review">
        <nav aria-label="Invoice portal"><a href="/portal/home?${query}">Dashboard and filters</a></nav>
        <h1>Monthly GST review</h1>
        <p>${period} (IST) · ${branch ?? 'All assigned branches'}</p>
        ${
          summary
            ? html`<p class="dashboard-note">Based on invoices received by the portal. Figures reflect payment and tax facts saved at issuance. Review credits, refunds, and filing adjustments separately.</p>
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
        }</p>`
            : html`<p role="status" class="dashboard-note">${error}</p>`
        }
        <nav aria-label="Invoice exports">
          <a href="/portal/reports/invoices.csv?${query}">Invoice register (CSV)</a>
          ${summary ? html`<a href="/portal/reports/line-tax.csv?${query}">Line-tax register (CSV)</a>` : ''}
          <a href="${monthlyCloseLink(month, branch)}">Monthly close drafts</a>
        </nav>
        <section aria-labelledby="line-tax-range">
          <h2 id="line-tax-range">Export tax lines by date</h2>
          <p class="dashboard-note">Choose part of the month if the full line-tax CSV exceeds 5,000 rows. Both dates are included in IST.</p>
          <form method="get" action="/portal/reports/line-tax.csv" aria-labelledby="line-tax-range">
            <input type="hidden" name="month" value="${month}">
            ${branch ? html`<input type="hidden" name="branch" value="${branch}">` : ''}
            <label>From <input type="date" name="from" min="${firstDay}" max="${lastDay}" required></label>
            <label>Through <input type="date" name="through" min="${firstDay}" max="${lastDay}" required></label>
            <button type="submit">Download line-tax CSV</button>
          </form>
        </section>
        ${
          summary
            ? html`<section aria-labelledby="gst-breakdown">
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
        }`
            : ''
        }
      </main></body></html>`,
    ),
    {
      status: result instanceof Response ? result.status : 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    },
  )
}
