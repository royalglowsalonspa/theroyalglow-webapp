import { formatDateIN, formatINR, istMonthBounds, istToday, monthKeyIST } from '@rgss/business'
import { Hono } from 'hono'
import { html } from 'hono/html'
import { z } from 'zod'
import { developerEmail } from './auth'
import { invoiceId } from './contracts'
import type { PortalEnv } from './env'
import { monthlyCloseLink } from './monthly-close-page'

const monthKey = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[012])$/)
const filters = z.object({ month: monthKey.optional(), branch: invoiceId.optional() })

interface RecentInvoice {
  id: string
  branch_id: string
  invoice_number: string
  issued_at: string
  total_paise: number
  month_count: number
  month_total: number
}

export const dashboardRoutes = new Hono<PortalEnv>()

dashboardRoutes.get('/', async (c) => {
  const email = c.get('email')
  if (email === developerEmail(c.env)) return c.redirect('/portal/access')

  const selection = filters.safeParse({
    month: c.req.query('month'),
    branch: c.req.query('branch') || undefined,
  })
  if (!selection.success) return c.text('Choose a valid month and branch.', 400)
  const { branch, month = istToday().slice(0, 7) } = selection.data
  const { results: branches } = await c.env.DB.prepare(`
    SELECT g.branch_id, EXISTS (
      SELECT 1 FROM invoice_settlement_access s
      WHERE s.email = g.email AND s.branch_id = g.branch_id
    ) AS can_view_settlement
    FROM invoice_effective_grant g WHERE g.email = ? ORDER BY g.branch_id
  `)
    .bind(email)
    .all<{ branch_id: string; can_view_settlement: number }>()
  if (branch && !branches.some((entry) => entry.branch_id === branch)) return c.notFound()

  const [start, end] = istMonthBounds(month)
  // UTC minute prefixes include whole-second and fractional timestamps at the cutoff.
  const { results: invoices } = await c.env.DB.prepare(`
    SELECT i.id, i.branch_id, i.invoice_number, i.issued_at, i.total_paise,
      COUNT(*) OVER () AS month_count, SUM(i.total_paise) OVER () AS month_total
    FROM invoice_effective_grant g
    JOIN issued_invoice i ON i.branch_id = g.branch_id
      AND rtrim(i.issued_at, 'Z') >= ?2 AND rtrim(i.issued_at, 'Z') < ?3
    WHERE g.email = ?1 ${branch ? 'AND g.branch_id = ?4' : ''}
    ORDER BY rtrim(i.issued_at, 'Z') DESC, i.id DESC LIMIT 15
  `)
    .bind(
      email,
      start.toISOString().slice(0, 16),
      end.toISOString().slice(0, 16),
      ...(branch ? [branch] : []),
    )
    .all<RecentInvoice>()
  const count = invoices[0]?.month_count ?? 0
  const registerFilters = new URLSearchParams(branch ? { month, branch } : { month })
  const closedMonth = month < istToday().slice(0, 7) ? month : monthKeyIST()
  const canViewSettlement = branches.some(
    (grant) => grant.can_view_settlement && (!branch || branch === grant.branch_id),
  )

  return c.html(html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>Invoice dashboard · Royal Glow</title></head>
    <body><main class="dashboard">
      <nav aria-label="Invoice portal">
        <a href="/portal/search">Find an invoice</a>
        ${c.get('isOwner') ? html`<a href="/portal/access">Manage branch access</a>` : ''}
      </nav>
      <h1>Invoice dashboard</h1>
      <form method="get" class="dashboard-filters">
        <label>Branch
          <select name="branch">
            <option value="">All assigned branches</option>
            ${branches.map(({ branch_id }) => html`<option value="${branch_id}" ${branch_id === branch ? 'selected' : ''}>${branch_id}</option>`)}
          </select>
        </label>
        <label>Issue month
          <input name="month" type="month" required value="${month}" min="0001-01" max="9999-12">
        </label>
        <button type="submit">Apply filters</button>
      </form>
      <dl class="dashboard-totals">
        <div><dt>Invoices on record</dt><dd>${count.toLocaleString('en-IN')}</dd></div>
        <div><dt>Total invoiced</dt><dd>${formatINR(invoices[0]?.month_total ?? 0)}</dd></div>
      </dl>
      <p class="dashboard-note">Includes invoices received by the portal. Issue months follow India Standard Time.</p>
      <nav aria-label="Invoice reports">
        <a href="/portal/reports/gst?${registerFilters.toString()}">Review monthly GST</a>
        <a href="${monthlyCloseLink(month, branch)}">Monthly close drafts</a>
        <a href="/portal/reports/gstin-close?${new URLSearchParams({ month: closedMonth }).toString()}">GSTIN close review</a>
        <a href="/portal/collections?${registerFilters.toString()}">Recorded service collections</a>
        <a href="/portal/cash-close${branch ? `?${new URLSearchParams({ branch })}` : ''}">Daily cash close</a>
        <a href="/portal/cash-close/month?${registerFilters.toString()}">Monthly cash close review</a>
        <a href="/portal/statements${branch ? `?${new URLSearchParams({ branch })}` : ''}">Bank and provider statements</a>
        <a href="/portal/refunds${branch ? `?${new URLSearchParams({ branch })}` : ''}">Refund requests</a>
        <a href="/portal/expenses?${registerFilters.toString()}">Supplier bills and payments</a>
        ${canViewSettlement ? html`<a href="/portal/settlements?${registerFilters.toString()}">Branch settlement activity</a>` : ''}
        <a href="/portal/reports/invoices.csv?${registerFilters.toString()}">Download invoice register (CSV)</a>
        <a href="/portal/reports/line-tax.csv?${registerFilters.toString()}">Download line-tax register (CSV)</a>
      </nav>
      <section aria-labelledby="recent-invoices">
        <h2 id="recent-invoices">Recent invoices</h2>
        ${
          invoices.length
            ? html`${count > invoices.length ? html`<p>Showing the latest ${invoices.length} of ${count.toLocaleString('en-IN')} invoices.</p>` : ''}
              <table aria-labelledby="recent-invoices">
                <thead><tr><th scope="col">Invoice</th><th scope="col">Issued</th><th scope="col">Total</th></tr></thead>
                <tbody>${invoices.map(
                  (invoice) => html`<tr>
                  <th scope="row"><a href="/portal/invoices/${invoice.id}/pdf" aria-label="Download PDF for ${invoice.invoice_number}">${invoice.invoice_number}</a>
                    <small>${invoice.branch_id}</small></th>
                  <td><time datetime="${invoice.issued_at}">${formatDateIN(new Date(invoice.issued_at))}</time></td>
                  <td>${formatINR(invoice.total_paise)}</td>
                </tr>`,
                )}</tbody>
              </table>`
            : html`<p>No invoices have reached the portal for this month and branch selection.</p>`
        }
      </section>
    </main></body></html>`)
})
