import { signRequest } from '@rgss/business'
import {
  INVOICE_ISSUE_EVENT_PATH,
  INVOICE_RECONCILIATION_PATH,
  invoiceBranchReconciliationResponseSchema,
  invoiceIssueEventSchema,
} from '@rgss/types'
import { z } from 'zod'
import { stagingHost } from './staging-config.mjs'

const origin = `https://${stagingHost}`
const allowedLoginHosts = new Set([stagingHost, 'theroyalglow.cloudflareaccess.com'])
const branchId = 'rgss-staging-smoke'
const invoiceId = 'rgss-staging-smoke-v1'
const month = '2025-01'
const totalPaise = 50_000
const fixture = {
  version: 1,
  type: 'invoice.issued',
  source: 'staging',
  eventId: invoiceId,
  invoiceId,
  branchId,
  bookingId: 'rgss-staging-smoke-booking-v1',
  invoice: {
    templateVersion: 'takumi-v2',
    invoiceNumber: 'STAGING-SMOKE/2025/000001',
    issuedAt: '2025-01-15T09:00:00.000Z',
    bookingNumber: 'STAGING-SMOKE-BOOKING-V1',
    paymentMethod: 'cash',
    paymentStatus: 'paid',
    invoiceType: 'service',
    taxReviewStatus: 'provisional',
    seller: { name: 'Synthetic staging branch', addressLines: ['Synthetic staging address'] },
    customer: { name: 'Synthetic staging invoice' },
    items: [
      {
        name: 'Synthetic service',
        quantity: 1,
        unitPricePaise: totalPaise,
        totalPricePaise: totalPaise,
      },
    ],
    totals: {
      subtotalPaise: totalPaise,
      discountPaise: 0,
      taxableValuePaise: totalPaise,
      cgstPaise: 0,
      sgstPaise: 0,
      gstPaise: 0,
      totalPaise,
    },
  },
}
const reportRequest = {
  version: 1,
  type: 'invoice.branch-reconciliation',
  source: 'staging',
  branchId,
  month,
}
const headerValue = z.string().regex(/^[\x21-\x7e]{1,512}$/)
const credentials = z.object({
  INVOICE_STAGING_BILLING_EVENT_SECRET: z.string().min(32),
  INVOICE_STAGING_BILLING_ACCESS_CLIENT_ID: headerValue,
  INVOICE_STAGING_BILLING_ACCESS_CLIENT_SECRET: headerValue,
})

function hasExpectedInvoice(invoices) {
  return (
    invoices.length === 1 &&
    invoices[0].invoiceId === invoiceId &&
    invoices[0].totalPaise === totalPaise
  )
}

async function requireProtected(response, step) {
  const target = URL.parse(response.headers.get('location') ?? '', origin)
  await response.body?.cancel().catch(() => undefined)
  if (response.status === 401 || response.status === 403) return
  if (
    [302, 303, 307, 308].includes(response.status) &&
    target?.protocol === 'https:' &&
    allowedLoginHosts.has(target.hostname) &&
    target.pathname.startsWith('/cdn-cgi/access/login')
  )
    return
  throw new Error(`${step} must deny unauthenticated access. Received HTTP ${response.status}.`)
}

export async function runStagingSmoke(env, fetcher = fetch) {
  const settings = credentials.safeParse(env)
  if (!settings.success)
    throw new Error(
      `Set valid staging credentials for ${settings.error.issues.map(({ path }) => path.join('.')).join(', ')}.`,
    )
  if (!invoiceIssueEventSchema.safeParse(fixture).success)
    throw new Error('The synthetic invoice fixture does not match the issue event contract.')
  const {
    INVOICE_STAGING_BILLING_EVENT_SECRET: secret,
    INVOICE_STAGING_BILLING_ACCESS_CLIENT_ID: clientId,
    INVOICE_STAGING_BILLING_ACCESS_CLIENT_SECRET: clientSecret,
  } = settings.data

  const request = async (path, step, init) =>
    fetcher(`${origin}${path}`, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {
      throw new Error(`${step} could not reach the staging Worker.`)
    })

  await requireProtected(await request('/portal/home', 'Portal', undefined), 'Portal')
  await requireProtected(
    await request(`/portal/invoices/${invoiceId}/pdf`, 'Private invoice PDF', undefined),
    'Private invoice PDF',
  )

  async function post(path, step, body, expected, valid = true) {
    const timestamp = Date.now()
    const signature = valid ? await signRequest({ secret, body, timestamp }) : '0'.repeat(64)
    const response = await request(path, step, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'cf-access-client-id': clientId,
        'cf-access-client-secret': clientSecret,
        'x-rgss-timestamp': String(timestamp),
        'x-rgss-signature': signature,
      },
    })
    if (!expected.includes(response.status)) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error(`${step} returned HTTP ${response.status}.`)
    }
    return response
  }

  async function reconciliation() {
    const response = await post(
      INVOICE_RECONCILIATION_PATH,
      'Signed reconciliation',
      JSON.stringify(reportRequest),
      [200],
    )
    const parsed = invoiceBranchReconciliationResponseSchema.safeParse(
      await response.json().catch(() => null),
    )
    if (
      !parsed.success ||
      parsed.data.source !== 'staging' ||
      parsed.data.branchId !== branchId ||
      parsed.data.month !== month
    )
      throw new Error('Signed reconciliation returned a different staging scope.')
    return parsed.data.invoices
  }

  const before = await reconciliation()
  if (before.length && !hasExpectedInvoice(before))
    throw new Error('The reserved synthetic branch contains unexpected records.')

  const body = JSON.stringify(fixture)
  const rejected = await post(
    INVOICE_ISSUE_EVENT_PATH,
    'Invalid signature check',
    body,
    [401],
    false,
  )
  await rejected.body?.cancel().catch(() => undefined)
  const received = await post(
    INVOICE_ISSUE_EVENT_PATH,
    'Synthetic invoice ingestion',
    body,
    [201, 204],
  )
  await received.body?.cancel().catch(() => undefined)
  const replayed = await post(INVOICE_ISSUE_EVENT_PATH, 'Exact invoice replay', body, [204])
  await replayed.body?.cancel().catch(() => undefined)
  if (!hasExpectedInvoice(await reconciliation()))
    throw new Error('Staging reconciliation did not return the exact synthetic invoice.')
  return { invoiceId, inserted: received.status === 201 }
}

if (import.meta.main) {
  try {
    const result = await runStagingSmoke(Bun.env)
    console.log(
      `Staging smoke passed for ${result.invoiceId} (${result.inserted ? 'inserted' : 'already present'}).`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Staging smoke failed.')
    process.exitCode = 1
  }
}
