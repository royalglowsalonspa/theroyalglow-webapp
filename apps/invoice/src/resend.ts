import { IST_TIME_ZONE } from '@rgss/business'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { html } from 'hono/html'
import { z } from 'zod'
import { type InvoiceRecord, invoiceId } from './contracts'
import { isInvoiceEmailEnabled, manualRecipient } from './delivery'
import { recordDeliveryReview } from './delivery-review'
import type { InvoiceEnv, PortalEnv } from './env'
import type { ResendStatus } from './resend-events'
import { loadSnapshot } from './snapshot'

const deliveryBlocks = `(d.state IN ('queued', 'retry', 'sending', 'uncertain')
  OR COALESCE(d.provider_status IN ('delayed', 'suppressed', 'complained'), 0))`
const emailForm = z.strictObject({ operationId: z.uuidv4() })
const reviewForm = z.strictObject({
  operationId: z.union([z.uuidv4(), z.string().regex(/^initial:[A-Za-z0-9_-]{1,80}$/)]),
  providerId: z.uuid().transform((id) => id.toLowerCase()),
})
const labels = {
  queued: 'Queued',
  retry: 'Waiting to retry',
  sending: 'Sending',
  accepted: 'Accepted by email provider',
  failed: 'Failed',
  uncertain: 'Needs delivery review',
}
const providerLabels: Record<ResendStatus, string> = {
  sent: 'Accepted by email provider',
  delayed: 'Delivery delayed',
  delivered: 'Delivered to receiving mail server',
  bounced: 'Bounced',
  failed: 'Delivery failed',
  suppressed: 'Suppressed by email provider',
  complained: 'Reported as spam',
}
const requestTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})

type Delivery = {
  operation_id: string
  state: keyof typeof labels
  blocked: number
  requested_by: string | null
  requested_at: number | null
  provider_status: ResendStatus | null
  provider_event_at: number | null
  provider_id: string | null
  review_reference: string | null
  reviewed_provider_id: string | null
  reviewed_by: string | null
  reviewed_at: number | null
}

async function findInvoice(env: InvoiceEnv, id: string, email: string) {
  if (!invoiceId.safeParse(id).success) return null
  return env.DB.prepare(`
    SELECT i.*, g.role FROM issued_invoice i
    JOIN invoice_effective_grant g ON g.branch_id = i.branch_id AND g.email = ?
    WHERE i.id = ?
  `)
    .bind(email, id)
    .first<InvoiceRecord & { role: 'owner' | 'manager' | 'accountant' }>()
}

function initialDelivery(env: InvoiceEnv, invoiceId: string) {
  return env.DB.prepare('SELECT 1 FROM invoice_delivery WHERE operation_id = ? AND invoice_id = ?')
    .bind(`initial:${invoiceId}`, invoiceId)
    .first()
}

export const resendRoutes = new Hono<PortalEnv>()
const legacySendUnavailable =
  'This invoice was imported without email history. Check delivery in the previous system before resending.'
const missingAutomaticHistory =
  'Automatic email history is missing. Restore and reconcile the delivery records before resending.'

function deliveryReview(delivery: Delivery, invoice: InvoiceRecord) {
  const { reviewed_provider_id: candidate, reviewed_at: reviewedAt } = delivery
  const verification = !delivery.provider_status
    ? 'Awaiting a signed Resend event'
    : delivery.provider_id === candidate
      ? 'Matched by Resend'
      : 'Resend confirmed a different email ID'

  return html`
    ${
      candidate && reviewedAt !== null
        ? html`<p><strong>${verification}</strong><br>
      <small>Email ID ${candidate} · Recorded by ${delivery.reviewed_by} · ${requestTime.format(reviewedAt)} IST</small></p>`
        : ''
    }
    ${
      delivery.state !== 'uncertain'
        ? ''
        : delivery.review_reference
          ? html`
      <p>Find the matching webhook event in Resend using delivery reference <strong>${delivery.review_reference}</strong>.
        Record its email ID here, then <a href="https://resend.com/docs/webhooks/retries-and-replays#manual-replays">replay the webhook in Resend</a>.</p>
      <form method="post" action="/portal/invoices/${invoice.id}/email/review">
        <input type="hidden" name="operationId" value="${delivery.operation_id}">
        <label>Resend email ID<input name="providerId" type="text" required size="38" maxlength="36" spellcheck="false" autocapitalize="none" value="${candidate ?? ''}"></label>
        <button type="submit">Record for verification</button>
      </form>`
          : html`<p>This send has no saved delivery reference. It stays on hold.</p>`
    }
  `
}

