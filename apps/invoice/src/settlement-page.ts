import {
  formatINR,
  IST_TIME_ZONE,
  istToday,
  monthKeyIST,
  settlementReportFor,
} from '@rgss/business'
import { branchSettlementSnapshotSchema, invoiceReconciliationMonthSchema } from '@rgss/types'
import { Hono } from 'hono'
import { html } from 'hono/html'
import { z } from 'zod'
import { invoiceId } from './contracts'
import type { PortalEnv } from './env'

const filters = z.object({
  branch: invoiceId.optional(),
  month: invoiceReconciliationMonthSchema.optional(),
})
const canRead = 'FROM invoice_settlement_access WHERE email = ?1'
const number = new Intl.NumberFormat('en-IN')
const timestamp = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})

function figure(label: string, value: string) {
  return html`<div><dt>${label}</dt><dd>${value}</dd></div>`
}

export const settlementRoutes = new Hono<PortalEnv>()

settlementRoutes.get('/', async (c) => {
  const selection = filters.safeParse({
    branch: c.req.query('branch') || undefined,
    month: c.req.query('month'),
  })
  if (!selection.success) return c.text('Choose a valid settlement month and branch.', 400)
  const now = new Date()
  const currentMonth = istToday(now).slice(0, 7)
  const { branch, month = monthKeyIST(now) } = selection.data
  if (month > currentMonth) return c.text('Choose the current month or an earlier month.', 422)

  const email = c.get('email')
  const { results: branches } = await c.env.DB.prepare(
    `SELECT branch_id ${canRead} ORDER BY branch_id`,
  )
    .bind(email)
    .all<{ branch_id: string }>()
  if (!branches.length || (branch && !branches.some((row) => row.branch_id === branch)))
    return c.notFound()

  const row = branch
    ? await c.env.DB.prepare(`
        SELECT g.role, s.body, s.observed_at AS observedAt FROM (
          SELECT role ${canRead} AND branch_id = ?2
        ) AS g
        LEFT JOIN invoice_branch_settlement AS s ON s.branch_id = ?2 AND s.month = ?3 AND s.source = ?4
      `)
        .bind(email, branch, month, c.env.BILLING_SOURCE)
        .first<{
          role: 'owner' | 'manager' | 'accountant'
          body: string | null
          observedAt: number | null
        }>()
    : null
  if (branch && !row) return c.notFound()
  const snapshot = row?.body ? branchSettlementSnapshotSchema.parse(JSON.parse(row.body)) : null
  if (
    snapshot &&
    (snapshot.source !== c.env.BILLING_SOURCE ||
      snapshot.branchId !== branch ||
      snapshot.month !== month ||
      Date.parse(snapshot.observedAt) !== row?.observedAt)
  )
    throw new Error('Settlement snapshot does not match the selected branch and month')

  const seesMoney = row?.role === 'owner' || row?.role === 'accountant'
  const report = snapshot
    ? seesMoney
      ? snapshot.report
      : settlementReportFor(snapshot.report, 'manager')
    : null
  const balances = month === currentMonth ? snapshot?.membershipBalances : undefined
  const query = new URLSearchParams(branch ? { branch, month } : { month })
  return c.html(html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>Branch settlements · Royal Glow</title>
    </head><body><main class="dashboard">
    <nav aria-label="Invoice portal"><a href="/portal/home?${query}">Invoice dashboard</a></nav>
    <h1>Branch settlements</h1>
    <form method="get" class="dashboard-filters">
      <label>Branch<select name="branch" required><option value="">Select a branch</option>
      ${branches.map(({ branch_id }) => html`<option value="${branch_id}" ${branch_id === branch ? 'selected' : ''}>${branch_id}</option>`)}
      </select></label>
      <label>Activity month (IST)<input name="month" type="month" required value="${month}" min="1000-01" max="${currentMonth}"></label>
      <button type="submit">Show settlements</button>
    </form>
    ${
      report && snapshot
        ? html`<p class="dashboard-note">Ledger activity through <time datetime="${snapshot.through}">${snapshot.through}</time>, as read <time datetime="${snapshot.observedAt}">${timestamp.format(new Date(snapshot.observedAt))} IST</time>.${row?.role === 'owner' ? ' Record settlement payments and reversals in Admin.' : ''}</p>
      ${
        balances
          ? html`<section aria-labelledby="membership-balances">
        <h2 id="membership-balances">Membership balances</h2>
        <p class="dashboard-note">Active memberships sold by this branch as of <time datetime="${snapshot.observedAt}">${timestamp.format(new Date(snapshot.observedAt))} IST</time>.</p>
        <dl class="dashboard-totals">
          ${figure('Active memberships', number.format(balances.activeCount))}
          ${figure('Purchased minutes', number.format(balances.purchasedMinutes))}
          ${figure('Held minutes', number.format(balances.heldMinutes))}
          ${figure('Used minutes after corrections', number.format(balances.usedMinutes))}
          ${figure('Available minutes', number.format(balances.availableMinutes))}
          ${figure('Available minutes expiring within 30 days', number.format(balances.expiringAvailableMinutes))}
        </dl>
      </section>`
          : ''
      }
      <h2>Membership sessions</h2><dl class="dashboard-totals">
        ${figure('Minutes delivered at this branch', number.format(report.memberships.deliveredMinutes))}
        ${figure('Minutes used by this branch’s members', number.format(report.memberships.ownMembersMinutes))}
        ${
          report.memberships.toReceivePaise === null || report.memberships.toPayPaise === null
            ? ''
            : html`
          ${figure('Membership amount to receive', formatINR(report.memberships.toReceivePaise))}
          ${figure('Membership amount to pay', formatINR(report.memberships.toPayPaise))}`
        }
      </dl>
      <h2>Gems</h2><dl class="dashboard-totals">
        ${figure('Gems issued', number.format(report.gems.issued))}
        ${figure('Gems redeemed', number.format(report.gems.redeemed))}
        ${
          report.gems.toReceivePaise === null || report.gems.toPayPaise === null
            ? ''
            : html`
          ${figure('Gems amount to receive', formatINR(report.gems.toReceivePaise))}
          ${figure('Gems amount to pay', formatINR(report.gems.toPayPaise))}`
        }
      </dl>`
        : html`<p>${branch ? 'No settlement snapshot has been published for this branch and month.' : 'Select a branch to see its settlement activity.'}</p>`
    }
    </main></body></html>`)
})
