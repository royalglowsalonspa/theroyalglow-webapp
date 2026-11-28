import { formatINR } from '@rgss/business'
import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { html } from 'hono/html'
import { z } from 'zod'
import { type InvoiceRecord, invoiceId } from './contracts'
import type { PortalEnv } from './env'
import { loadSnapshot } from './snapshot'

const method = z.enum(['cash', 'upi', 'card', 'online'])
const requestId = z.uuidv4().transform((id) => id.toLowerCase())
const note = z.string().trim().min(1).max(500)
const requestForm = z.strictObject({
  requestId,
  method,
  amount: z
    .string()
    .regex(/^\d{1,8}(?:\.\d{1,2})?$/)
    .transform((value) => {
      const [whole, fraction = ''] = value.split('.')
      return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    })
    .pipe(z.int().positive()),
  lines: z
    .array(
      z
        .string()
        .regex(/^[1-9]\d?$/)
        .transform(Number),
    )
    .min(1)
    .max(60)
    .refine((lines) => new Set(lines).size === lines.length)
    .transform((lines) => lines.sort((a, b) => a - b)),
  reason: note,
})
const decisionForm = z.strictObject({
  requestId,
  decision: z.enum(['approved', 'rejected']),
  note,
})
type Role = 'owner' | 'manager' | 'accountant'
interface RefundRequest {
  id: string
  invoice_id: string
  snapshot_hash: string
  invoice_number: string
  branch_id: string
  method: z.infer<typeof method>
  amount_paise: number
  lines: string
  reason: string
  requested_by: string
  requested_at: string
  decision: z.infer<typeof decisionForm>['decision'] | null
  decision_note: string | null
  decided_by: string | null
  decided_at: string | null
}

const scopedRequests = `SELECT r.*, i.invoice_number, i.branch_id
  FROM invoice_refund_request r JOIN issued_invoice i ON i.id = r.invoice_id
  JOIN invoice_effective_grant g ON g.branch_id = i.branch_id AND g.email = ?1`

async function scopedInvoice(c: Context<PortalEnv>, id: string) {
  return c.env.DB.prepare(`SELECT i.*, g.role FROM issued_invoice i
    JOIN invoice_effective_grant g ON g.branch_id = i.branch_id AND g.email = ?1
    WHERE i.id = ?2`)
    .bind(c.get('email'), id)
    .first<InvoiceRecord & { role: Role }>()
}

async function loadRefundFacts(c: Context<PortalEnv>, invoice: InvoiceRecord) {
  const { invoice: saved } = await loadSnapshot(c.env.FILES, invoice)
  return {
    eligible: saved.invoiceType === 'service' && saved.paymentStatus === 'paid',
    tenders: saved.paymentTenders ?? [
      { method: saved.paymentMethod, amountPaise: invoice.total_paise },
    ],
    items: saved.items,
  }
}

const page = (
  title: string,
  content: ReturnType<typeof html>,
) => html`<!doctype html><html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/portal/styles.css"><title>${title} · Royal Glow</title></head>
  <body><main class="dashboard"><nav aria-label="Invoice portal"><a href="/portal/home">Dashboard</a>
  <a href="/portal/search">Find an invoice</a><a href="/portal/refunds">Refund requests</a></nav>
  <h1>${title}</h1>${content}</main></body></html>`

export const refundRoutes = new Hono<PortalEnv>()

refundRoutes.use('*', async (c, next) => {
  if (c.req.method === 'POST') {
    if (c.req.header('origin') !== new URL(c.req.url).origin)
      return c.text('Same-origin form required.', 403)
    if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
      return c.text('Expected a refund form.', 415)
  }
  await next()
})

refundRoutes.get('/', async (c) => {
  const selection = invoiceId.optional().safeParse(c.req.query('branch'))
  if (!selection.success) return c.text('Choose a valid branch.', 400)
  const branch = selection.data
  if (
    branch &&
    !(await c.env.DB.prepare(
      'SELECT 1 FROM invoice_effective_grant WHERE email = ?1 AND branch_id = ?2',
    )
      .bind(c.get('email'), branch)
      .first())
  )
    return c.notFound()
  const { results } = await c.env.DB.prepare(`${scopedRequests}
    WHERE (?2 IS NULL OR i.branch_id = ?2)
    ORDER BY r.decision IS NOT NULL, r.requested_at DESC, r.id LIMIT 100`)
    .bind(c.get('email'), branch ?? null)
    .all<RefundRequest>()
  return c.html(
    page(
      'Refund requests',
      html`
    <p class="dashboard-note">${branch ? `Showing ${branch}.` : 'Showing assigned branches.'} The list shows up to 100 requests, with pending requests first. Find an invoice to review its requests.</p>
    ${
      results.length
        ? html`<ul>${results.map(
            (r) => html`<li>
      <a href="/portal/refunds/${r.invoice_id}">${r.invoice_number}</a>
      · ${r.branch_id} · ${formatINR(r.amount_paise)} · ${r.decision ?? 'Pending owner review'}
    </li>`,
          )}</ul>`
        : html`<p>No refund requests in this selection.</p>`
    }`,
    ),
  )
})

