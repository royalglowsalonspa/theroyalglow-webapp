import { formatDateIN, formatINR } from '@rgss/business'
import {
  INVOICE_BRANCH_SETTLEMENT_PATH,
  INVOICE_CHECKOUT_COLLECTIONS_PATH,
  INVOICE_ISSUE_EVENT_PATH,
  INVOICE_ORIGINAL_ARCHIVE_PATH,
  INVOICE_RECONCILIATION_PATH,
  INVOICE_RECOVERY_PATH,
  INVOICE_SOURCE_COVERAGE_PATH,
} from '@rgss/types'
import { Hono } from 'hono'
import { html } from 'hono/html'
import { accessEmail, developerEmail } from './auth'
import { cashCloseRoutes } from './cash-close-page'
import { collectionsRoutes } from './collections-page'
import { ingestCollectionsSnapshot } from './collections-snapshot'
import { type InvoiceRecord, invoiceId, lookupValue, pdfKey } from './contracts'
import { dashboardRoutes } from './dashboard'
import { dispatchDue } from './delivery'
import type { InvoiceEnv, PortalEnv } from './env'
import { expenseRoutes } from './expense-page'
import { grantRoutes } from './grants'
import { gstinCloseRoutes } from './gstin-close-page'
import { ingest } from './ingest'
import { invoiceRegisterRoutes } from './invoice-register'
import { monthlyCloseRoutes } from './monthly-close-page'
import { portalStyles } from './portal-style'
import { reconcile } from './reconciliation'
import { refundRoutes } from './refund-page'
import { resendRoutes } from './resend'
import { resendWebhook } from './resend-webhook'
import { settlementRoutes } from './settlement-page'
import { ingestSettlementSnapshot } from './settlement-snapshot'
import { ingestSourceCoverage } from './source-coverage'
import { ingestStaffRoster } from './staff-roster'
import { statementRoutes } from './statement-page'

export { InvoiceRegister } from './invoice-register'
export { InvoicePdf } from './pdf'
export { InvoiceAccessSync } from './policy-sync'

const app = new Hono<PortalEnv>()

app.use('*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'private, no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
  )
  // Preserve the Origin header on same-origin form submissions.
  c.header('Referrer-Policy', 'same-origin')
})

app.get('/healthz', (c) => c.json({ status: 'ok' }))
app.post(INVOICE_ISSUE_EVENT_PATH, (c) => ingest(c.req.raw, c.env))
app.post(INVOICE_RECOVERY_PATH, (c) => ingest(c.req.raw, c.env, true))
app.post(INVOICE_ORIGINAL_ARCHIVE_PATH, (c) =>
  c.env.REGISTER.getByName('original-archive').fetch(c.req.raw),
)
app.post(INVOICE_RECONCILIATION_PATH, (c) => reconcile(c.req.raw, c.env))
app.post(INVOICE_SOURCE_COVERAGE_PATH, (c) => ingestSourceCoverage(c.req.raw, c.env))
app.post(INVOICE_CHECKOUT_COLLECTIONS_PATH, (c) => ingestCollectionsSnapshot(c.req.raw, c.env))
app.post(INVOICE_BRANCH_SETTLEMENT_PATH, (c) => ingestSettlementSnapshot(c.req.raw, c.env))
app.post('/internal/v1/staff-roster', (c) => ingestStaffRoster(c.req.raw, c.env))
app.post('/webhooks/resend', (c) => resendWebhook(c.req.raw, c.env))

app.use('/portal/*', async (c, next) => {
  const email = await accessEmail(c.req.raw, c.env)
  if (!email) return c.text('Sign in with your approved Google account.', 401)
  c.set('email', email)
  if (email === developerEmail(c.env)) {
    if (!['/portal/access', '/portal/home', '/portal/styles.css'].includes(c.req.path)) {
      return c.text('This account manages access only.', 403)
    }
    return next()
  }
  const active = await c.env.DB.prepare(
    "SELECT MAX(role = 'owner') AS is_owner FROM invoice_effective_grant WHERE email = ? GROUP BY email",
  )
    .bind(email)
    .first<{ is_owner: number }>()
  if (!active) return c.text('Invoice portal access has not been assigned.', 403)
  c.set('isOwner', Boolean(active.is_owner))
  await next()
})

app.get('/', (c) => c.redirect('/portal/home'))
app.route('/portal/access', grantRoutes)
app.route('/portal/home', dashboardRoutes)
app.route('/portal/collections', collectionsRoutes)
app.route('/portal/cash-close', cashCloseRoutes)
app.route('/portal/expenses', expenseRoutes)
app.route('/portal/statements', statementRoutes)
app.route('/portal/refunds', refundRoutes)
app.route('/portal/settlements', settlementRoutes)
app.route('/portal/reports', invoiceRegisterRoutes)
app.route('/portal/reports/close', monthlyCloseRoutes)
app.route('/portal/reports/gstin-close', gstinCloseRoutes)
app.route('/portal/invoices', resendRoutes)
app.get('/portal/styles.css', (c) =>
  c.body(portalStyles, 200, { 'content-type': 'text/css; charset=utf-8' }),
)

