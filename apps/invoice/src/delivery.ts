import type { invoiceIssueEventSchema } from '@rgss/types'
import type { output } from 'zod'
import { type InvoiceRecord, pdfKey, snapshotHash } from './contracts'
import type { InvoiceEnv } from './env'
import { loadSnapshot } from './snapshot'

const MINUTE = 60_000
const MAX_ATTEMPTS = 4
const RETRY_WINDOW = 12 * 60 * MINUTE
const MAX_PDF_BYTES = 2 * 1024 * 1024

export const INVOICE_CALLBACK_TAG_NAME = 'rgss_invoice_delivery'

interface Attempt {
  attempts: number
  first_attempt_at: number
  request_hash: string | null
  callback_tag: string | null
  requested_by: string | null
}

export type InvoiceDelivery = InvoiceRecord & { operation_id: string }

type Snapshot = output<typeof invoiceIssueEventSchema>

function sender(env: InvoiceEnv) {
  if (env.INVOICE_EMAIL_ENABLED !== 'true' || !env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL)
    return null
  return { key: env.RESEND_API_KEY, from: env.RESEND_FROM_EMAIL }
}

export function isInvoiceEmailEnabled(env: InvoiceEnv): boolean {
  return sender(env) !== null
}

function eligibleRecipient(snapshot: Snapshot): string | null {
  const { invoice } = snapshot
  if (
    !snapshot.bookingId ||
    invoice.invoiceType !== 'service' ||
    invoice.taxReviewStatus !== 'reviewed'
  ) {
    return null
  }
  return invoice.customer.email ?? null
}

export function manualRecipient(snapshot: Snapshot): string | null {
  return snapshot.invoice.paymentStatus === 'paid' ? eligibleRecipient(snapshot) : null
}

export async function dispatchDue(env: InvoiceEnv): Promise<void> {
  if (!isInvoiceEmailEnabled(env)) return
  const now = Date.now()
  const { results } = await env.DB.prepare(`
    SELECT d.operation_id, i.* FROM invoice_delivery d JOIN issued_invoice i ON i.id = d.invoice_id
    WHERE d.state IN ('queued', 'retry', 'sending') AND d.due_at <= ?
    ORDER BY d.due_at, d.invoice_id, d.operation_id LIMIT 10
  `)
    .bind(now)
    .all<InvoiceDelivery>()
  const deliveries = await Promise.allSettled(
    results.map((invoice) => env.PDF.getByName(invoice.id).deliver(invoice)),
  )
  if (deliveries.some((result) => result.status === 'rejected')) {
    throw new Error('One or more invoice operations need another queue sweep')
  }
}