refundRoutes.get('/:invoiceId', async (c) => {
  const id = invoiceId.safeParse(c.req.param('invoiceId'))
  if (!id.success) return c.notFound()
  const invoice = await scopedInvoice(c, id.data)
  if (!invoice) return c.notFound()
  const [history, facts] = await Promise.all([
    c.env.DB.prepare(
      `${scopedRequests} WHERE r.invoice_id = ?2 ORDER BY r.requested_at DESC, r.id LIMIT 101`,
    )
      .bind(c.get('email'), invoice.id)
      .all<RefundRequest>(),
    invoice.role === 'accountant' ? null : loadRefundFacts(c, invoice).catch(() => null),
  ])
  const form = facts?.eligible && invoice.total_paise > 0
  const path = `/portal/refunds/${invoice.id}`
  return c.html(
    page(
      'Invoice refund review',
      html`
    <p>${invoice.invoice_number} · ${invoice.branch_id} · ${formatINR(invoice.total_paise)}</p>
    <p class="dashboard-note">Owner approval authorizes a request for follow-up. The billing team must confirm the refundable balance and record any refund separately.</p>
    ${
      form
        ? html`
      <h2>Prepare a request</h2>
      <form method="post" class="close-review-form">
        <input type="hidden" name="requestId" value="${crypto.randomUUID()}">
        <label>Original tender <select name="method" required>
          ${facts.tenders.map((tender) => html`<option value="${tender.method}">${tender.method} · ${formatINR(tender.amountPaise)}</option>`)}
        </select></label>
        <label>Refund amount (₹) <input name="amount" maxlength="11" inputmode="decimal" required></label>
        <fieldset class="refund-lines"><legend>Affected lines</legend>${facts.items.map(
          (item, i) => html`
          <label><input name="lines" type="checkbox" value="${i + 1}"> ${i + 1}. ${item.name}</label>`,
        )}
        </fieldset>
        <label>Reason <textarea name="reason" maxlength="500" required></textarea></label>
        <button>Submit for review</button>
      </form>`
        : invoice.role !== 'accountant'
          ? html`<p>New requests require a verified paid service invoice with a positive balance at issuance.</p>`
          : ''
    }
    <h2>Request history</h2>
    ${
      history.results.length
        ? html`<ul>${history.results.slice(0, 100).map(
            (r) => html`<li>
      <strong>${formatINR(r.amount_paise)} · ${r.method} · ${r.decision ?? 'Pending owner review'}</strong>
      <p class="close-review-note">Lines ${r.lines.slice(1, -1).replaceAll(',', ', ')} · ${r.reason}</p>
      <p class="dashboard-note">${r.requested_by} submitted at ${r.requested_at}</p>
      ${r.decision_note ? html`<p class="close-review-note">${r.decision_note}</p><p class="dashboard-note">${r.decided_by} reviewed at ${r.decided_at}</p>` : ''}
      ${
        r.decision === null && invoice.role === 'owner'
          ? html`
        <form method="post" action="${path}/decision" class="close-review-form">
          <input type="hidden" name="requestId" value="${r.id}">
          <label>Review note <textarea name="note" maxlength="500" required></textarea></label>
          <div><button name="decision" value="approved">Approve request</button>
          <button name="decision" value="rejected">Reject request</button></div>
        </form>`
          : ''
      }
      </li>`,
          )}</ul>`
        : html`<p>No requests for this invoice.</p>`
    }
    ${history.results.length > 100 ? html`<p>Showing the latest 100 requests.</p>` : ''}`,
    ),
  )
})

const maxForm = bodyLimit({ maxSize: 8192 })

