import {
  INVOICE_ISSUE_EVENT_MAX_BYTES,
  INVOICE_RECOVERY_MAX_BYTES,
  invoiceIssueEventSchema,
  invoiceRecoveryEventSchema,
} from '@rgss/types'
import { snapshotHash } from './contracts'
import type { InvoiceEnv } from './env'
import { signedBody } from './signed-body'

function json(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

export async function ingest(
  request: Request,
  env: InvoiceEnv,
  recover = false,
): Promise<Response> {
  const raw = await signedBody(
    request,
    env.BILLING_EVENT_SECRET,
    recover ? INVOICE_RECOVERY_MAX_BYTES : INVOICE_ISSUE_EVENT_MAX_BYTES,
  )
  if (typeof raw !== 'string') return raw
  const recovery = recover ? invoiceRecoveryEventSchema.safeParse(json(raw)) : null
  if (recovery && !recovery.success) return new Response(null, { status: 400 })
  const body = recovery?.data.eventBody ?? raw
  if (recover && new TextEncoder().encode(body).byteLength > INVOICE_ISSUE_EVENT_MAX_BYTES)
    return new Response(null, { status: 413 })
  const parsed = invoiceIssueEventSchema.safeParse(json(body))
  if (!parsed.success || parsed.data.source !== env.BILLING_SOURCE) {
    return new Response(null, { status: 400 })
  }

  const { invoiceId, eventId, branchId, bookingId, invoice, delivery } = parsed.data
  const hash = await snapshotHash(body)
  const key = `records/${invoiceId}/${hash}.json`
  const existing = await env.DB.prepare(
    'SELECT id, event_id, snapshot_hash FROM issued_invoice WHERE id = ? OR event_id = ?',
  )
    .bind(invoiceId, eventId)
    .first<{ id: string; event_id: string; snapshot_hash: string }>()
  if (existing) {
    const matches =
      existing.id === invoiceId && existing.event_id === eventId && existing.snapshot_hash === hash
    if (!matches) return new Response(null, { status: 409 })
    // An acknowledged event can be replayed after an incomplete storage restore.
  }
  const object = await env.FILES.put(key, body, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json' },
  })
  if (recover && !object) {
    const stored = await env.FILES.get(key)
    if (
      !stored ||
      stored.size > INVOICE_ISSUE_EVENT_MAX_BYTES ||
      (await snapshotHash(await stored.arrayBuffer())) !== hash
    ) {
      return new Response(null, { status: 409 })
    }
  }

  const receivedAt = Date.now()
  const { seller, totals } = invoice
  const projectHeader = env.DB.prepare(`
    INSERT INTO invoice_register_fact (invoice_id, received_at, issuer_name, issuer_gstin,
      invoice_type, payment_status_at_issue, tax_review_status, financial_year, payment_method,
      subtotal_paise, discount_paise, taxable_value_paise, cgst_paise, sgst_paise, gst_paise, has_split_payment)
    SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM issued_invoice
    WHERE id = ? AND event_id = ? AND snapshot_hash = ?
    ON CONFLICT (invoice_id) DO UPDATE SET has_split_payment = 1
      WHERE excluded.has_split_payment = 1 AND invoice_register_fact.has_split_payment = 0
  `).bind(
    receivedAt,
    seller.name,
    seller.gstin ?? null,
    invoice.invoiceType ?? null,
    invoice.paymentStatus ?? null,
    invoice.taxReviewStatus ?? null,
    invoice.financialYear ?? null,
    invoice.paymentMethod,
    totals.subtotalPaise,
    totals.discountPaise,
    totals.taxableValuePaise,
    totals.cgstPaise,
    totals.sgstPaise,
    totals.gstPaise,
    Number(Boolean(invoice.paymentTenders)),
    invoiceId,
    eventId,
    hash,
  )
  const projectLines = env.DB.prepare(`
    INSERT INTO invoice_line_tax_fact (invoice_id, received_at, line_number, description, quantity,
      service_id, tax_version_id, sac_code, rate_bps, gems_covered, unit_price_paise,
      line_amount_paise, discount_paise, taxable_value_paise, cgst_paise, sgst_paise, gst_paise)
    SELECT i.id, ?, item.key + 1,
      json_extract(item.value, '$.name'), json_extract(item.value, '$.quantity'),
      json_extract(item.value, '$.serviceId'), json_extract(item.value, '$.taxVersionId'),
      json_extract(item.value, '$.sacCode'), json_extract(item.value, '$.rateBps'),
      json_extract(item.value, '$.gemsCovered'), json_extract(item.value, '$.unitPricePaise'),
      json_extract(item.value, '$.totalPricePaise'), json_extract(item.value, '$.discountPaise'),
      json_extract(item.value, '$.taxableValuePaise'), json_extract(item.value, '$.cgstPaise'),
      json_extract(item.value, '$.sgstPaise'), json_extract(item.value, '$.taxPaise')
    FROM issued_invoice i CROSS JOIN json_each(?) item
    WHERE i.id = ? AND i.event_id = ? AND i.snapshot_hash = ?
    ON CONFLICT (invoice_id, line_number) DO NOTHING
  `).bind(receivedAt, JSON.stringify(invoice.items), invoiceId, eventId, hash)
  if (existing) {
    await env.DB.batch([projectHeader, projectLines])
    return new Response(null, { status: 204 })
  }

  const insert = env.DB.prepare(`
    INSERT INTO issued_invoice (id, event_id, branch_id, invoice_number, booking_id, booking_number,
      issued_at, total_paise, snapshot_hash, snapshot_key, recovered_from_outbox)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
  `).bind(
    invoiceId,
    eventId,
    branchId,
    invoice.invoiceNumber,
    bookingId,
    invoice.bookingNumber ?? null,
    invoice.issuedAt,
    totals.totalPaise,
    hash,
    key,
    Number(recover),
  )
  const writes = [insert, projectHeader, projectLines]
  if (
    !recover &&
    delivery &&
    bookingId &&
    invoice.invoiceType === 'service' &&
    invoice.taxReviewStatus === 'reviewed' &&
    invoice.customer.email
  ) {
    writes.push(
      env.DB.prepare(`
      INSERT INTO invoice_delivery (operation_id, invoice_id, due_at)
      SELECT 'initial:' || id, id, ? FROM issued_invoice
      WHERE id = ? AND event_id = ? AND snapshot_hash = ? AND recovered_from_outbox = 0
      ON CONFLICT DO NOTHING
    `).bind(Date.now(), invoiceId, eventId, hash),
    )
  }
  const [write] = await env.DB.batch(writes)
  if (!write) throw new Error('Invoice insert did not return a result')
  if (write.meta.changes === 1) return new Response(null, { status: 201 })

  const replay = await env.DB.prepare(
    'SELECT 1 FROM issued_invoice WHERE id = ? AND event_id = ? AND snapshot_hash = ?',
  )
    .bind(invoiceId, eventId, hash)
    .first()
  return new Response(null, { status: replay ? 204 : 409 })
}
