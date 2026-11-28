import { formatDateIN, formatINR, IST_TIME_ZONE } from '@rgss/business'
import { html } from 'hono/html'
import type { CashCloseMonthRow } from './cash-close-month-data'

const timestamp = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})

function closeStatus(row: CashCloseMonthRow) {
  if (row.revision === null) return 'No draft'
  return row.approved ? 'Approved' : 'Awaiting approval'
}

function bankStatus(row: CashCloseMonthRow) {
  if (row.bankCreditPaise !== null) {
    const differs = row.depositsPaise !== null && row.bankCreditPaise !== row.depositsPaise
    return html`${differs ? 'Bank credit differs' : 'Credit linked'}
      <small>${formatINR(row.bankCreditPaise)} credited${row.bankCreditRevision === null ? '' : ` · Linked to revision ${row.bankCreditRevision}`}</small>
      ${differs && row.depositsPaise !== null ? html`<small>${formatINR(row.depositsPaise)} on latest draft</small>` : ''}`
  }
  if (row.depositsPaise === null) return 'Unavailable'
  if (row.depositsPaise === 0) return 'No deposit recorded'
  return html`${row.approved ? 'Awaiting bank credit' : 'Awaiting close approval'}
    <small>${formatINR(row.depositsPaise)} deposit</small>`
}

export function renderCashCloseMonth({
  branches,
  branch,
  month,
  currentMonth,
  review,
}: {
  branches: string[]
  branch?: string
  month: string
  currentMonth: string
  review: { sourceObservedAt: string | null; rows: CashCloseMonthRow[] } | null
}) {
  const filters = new URLSearchParams(branch ? { branch, month } : { month })
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>Monthly cash close · Royal Glow</title></head>
    <body><main class="dashboard">
      <nav aria-label="Invoice portal">
        <a href="/portal/home?${filters}">Invoice dashboard</a>
        <a href="/portal/collections?${filters}">Recorded service collections</a>
      </nav>
      <h1>Monthly cash close</h1>
      <form action="/portal/cash-close/month" method="get" class="dashboard-filters">
        <label>Branch
          <select name="branch" required>
            <option value="">Select a branch</option>
            ${branches.map((id) => html`<option value="${id}" ${id === branch ? 'selected' : ''}>${id}</option>`)}
          </select>
        </label>
        <label>Business month (IST)
          <input type="month" name="month" required value="${month}" min="1000-01" max="${currentMonth}">
        </label>
        <button type="submit">Show cash closes</button>
      </form>
      ${
        review && branch
          ? html`<p><a href="/portal/cash-close/month.csv?${filters}">Download cash-close CSV</a></p>
            <p id="cash-close-scope" class="dashboard-note">Completed dates with recorded service cash or a saved cash close draft appear here. Older checkout receipts can be absent from the service ledger.</p>
            ${
              review.sourceObservedAt
                ? html`<p class="dashboard-note">Collections source read <time datetime="${review.sourceObservedAt}">${timestamp.format(new Date(review.sourceObservedAt))} IST</time>.</p>`
                : html`<p class="dashboard-note">No collections snapshot has been published for this branch and month.</p>`
            }
            ${
              review.rows.length
                ? html`<table aria-label="Daily cash closes" aria-describedby="cash-close-scope">
                  <thead><tr><th scope="col">Business date</th><th scope="col">Cash close</th><th scope="col">Bank deposit</th></tr></thead>
                  <tbody>${review.rows.map((row) => {
                    const daily = new URLSearchParams({ branch, day: row.day })
                    const variance = row.variancePaise
                    return html`<tr>
                      <th scope="row"><a href="/portal/cash-close?${daily}"><time datetime="${row.day}">${formatDateIN(new Date(`${row.day}T00:00:00Z`))}</time></a></th>
                      <td><strong>${closeStatus(row)}</strong>${row.revision === null ? '' : ` · Revision ${row.revision}`}
                        ${
                          row.serviceCashPaise === null
                            ? html`<small>Source unavailable for this day</small>`
                            : html`<small>${formatINR(row.serviceCashPaise)} recorded service cash</small>`
                        }
                        ${
                          row.revision !== null &&
                          !row.sourceCurrent &&
                          row.serviceCashPaise !== null
                            ? html`<small><strong>${row.serviceCashPaise === row.draftServiceCashPaise ? 'Collections source is older than the draft' : 'Recorded service cash changed'}</strong>${row.draftServiceCashPaise !== null && row.serviceCashPaise !== row.draftServiceCashPaise ? ` · ${formatINR(row.draftServiceCashPaise)} on the draft` : ''}</small>`
                            : ''
                        }
                        ${variance === null ? '' : html`<small>${variance === 0 ? 'Balanced' : `${variance < 0 ? 'Short by' : 'Over by'} ${formatINR(Math.abs(variance))}`}</small>`}
                      </td>
                      <td>${bankStatus(row)}</td>
                    </tr>`
                  })}</tbody>
                </table>`
                : html`<p>No completed dates have recorded service cash or a saved draft for this selection.</p>`
            }`
          : html`<p>Select a branch to review its monthly cash closes.</p>`
      }
    </main></body></html>`
}