resendRoutes.get('/:id/email', async (c) => {
  const invoice = await findInvoice(c.env, c.req.param('id'), c.get('email'))
  if (!invoice) return c.notFound()
  if (invoice.role === 'accountant')
    return c.text('Email access requires an owner or manager.', 403)
  const snapshot = await loadSnapshot(c.env.FILES, invoice)
  const recipient = manualRecipient(snapshot)
  const canReview = invoice.role === 'owner'
  const { results: deliveries } = await c.env.DB.prepare(`
    SELECT d.operation_id, d.state, d.requested_by, d.requested_at, d.provider_status, d.provider_event_at,
      d.provider_id, CASE WHEN ?1 AND d.request_hash IS NOT NULL THEN d.callback_tag END AS review_reference,
      r.provider_id AS reviewed_provider_id, r.requested_by AS reviewed_by, r.requested_at AS reviewed_at,
      ${deliveryBlocks} AS blocked
    FROM invoice_delivery d
    LEFT JOIN invoice_delivery_review r ON r.operation_id = d.operation_id AND r.provider_id = (
      SELECT candidate.provider_id FROM invoice_delivery_review candidate WHERE ?1 AND candidate.operation_id = d.operation_id
      ORDER BY candidate.requested_at DESC, candidate.provider_id LIMIT 1
    )
    WHERE d.invoice_id = ?2
    ORDER BY blocked DESC, d.requested_at DESC, d.operation_id DESC LIMIT 10
  `)
    .bind(Number(canReview), invoice.id)
    .all<Delivery>()
  const blocking = deliveries.find(({ blocked }) => blocked)
  let sendUnavailable: string | undefined
  if (!recipient) {
    sendUnavailable =
      'Email requires a paid service invoice with reviewed tax and a saved customer email.'
  } else if (!isInvoiceEmailEnabled(c.env)) {
    sendUnavailable = 'Invoice email is paused in this environment.'
  } else if (!snapshot.delivery && c.env.INVOICE_LEGACY_RESEND_ENABLED !== 'true') {
    sendUnavailable = legacySendUnavailable
  } else if (snapshot.delivery && !(await initialDelivery(c.env, invoice.id))) {
    sendUnavailable = missingAutomaticHistory
  } else if (
    blocking?.provider_status === 'suppressed' ||
    blocking?.provider_status === 'complained'
  ) {
    sendUnavailable =
      'Email is blocked for this invoice. Review the provider outcome before contacting the customer.'
  } else if (blocking?.state === 'uncertain') {
    sendUnavailable = 'Another email is on hold until the previous send is verified.'
  } else if (blocking) {
    sendUnavailable =
      'An email for this invoice is already in progress. Refresh to check its status.'
  }

  return c.html(html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>Email invoice · Royal Glow</title></head>
    <body><main><nav aria-label="Invoice portal"><a href="/portal/home">Dashboard</a>
    <a href="/portal/search?booking=${encodeURIComponent(invoice.id)}">Back to invoice</a></nav>
    <h1>Email invoice</h1>
    <p><strong>${invoice.invoice_number}</strong>${snapshot.invoice.bookingNumber ? ` · Booking ${snapshot.invoice.bookingNumber}` : ''}</p>
    ${recipient ? html`<p>The saved email for this invoice is <strong class="email-address">${recipient}</strong>.</p>` : ''}
    ${
      sendUnavailable
        ? html`<p role="status">${sendUnavailable}</p>`
        : html`
    <form method="post">
      <input type="hidden" name="operationId" value="${crypto.randomUUID()}">
      <button type="submit">Queue invoice email</button>
    </form>`
    }
    <h2>Email history</h2>
    ${
      deliveries.length
        ? html`<ul>${deliveries.map(
            (delivery) => html`
      <li><strong>${delivery.provider_status ? providerLabels[delivery.provider_status] : labels[delivery.state]}</strong>${
        delivery.provider_event_at === null
          ? ''
          : ` · ${requestTime.format(delivery.provider_event_at)} IST`
      }
      <br><small>${delivery.requested_by ? `Requested by ${delivery.requested_by}` : 'Automatic email'}${
        delivery.requested_at === null ? '' : ` · ${requestTime.format(delivery.requested_at)} IST`
      }</small>${canReview ? deliveryReview(delivery, invoice) : ''}</li>`,
          )}</ul>`
        : html`<p>No email activity recorded in this portal.</p>`
    }
    </main></body></html>`)
})

resendRoutes.post(
  '/:id/email',
  bodyLimit({ maxSize: 1024, onError: (c) => c.text('Form too large.', 413) }),
  async (c) => {
    if (c.req.header('origin') !== new URL(c.req.url).origin)
      return c.text('Same-origin form required.', 403)
    if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
      return c.text('Expected an email confirmation form.', 415)
    const parsed = emailForm.safeParse(await c.req.parseBody({ all: true }))
    if (!parsed.success) return c.text('Open the invoice email form again.', 400)
    const { operationId } = parsed.data
    const actor = c.get('email')
    const invoice = await findInvoice(c.env, c.req.param('id'), actor)
    if (!invoice) return c.notFound()
    if (invoice.role === 'accountant')
      return c.text('Email access requires an owner or manager.', 403)
    if (!isInvoiceEmailEnabled(c.env)) return c.text('Invoice email is paused.', 503)
    const snapshot = await loadSnapshot(c.env.FILES, invoice)
    if (!manualRecipient(snapshot)) return c.text('This invoice is ineligible for email.', 422)
    if (!snapshot.delivery && c.env.INVOICE_LEGACY_RESEND_ENABLED !== 'true')
      return c.text(legacySendUnavailable, 409)
    if (snapshot.delivery && !(await initialDelivery(c.env, invoice.id)))
      return c.text(missingAutomaticHistory, 409)

    const now = Date.now()
    const queued = await c.env.DB.prepare(`
      INSERT INTO invoice_delivery (operation_id, invoice_id, requested_by, requested_at, due_at)
      SELECT ?1, i.id, ?2, ?3, ?3 FROM issued_invoice i
      JOIN invoice_effective_grant g ON g.branch_id = i.branch_id AND g.email = ?2
      WHERE i.id = ?4 AND i.snapshot_hash = ?5 AND g.role IN ('owner', 'manager')
        AND (?6 = 0 OR EXISTS (SELECT 1 FROM invoice_delivery d WHERE d.invoice_id = i.id
          AND d.operation_id = 'initial:' || i.id))
        AND NOT EXISTS (SELECT 1 FROM invoice_delivery d WHERE d.invoice_id = i.id
          AND ${deliveryBlocks})
      ON CONFLICT(operation_id) DO NOTHING
    `)
      .bind(
        operationId,
        actor,
        now,
        invoice.id,
        invoice.snapshot_hash,
        Number(Boolean(snapshot.delivery)),
      )
      .run()
    if (queued.meta.changes) return c.redirect(c.req.path, 303)

    const replay = await c.env.DB.prepare(`
      SELECT 1 FROM invoice_delivery d JOIN issued_invoice i ON i.id = d.invoice_id
      JOIN invoice_effective_grant g ON g.branch_id = i.branch_id AND g.email = d.requested_by
      WHERE d.operation_id = ? AND d.invoice_id = ? AND d.requested_by = ?
        AND g.role IN ('owner', 'manager')
    `)
      .bind(operationId, invoice.id, actor)
      .first()
    if (replay) return c.redirect(c.req.path, 303)
    return c.text(
      'Email could not be queued. Reopen the form to check access and delivery status.',
      409,
    )
  },
)

resendRoutes.post(
  '/:id/email/review',
  bodyLimit({ maxSize: 1024, onError: (c) => c.text('Form too large.', 413) }),
  async (c) => {
    if (c.req.header('origin') !== new URL(c.req.url).origin)
      return c.text('Same-origin form required.', 403)
    if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
      return c.text('Expected a delivery review form.', 415)
    const actor = c.get('email')
    const invoice = await findInvoice(c.env, c.req.param('id'), actor)
    if (!invoice) return c.notFound()
    if (invoice.role !== 'owner') return c.text('Delivery review requires the branch owner.', 403)
    const parsed = reviewForm.safeParse(await c.req.parseBody({ all: true }))
    if (!parsed.success) return c.text('Check the Resend email ID and reopen the review form.', 400)
    const recorded = await recordDeliveryReview(c.env.DB, {
      ...parsed.data,
      invoiceId: invoice.id,
      actor,
      requestedAt: Date.now(),
    })
    if (!recorded)
      return c.text(
        'Review could not be recorded. Reopen the invoice email history to check its status.',
        409,
      )
    return c.redirect(`/portal/invoices/${invoice.id}/email`, 303)
  },
)