export async function deliverInvoice(
  env: InvoiceEnv,
  invoice: InvoiceDelivery,
  ensurePdf: () => Promise<void>,
): Promise<void> {
  const provider = sender(env)
  if (!provider) return
  const now = Date.now()
  const attempt = await env.DB.prepare(`
    UPDATE invoice_delivery SET state = 'sending', due_at = ?, attempts = attempts + 1,
      first_attempt_at = COALESCE(first_attempt_at, ?)
    WHERE operation_id = ? AND invoice_id = ? AND state IN ('queued', 'retry', 'sending') AND due_at <= ?
    RETURNING attempts, first_attempt_at, request_hash, callback_tag, requested_by
  `)
    .bind(now + 3 * MINUTE, now, invoice.operation_id, invoice.id, now)
    .first<Attempt>()
  if (!attempt) return

  const finish = async (
    state: 'accepted' | 'failed' | 'uncertain' | 'retry',
    failure: string | null,
    providerId: string | null = null,
  ) => {
    const due = Date.now() + Math.min(15, 2 ** attempt.attempts) * MINUTE
    await env.DB.prepare(`
      UPDATE invoice_delivery SET state = ?, due_at = ?, failure = ?, provider_id = ?
      WHERE operation_id = ? AND state = 'sending' AND attempts = ?
    `)
      .bind(state, due, failure, providerId, invoice.operation_id, attempt.attempts)
      .run()
  }

  if (attempt.attempts > MAX_ATTEMPTS || now - attempt.first_attempt_at >= RETRY_WINDOW) {
    await finish(attempt.request_hash ? 'uncertain' : 'failed', 'retry_window_closed')
    return
  }

  const isManual = attempt.requested_by !== null
  // A request pinned before callback correlation must retry its original untagged body.
  const callbackTag =
    attempt.callback_tag ?? (attempt.request_hash === null ? crypto.randomUUID() : null)
  let body: string
  try {
    const snapshot = await loadSnapshot(env.FILES, invoice)
    const address = isManual
      ? manualRecipient(snapshot)
      : snapshot.delivery && eligibleRecipient(snapshot)
    if (!address) {
      await finish('failed', 'invoice_not_eligible')
      return
    }
    await ensurePdf()
    const pdf = await env.FILES.get(pdfKey(invoice))
    if (!pdf || pdf.size > MAX_PDF_BYTES) throw new Error('Invoice attachment unavailable')
    const content = new Uint8Array(await pdf.arrayBuffer()).toBase64()
    body = JSON.stringify({
      from: provider.from,
      to: [address],
      subject: `Royal Glow invoice ${snapshot.invoice.invoiceNumber}`,
      text: 'Thank you for visiting Royal Glow. Your invoice PDF is attached.',
      attachments: [{ filename: `invoice-${invoice.id}.pdf`, content }],
      ...(callbackTag ? { tags: [{ name: INVOICE_CALLBACK_TAG_NAME, value: callbackTag }] } : {}),
    })
  } catch {
    const terminal = attempt.request_hash ? 'uncertain' : 'failed'
    await finish(attempt.attempts === MAX_ATTEMPTS ? terminal : 'retry', 'attachment_unavailable')
    return
  }

  const hash = await snapshotHash(body)
  if (attempt.request_hash && attempt.request_hash !== hash) {
    await finish('uncertain', 'request_changed')
    return
  }
  const written = await env.DB.prepare(`
    UPDATE invoice_delivery SET request_hash = ?, callback_tag = ?
    WHERE operation_id = ? AND state = 'sending' AND attempts = ? AND due_at > ?
  `)
    .bind(hash, callbackTag, invoice.operation_id, attempt.attempts, Date.now() + 15_000)
    .run()
  if (!written.meta.changes) return

  let result: Response
  try {
    const operation = isManual ? `resend/${invoice.operation_id}` : 'initial'
    result = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${provider.key}`,
        'content-type': 'application/json',
        'idempotency-key': `rgss/${env.BILLING_SOURCE}/${invoice.snapshot_hash}/${operation}`,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      body,
    })
  } catch {
    await finish(
      attempt.attempts === MAX_ATTEMPTS ? 'uncertain' : 'retry',
      'provider_response_missing',
    )
    return
  }

  if (result.ok) {
    const receipt: unknown = await result.json().catch(() => null)
    const id = receipt && typeof receipt === 'object' && 'id' in receipt ? receipt.id : null
    if (typeof id === 'string' && id.length > 0 && id.length <= 128) {
      await finish('accepted', null, id)
    } else {
      await finish(
        attempt.attempts === MAX_ATTEMPTS ? 'uncertain' : 'retry',
        'provider_receipt_missing',
      )
    }
  } else {
    await result.body?.cancel()
    if (result.status === 409 || (result.status < 500 && result.status !== 429)) {
      await finish(
        result.status === 409 || attempt.attempts > 1 ? 'uncertain' : 'failed',
        'provider_rejected',
      )
    } else {
      await finish(
        attempt.attempts === MAX_ATTEMPTS ? 'uncertain' : 'retry',
        'provider_unavailable',
      )
    }
  }
}
