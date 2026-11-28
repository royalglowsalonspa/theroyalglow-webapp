import { signRequest } from '@rgss/business'
import {
  type INVOICE_BRANCH_SETTLEMENT_PATH,
  type INVOICE_CHECKOUT_COLLECTIONS_PATH,
  INVOICE_ISSUE_EVENT_PATH,
  type INVOICE_ORIGINAL_ARCHIVE_PATH,
  type INVOICE_RECONCILIATION_PATH,
  type INVOICE_RECOVERY_PATH,
  type INVOICE_SOURCE_COVERAGE_PATH,
  invoiceEventIdSchema,
  invoicePdfPayloadSchema,
} from '@rgss/types'
import { z } from 'zod'

const credentials = z.object({
  source: z.string().trim().min(1).max(32),
  secret: z.string().min(32),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
})

export function readInvoiceEventsConfig() {
  const target = process.env.INVOICE_EVENTS_URL?.trim()
  if (!target) return { status: 'disabled' as const }
  const endpoint = URL.parse(target)
  const config = credentials.safeParse({
    source: process.env.INVOICE_EVENTS_SOURCE,
    secret: process.env.INVOICE_EVENTS_SECRET,
    clientId: process.env.INVOICE_EVENTS_ACCESS_CLIENT_ID,
    clientSecret: process.env.INVOICE_EVENTS_ACCESS_CLIENT_SECRET,
  })
  if (
    !config.success ||
    endpoint?.protocol !== 'https:' ||
    endpoint.pathname !== INVOICE_ISSUE_EVENT_PATH ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    return { status: 'invalid' as const }
  }
  return { status: 'ready' as const, endpoint, ...config.data }
}

export type InvoiceEventsConfig = Extract<
  ReturnType<typeof readInvoiceEventsConfig>,
  { status: 'ready' }
>

export function selectAutomaticInvoiceDelivery(
  branchId: string,
  issuedAt: Date,
  customerEmail: string | null,
) {
  const branch = invoiceEventIdSchema.safeParse(process.env.INVOICE_AUTOMATIC_EMAIL_BRANCH_ID)
  const start = z.iso.datetime().safeParse(process.env.INVOICE_AUTOMATIC_EMAIL_START_AT)
  const recipient = invoicePdfPayloadSchema.shape.customer.shape.email.safeParse(customerEmail)
  if (
    !branch.success ||
    branch.data !== branchId ||
    !start.success ||
    !recipient.success ||
    !recipient.data
  )
    return undefined
  const cutoff = new Date(start.data)
  if (!(issuedAt >= cutoff)) return undefined
  const config = readInvoiceEventsConfig()
  return config.status === 'ready'
    ? { branchId, cutoff, source: config.source, recipient: recipient.data }
    : undefined
}

export async function requestInvoiceWorker(
  config: InvoiceEventsConfig,
  path:
    | typeof INVOICE_ISSUE_EVENT_PATH
    | typeof INVOICE_ORIGINAL_ARCHIVE_PATH
    | typeof INVOICE_BRANCH_SETTLEMENT_PATH
    | typeof INVOICE_CHECKOUT_COLLECTIONS_PATH
    | typeof INVOICE_RECONCILIATION_PATH
    | typeof INVOICE_RECOVERY_PATH
    | typeof INVOICE_SOURCE_COVERAGE_PATH,
  body: string,
): Promise<Response> {
  const timestamp = Date.now()
  return fetch(new URL(path, config.endpoint), {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
    headers: {
      'content-type': 'application/json',
      'cf-access-client-id': config.clientId,
      'cf-access-client-secret': config.clientSecret,
      'x-rgss-timestamp': String(timestamp),
      'x-rgss-signature': await signRequest({ secret: config.secret, timestamp, body }),
    },
    body,
  })
}
