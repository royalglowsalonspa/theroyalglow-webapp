import {
  formatINR,
  formatInvoiceNumber,
  INVOICE_SEQUENCE_DIGITS,
  IST_TIME_ZONE,
} from '@rgss/business'
import type { InvoiceSourceCoverage } from '@rgss/types'
import { html } from 'hono/html'
import type { InvoiceNumberingReview } from './invoice-numbering-review'
import type { CloseChange } from './monthly-close-diff'
import type { MonthlyCloseDraft } from './monthly-close-store'

const perPage = 50
const clock = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})
const labels = { added: 'Added', changed: 'Changed', missing: 'Missing' } as const

export type DraftSourceCheck = {
  observed: InvoiceSourceCoverage
  saved: { invoiceCount: number; totalPaise: number } | null
  sameIdentities: boolean
}

function sourceCoverage(check: DraftSourceCheck | null) {
  if (!check) {
    return html`<p class="dashboard-note">No billing check has been published for this branch and month.</p>`
  }
  const { observed, saved, sameIdentities } = check
  const status = !saved
    ? 'The saved register could not be checked.'
    : !sameIdentities
      ? 'Invoice IDs or amounts differ.'
      : observed.invoiceCount === 0
        ? 'Both registers were empty at the time of the check.'
        : observed.publishedCount !== observed.invoiceCount
          ? 'Invoice IDs and amounts agree. Publication is incomplete.'
          : 'Invoice IDs and amounts agree.'
  return html`<p><strong>${status}</strong></p>
    <p class="dashboard-note">Neon source read ${clock.format(new Date(observed.observedAt))} IST for this branch and issue month.</p>
    ${
      saved
        ? html`<table aria-label="Billing coverage totals">
      <thead><tr><th scope="col">Register</th><th scope="col">Invoices</th><th scope="col">Total</th></tr></thead>
      <tbody>
        <tr><th scope="row">Saved draft</th><td>${saved.invoiceCount}</td><td>${formatINR(saved.totalPaise)}</td></tr>
        <tr><th scope="row">Billing source</th><td>${observed.invoiceCount}</td><td>${formatINR(observed.totalPaise)}</td></tr>
      </tbody>
    </table>`
        : ''
    }
    ${observed.invoiceCount !== observed.publishedCount ? html`<p class="dashboard-note">The check found ${observed.pendingCount} pending, ${observed.failedCount} failed, and ${observed.uncapturedCount} uncaptured.</p>` : ''}`
}

function invoiceNumbering(review: InvoiceNumberingReview | null, path: string) {
  if (!review) return html`<p class="dashboard-note">The saved register could not be checked.</p>`
  const {
    financialYear,
    prefixes,
    mixedPrefixes,
    recognizedCount,
    legacyCount,
    unrecognizedCount,
    financialYearMismatchCount,
    duplicates,
    gaps,
  } = review
  const prefix = prefixes[0]
  const absentCount = gaps.reduce((total, range) => total + range.count, 0)
  const status = mixedPrefixes
    ? 'Review the different prefixes in this draft.'
    : recognizedCount < 2
      ? 'At least two sequential invoice numbers are needed to check for gaps.'
      : gaps.length
        ? `${absentCount.toLocaleString('en-IN')} ${absentCount === 1 ? 'number is' : 'numbers are'} absent between observed invoices.`
        : 'No internal gaps in the reviewed numbers.'
  const preview = 50
  return html`<p><strong>${status}</strong></p>
    <p class="dashboard-note">${recognizedCount.toLocaleString('en-IN')} ${recognizedCount === 1 ? 'invoice' : 'invoices'} with sequential numbers in FY ${financialYear}${prefixes.length ? ` · ${prefixes.join(', ')}` : ''}. The check covers gaps between the first and last number in the saved draft.</p>
    ${mixedPrefixes ? html`<p class="dashboard-note">The draft contains more than one prefix for this branch and financial year. Compare those invoices with the billing register before reviewing gaps.</p>` : ''}
    ${
      prefix && gaps.length
        ? html`<table aria-label="Absent invoice number ranges">
          <thead><tr><th scope="col">Absent number or range</th><th scope="col">Count</th></tr></thead>
          <tbody>${gaps.slice(0, preview).map(
            (range) => html`<tr>
            <th scope="row">${formatInvoiceNumber(prefix, financialYear, range.first)}${range.last !== range.first ? html`<small>through ${formatInvoiceNumber(prefix, financialYear, range.last)}</small>` : ''}</th>
            <td>${range.count.toLocaleString('en-IN')}</td>
          </tr>`,
          )}</tbody>
        </table>
        ${gaps.length > preview ? html`<p class="dashboard-note">Showing ${preview} of ${gaps.length} ranges.</p>` : ''}`
        : ''
    }
    ${
      duplicates.length
        ? html`<p class="dashboard-note">Repeated sequences in this draft ${duplicates
            .slice(0, preview)
            .map(({ sequence }) => String(sequence).padStart(INVOICE_SEQUENCE_DIGITS, '0'))
            .join(
              ', ',
            )}${duplicates.length > preview ? ` and ${duplicates.length - preview} more` : ''}.</p>`
        : ''
    }
    ${
      legacyCount || unrecognizedCount || financialYearMismatchCount
        ? html`<p class="dashboard-note">Outside the gap check · ${legacyCount} legacy · ${unrecognizedCount} unrecognized format · ${financialYearMismatchCount} financial-year mismatch.</p>`
        : ''
    }
    <a href="${path}/invoice-register.csv">Download the saved invoice register</a>`
}

