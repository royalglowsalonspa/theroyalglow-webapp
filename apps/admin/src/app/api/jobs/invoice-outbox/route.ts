import {
  claimPendingInvoiceIssues,
  finishInvoiceIssue,
  saveInvoiceIssueBody,
} from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import {
  INVOICE_ISSUE_EVENT_MAX_BYTES,
  INVOICE_ISSUE_EVENT_PATH,
  invoiceIssueEventSchema,
  invoiceIssueSnapshotSchema,
} from '@rgss/types'
import { z } from 'zod'
import {
  type InvoiceEventsConfig,
  readInvoiceEventsConfig,
  requestInvoiceWorker,
} from '@/lib/invoices/issue-event-transport'
import { verifyQStashSignature } from '@/lib/jobs/verify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:invoice-outbox',
  environment: process.env.NODE_ENV ?? 'development',
})
type Claim = Awaited<ReturnType<typeof claimPendingInvoiceIssues>>[number]
type Outcome = 'published' | 'failed' | 'retry'
const ownership = z.object({ automaticDeliverySource: z.string().min(1).max(32).optional() })

function eventBody(claim: Claim, source: string, workerOwnsEmail: boolean): string | null {
  if (claim.eventBody !== null) {
    try {
      const parsed = invoiceIssueEventSchema.safeParse(JSON.parse(claim.eventBody))
      const event = parsed.success ? parsed.data : null
      if (
        event &&
        event.source === source &&
        event.invoiceId === claim.invoiceId &&
        event.eventId === claim.invoiceId &&
        Boolean(event.delivery) === workerOwnsEmail
      )
        return claim.eventBody
    } catch {
      return null
    }
    return null
  }

  const snapshot = invoiceIssueSnapshotSchema.safeParse(claim.snapshot)
  if (!snapshot.success || snapshot.data.invoiceId !== claim.invoiceId) return null
  const { bookingId, invoice } = snapshot.data
  if (
    workerOwnsEmail &&
    (!bookingId ||
      invoice.invoiceType !== 'service' ||
      invoice.paymentStatus !== 'paid' ||
      invoice.taxReviewStatus !== 'reviewed' ||
      !invoice.customer.email)
  ) {
    return null
  }
  return JSON.stringify({
    ...snapshot.data,
    type: 'invoice.issued',
    source,
    eventId: claim.invoiceId,
    ...(workerOwnsEmail ? { delivery: { mode: 'automatic', completed: true, paid: true } } : {}),
  })
}

async function publish(claim: Claim, config: InvoiceEventsConfig) {
  const marker = ownership.safeParse(claim.snapshot ?? {})
  const chosenSource = marker.success ? marker.data.automaticDeliverySource : undefined
  if (chosenSource && chosenSource !== config.source) {
    await finishInvoiceIssue(claim.invoiceId, claim.leaseToken, 'retry')
    return 'retry'
  }
  const body = marker.success ? eventBody(claim, config.source, Boolean(chosenSource)) : null
  let outcome: Outcome = 'failed'
  if (body !== null && Buffer.byteLength(body) <= INVOICE_ISSUE_EVENT_MAX_BYTES) {
    if (
      claim.eventBody === null &&
      !(await saveInvoiceIssueBody(claim.invoiceId, claim.leaseToken, body))
    ) {
      return 'retry'
    }
    outcome = 'retry'
    try {
      const response = await requestInvoiceWorker(config, INVOICE_ISSUE_EVENT_PATH, body)
      await response.body?.cancel()
      if (response.status === 201 || response.status === 204) outcome = 'published'
      if (response.status === 409) outcome = 'failed'
    } catch {
      // A missing acknowledgment can hide a successful import. Retry the pinned bytes.
    }
  } else if (claim.eventBody !== null) {
    // A pinned event may be blocked by a temporary configuration or version mismatch.
    outcome = 'retry'
  }

  return (await finishInvoiceIssue(claim.invoiceId, claim.leaseToken, outcome)) ? outcome : 'retry'
}

export async function POST(req: Request): Promise<Response> {
  const jobBody = await req.text()
  if (!(await verifyQStashSignature(req, jobBody))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const config = readInvoiceEventsConfig()
  if (config.status === 'disabled') return Response.json({ success: true, skipped: true })
  if (config.status !== 'ready') {
    return new Response('Invoice outbox publisher unavailable', { status: 503 })
  }

  try {
    const claims = await claimPendingInvoiceIssues(8)
    const results = await Promise.allSettled(claims.map((claim) => publish(claim, config)))
    const counts = { published: 0, failed: 0, retry: 0 }
    for (const result of results)
      counts[result.status === 'fulfilled' ? result.value : 'retry'] += 1
    if (counts.failed || counts.retry) logger.warn('Invoice outbox needs attention', counts)
    return Response.json(
      { success: counts.retry === 0, ...counts },
      { status: counts.retry ? 502 : 200 },
    )
  } catch {
    logger.error('Invoice outbox sweep could not access pending records')
    return new Response('Job failed', { status: 500 })
  }
}
