import { formatINR, IST_TIME_ZONE, istToday, monthKeyIST } from '@rgss/business'
import { type CheckoutCollectionsSnapshot, invoiceReconciliationMonthSchema } from '@rgss/types'
import { Hono } from 'hono'
import { html } from 'hono/html'
import { z } from 'zod'
import { readCollectionsSnapshot } from './collections-snapshot'
import { invoiceId } from './contracts'
import type { PortalEnv } from './env'

const filters = z.object({
  month: invoiceReconciliationMonthSchema.optional(),
  branch: invoiceId.optional(),
})
const availableBranches = `SELECT branch_id FROM invoice_effective_grant
  WHERE email = ?1 AND role IN ('owner', 'manager', 'accountant')`
const dates = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeZone: IST_TIME_ZONE,
})
const timestamps = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})
const methodLabels: Record<CheckoutCollectionsSnapshot['rows'][number]['method'], string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  online: 'Online',
}

export const collectionsRoutes = new Hono<PortalEnv>()

collectionsRoutes.get('/', async (c) => {
  const selection = filters.safeParse({
    month: c.req.query('month'),
    branch: c.req.query('branch') || undefined,
  })
  if (!selection.success) return c.text('Choose a valid receipt month and branch.', 400)

  const now = new Date()
  const currentMonth = istToday(now).slice(0, 7)
  const { branch, month = monthKeyIST(now) } = selection.data
  if (month > currentMonth)
    return c.text('Choose the current receipt month or an earlier month.', 422)

  const email = c.get('email')
  const { results: branches } = await c.env.DB.prepare(`${availableBranches} ORDER BY branch_id`)
    .bind(email)
    .all<{ branch_id: string }>()
  if (branch && !branches.some(({ branch_id }) => branch_id === branch)) return c.notFound()

  const snapshot = branch ? await readCollectionsSnapshot(c.env, branch, month) : null
  if (branch) {
    const grant = await c.env.DB.prepare(`${availableBranches} AND branch_id = ?2`)
      .bind(email, branch)
      .first()
    if (!grant) return c.notFound()
  }

  const totals = { receiptCount: 0, totalPaise: 0 }
  for (const row of snapshot?.rows ?? []) {
    totals.receiptCount += row.receiptCount
    totals.totalPaise += row.totalPaise
  }

  const query = new URLSearchParams(branch ? { branch, month } : { month })
  return c.html(html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>Recorded service collections · Royal Glow</title></head>
    <body><main class="dashboard">
      <nav aria-label="Invoice portal"><a href="/portal/home?${query}">Invoice dashboard</a></nav>
      <h1>Recorded service collections</h1>
      <form method="get" class="dashboard-filters">
        <label>Branch
          <select name="branch" required>
            <option value="">Select a branch</option>
            ${branches.map(({ branch_id }) => html`<option value="${branch_id}" ${branch_id === branch ? 'selected' : ''}>${branch_id}</option>`)}
          </select>
        </label>
        <label>Receipt month (IST)
          <input name="month" type="month" required value="${month}" min="1000-01" max="${currentMonth}">
        </label>
        <button type="submit">Show collections</button>
      </form>
      <p class="dashboard-note">This report covers positive service checkout receipts recorded in the payment ledger. A split payment appears once for each method used. Review older invoices without ledger receipts, membership payments, and refunds separately.</p>
      ${
        snapshot
          ? html`<dl class="dashboard-totals">
              <div><dt>Recorded receipts</dt><dd>${totals.receiptCount.toLocaleString('en-IN')}</dd></div>
              <div><dt>Gross receipts</dt><dd>${formatINR(totals.totalPaise)}</dd></div>
            </dl>
            <p class="dashboard-note">Source read <time datetime="${snapshot.observedAt}">${timestamps.format(new Date(snapshot.observedAt))} IST</time>.</p>
            ${
              snapshot.rows.length
                ? html`<section aria-labelledby="collection-breakdown">
                    <h2 id="collection-breakdown">Receipts by date and method</h2>
                    <table aria-labelledby="collection-breakdown"><thead><tr>
                      <th scope="col">Receipt date (IST)</th><th scope="col">Method</th>
                      <th scope="col">Receipts</th><th scope="col">Amount</th>
                    </tr></thead><tbody>${snapshot.rows.map(
                      (row) => html`<tr>
                        <th scope="row"><time datetime="${row.day}">${dates.format(new Date(`${row.day}T00:00:00Z`))}</time></th>
                        <td>${methodLabels[row.method]}</td>
                        <td>${row.receiptCount.toLocaleString('en-IN')}</td>
                        <td>${formatINR(row.totalPaise)}</td>
                      </tr>`,
                    )}</tbody></table>
                  </section>`
                : html`<p>The published snapshot contains zero recorded receipts.</p>`
            }`
          : html`<p>${
              branch
                ? 'No collections snapshot has been published for this branch and month.'
                : 'Select a branch to see its recorded collections.'
            }</p>`
      }
    </main></body></html>`)
})