app.get('/portal/search', async (c) => {
  const query = lookupValue.safeParse(c.req.query('booking'))
  const matches = query.success
    ? (
        await c.env.DB.prepare(`
    SELECT i.id, i.invoice_number, i.issued_at AS recorded_at, i.total_paise, g.role, NULL AS date_basis
    FROM issued_invoice i JOIN invoice_effective_grant g ON g.branch_id = i.branch_id AND g.email = ?1
    WHERE i.booking_id = ?2 OR i.booking_number = ?2 OR i.invoice_number = ?2 OR i.id = ?2
    UNION ALL
    SELECT a.id, a.invoice_number, a.recorded_at, a.total_paise, g.role, a.date_basis
    FROM original_invoice_archive a JOIN invoice_effective_grant g
      ON g.branch_id = a.branch_id AND g.email = ?1
    WHERE (a.booking_id = ?2 OR a.booking_number = ?2 OR a.invoice_number = ?2 OR a.id = ?2)
      AND NOT EXISTS (SELECT 1 FROM issued_invoice i WHERE i.id = a.id OR i.invoice_number = a.invoice_number)
    ORDER BY recorded_at DESC, id LIMIT 25
  `)
          .bind(c.get('email'), query.data)
          .all<
            Pick<InvoiceRecord, 'id' | 'invoice_number' | 'total_paise'> & {
              role: string
              recorded_at: string
              date_basis: 'tax_point' | 'created_at' | null
            }
          >()
      ).results
    : []

  return c.html(html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/portal/styles.css"><title>Royal Glow invoices</title></head>
    <body><main><nav aria-label="Invoice portal"><a href="/portal/home">Dashboard</a>
      ${c.get('isOwner') ? html`<a href="/portal/access">Manage branch access</a>` : ''}</nav><h1>Royal Glow invoices</h1><form method="get">
      <label>Booking ID or invoice number
      <input name="booking" type="search" maxlength="100" required value="${query.success ? query.data : ''}"></label>
      <button type="submit">Find invoice</button></form>
      ${query.success && !matches.length ? html`<p>No matching invoice.</p>` : ''}
      ${
        matches.length
          ? html`<ul>${matches.map(
              (invoice) => html`<li>${invoice.invoice_number} ·
        ${formatDateIN(new Date(invoice.recorded_at))}${invoice.date_basis === 'created_at' ? ' (billing record date)' : ''} · ${formatINR(invoice.total_paise)} ·
        ${
          invoice.date_basis
            ? html`<a href="/portal/archive/${invoice.id}/pdf">Download archived original PDF</a>`
            : html`
        <a href="/portal/invoices/${invoice.id}/pdf">Download PDF</a>${
          invoice.role === 'owner' || invoice.role === 'manager'
            ? html` · <a href="/portal/invoices/${invoice.id}/email">Email invoice</a>`
            : ''
        } · <a href="/portal/refunds/${invoice.id}">Refund review</a>`
        }</li>`,
            )}</ul>`
          : ''
      }
    </main></body></html>`)
})

app.get('/portal/archive/:id/pdf', (c): Response | Promise<Response> => {
  const id = invoiceId.safeParse(c.req.param('id'))
  if (!id.success) return c.notFound()
  return c.env.REGISTER.getByName(c.get('email')).downloadArchivedOriginal(c.get('email'), id.data)
})

app.get('/portal/invoices/:id/pdf', async (c) => {
  const id = invoiceId.safeParse(c.req.param('id'))
  if (!id.success) return c.notFound()
  const invoice = await c.env.DB.prepare(`
    SELECT i.id, i.branch_id, i.invoice_number, i.snapshot_hash, i.snapshot_key
    FROM issued_invoice i JOIN invoice_effective_grant g ON g.branch_id = i.branch_id AND g.email = ?
    WHERE i.id = ?
  `)
    .bind(c.get('email'), id.data)
    .first<InvoiceRecord>()
  if (!invoice) return c.notFound()

  const key = pdfKey(invoice)
  let pdf = await c.env.FILES.get(key)
  if (!pdf) {
    await c.env.PDF.getByName(invoice.id).ensure(invoice)
    pdf = await c.env.FILES.get(key)
  }
  if (!pdf) return c.text('PDF temporarily unavailable.', 503)
  return new Response(pdf.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="invoice-${invoice.id}.pdf"`,
    },
  })
})

app.onError((_error, c) => c.text('Invoice service temporarily unavailable.', 503))

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    if (env.ACCESS_POLICY_SYNC_ENABLED === 'true') {
      ctx.waitUntil(env.ACCESS_SYNC.getByName('portal-policy').reconcile())
    }
    await dispatchDue(env)
  },
} satisfies ExportedHandler<InvoiceEnv>