refundRoutes.post('/:invoiceId', maxForm, async (c) => {
  const id = invoiceId.safeParse(c.req.param('invoiceId'))
  if (!id.success) return c.notFound()
  const invoice = await scopedInvoice(c, id.data)
  if (!invoice) return c.notFound()
  if (invoice.role === 'accountant') return c.text('Staff permission required.', 403)
  const fields = await c.req.parseBody({ all: true }).catch(() => null)
  const input = requestForm.safeParse(fields && { ...fields, lines: [fields.lines ?? []].flat() })
  if (!input.success)
    return c.text('Enter a valid amount, original tender, affected lines and reason.', 400)
  const data = input.data
  const facts = await loadRefundFacts(c, invoice).catch(() => null)
  if (!facts) return c.text('The saved invoice could not be verified.', 503)
  const cap = facts.tenders.find((tender) => tender.method === data.method)?.amountPaise ?? 0
  if (
    !facts.eligible ||
    data.amount > cap ||
    data.lines.some((line) => line > facts.items.length)
  ) {
    return c.text('This request does not fit the saved paid invoice and tender.', 422)
  }
  const lines = JSON.stringify(data.lines)
  const actor = c.get('email')
  const path = `/portal/refunds/${invoice.id}`
  const result = await c.env.DB.prepare(`INSERT INTO invoice_refund_request
    (id, invoice_id, snapshot_hash, method, amount_paise, lines, reason, requested_by, requested_at)
    SELECT ?1, i.id, i.snapshot_hash, ?4, ?5, ?6, ?7, ?8, ?9
    FROM issued_invoice i JOIN invoice_effective_grant g ON g.branch_id = i.branch_id
    WHERE i.id = ?2 AND i.snapshot_hash = ?3 AND g.email = ?8 AND g.role IN ('owner', 'manager')
      AND ?5 <= ?10 - (SELECT COALESCE(SUM(amount_paise), 0) FROM invoice_refund_request
        WHERE invoice_id = i.id AND method = ?4 AND decision IS NOT 'rejected')
    ON CONFLICT(id) DO NOTHING`)
    .bind(
      data.requestId,
      invoice.id,
      invoice.snapshot_hash,
      data.method,
      data.amount,
      lines,
      data.reason,
      actor,
      new Date().toISOString(),
      cap,
    )
    .run()
  if (result.meta.changes === 1) return c.redirect(path, 303)
  const replay = await c.env.DB.prepare(`${scopedRequests} WHERE r.id = ?2 AND r.invoice_id = ?3
    AND g.role IN ('owner', 'manager')`)
    .bind(actor, data.requestId, invoice.id)
    .first<RefundRequest>()
  if (
    replay?.snapshot_hash === invoice.snapshot_hash &&
    replay.requested_by === actor &&
    replay.method === data.method &&
    replay.amount_paise === data.amount &&
    replay.lines === lines &&
    replay.reason === data.reason
  )
    return c.redirect(path, 303)
  return c.text(
    'The available request amount or invoice access changed. Reload and review existing requests.',
    409,
  )
})

refundRoutes.post('/:invoiceId/decision', maxForm, async (c) => {
  const id = invoiceId.safeParse(c.req.param('invoiceId'))
  if (!id.success) return c.notFound()
  const invoice = await scopedInvoice(c, id.data)
  if (!invoice) return c.notFound()
  if (invoice.role !== 'owner') return c.text('Branch owner permission required.', 403)
  const input = decisionForm.safeParse(await c.req.parseBody({ all: true }).catch(() => null))
  if (!input.success) return c.text('Choose a decision and enter a review note.', 400)
  const { requestId: request, decision, note: reason } = input.data
  const owner = c.get('email')
  const path = `/portal/refunds/${invoice.id}`
  const result = await c.env.DB.prepare(`UPDATE invoice_refund_request
    SET decision = ?3, decision_note = ?4, decided_by = ?5, decided_at = ?6
    WHERE id = ?1 AND invoice_id = ?2 AND decision IS NULL AND EXISTS (
      SELECT 1 FROM issued_invoice i JOIN invoice_effective_grant g ON g.branch_id = i.branch_id
      WHERE i.id = ?2 AND i.snapshot_hash = invoice_refund_request.snapshot_hash
        AND g.email = ?5 AND g.role = 'owner')`)
    .bind(request, invoice.id, decision, reason, owner, new Date().toISOString())
    .run()
  if (result.meta.changes === 1) return c.redirect(path, 303)
  const current = await c.env.DB.prepare(
    `${scopedRequests} WHERE r.id = ?2 AND r.invoice_id = ?3 AND g.role = 'owner'`,
  )
    .bind(owner, request, invoice.id)
    .first<RefundRequest>()
  if (!current) return c.notFound()
  if (
    current.decision === decision &&
    current.decision_note === reason &&
    current.decided_by === owner
  ) {
    return c.redirect(path, 303)
  }
  return c.text('This request changed. Reload its review history.', 409)
})