export async function renderMonthlyCloseComparison(
  draft: MonthlyCloseDraft,
  comparedAt: number,
  changes: CloseChange[],
  page: number,
  billingCheck: DraftSourceCheck | null,
  numbering: InvoiceNumberingReview | null,
) {
  const counts = { added: 0, changed: 0, missing: 0 }
  for (const change of changes) counts[change.kind]++
  const pages = Math.max(1, Math.ceil(changes.length / perPage))
  const selected = Math.min(page, pages)
  const start = (selected - 1) * perPage
  const filters = new URLSearchParams({ branch: draft.branchId, month: draft.month })
  const path = `/portal/reports/close/${draft.branchId}/${draft.id}`

  return new Response(
    String(
      await html`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/portal/styles.css"><title>Compare monthly close draft · Royal Glow</title></head>
      <body><main class="dashboard close-comparison">
        <nav aria-label="Invoice portal">
          <a href="/portal/reports/close?${filters}">Monthly close drafts</a>
          <a href="/portal/reports/gst?${filters}">Current GST review</a>
          <a href="${path}/review">CA feedback</a>
        </nav>
        <h1>Compare monthly close draft</h1>
        <p class="close-scope">${draft.branchId} · ${draft.month} (IST) · Version ${draft.version}</p>
        <p class="dashboard-note">Saved ${clock.format(draft.capturedAt)} IST. Checked ${clock.format(comparedAt)} IST.</p>
        <section aria-labelledby="comparison-result">
          <h2 id="comparison-result">${changes.length ? 'Portal records changed' : 'No changes in portal records'}</h2>
          <p class="dashboard-note">Compares the saved invoice and line-tax registers with current portal records for this branch and month.</p>
          ${
            changes.length
              ? html`<dl class="dashboard-totals">
                <div><dt>Added</dt><dd>${counts.added}</dd></div>
                <div><dt>Changed</dt><dd>${counts.changed}</dd></div>
                <div><dt>Missing</dt><dd>${counts.missing}</dd></div>
              </dl>
              ${counts.missing ? html`<p class="dashboard-note">Missing invoices appear in the saved draft and are absent from the current register.</p>` : ''}
              ${pages > 1 ? html`<p>Showing ${start + 1}–${Math.min(start + perPage, changes.length)} of ${changes.length} invoices with differences.</p>` : ''}
              <table aria-label="Invoices with differences">
                <thead><tr><th scope="col">Invoice</th><th scope="col">Difference</th></tr></thead>
                <tbody>${changes.slice(start, start + perPage).map(
                  (change) => html`<tr>
                    <th scope="row">${change.invoiceNumber}${change.invoiceNumber !== change.invoiceId ? html`<small>${change.invoiceId}</small>` : ''}</th>
                    <td>${labels[change.kind]}${
                      change.kind === 'changed'
                        ? html`<small>${change.headerChanged && change.lineTaxChanged ? 'Invoice details and tax lines' : change.headerChanged ? 'Invoice details' : 'Tax lines'}</small>`
                        : ''
                    }</td></tr>`,
                )}</tbody>
              </table>
              ${
                pages > 1
                  ? html`<nav class="close-pages" aria-label="Comparison pages">
                ${selected > 1 ? html`<a href="${path}/compare?page=${selected - 1}" rel="prev">Previous invoices</a>` : ''}
                ${selected < pages ? html`<a href="${path}/compare?page=${selected + 1}" rel="next">Next invoices</a>` : ''}
              </nav>`
                  : ''
              }`
              : ''
          }
        </section>
        <section aria-labelledby="billing-coverage">
          <h2 id="billing-coverage">Billing source coverage</h2>
          ${sourceCoverage(billingCheck)}
        </section>
        <section aria-labelledby="invoice-numbering">
          <h2 id="invoice-numbering">Invoice numbering</h2>
          ${invoiceNumbering(numbering, path)}
        </section>
      </main></body></html>`,
    ),
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}
