// @vitest-environment node

import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  claimPendingInvoiceIssues: vi.fn(),
  saveInvoiceIssueBody: vi.fn(),
  finishInvoiceIssue: vi.fn(),
}))
vi.mock('@rgss/db/queries', () => store)

import { POST } from './route'

const url = 'https://invoice-staging.example.test/internal/v1/invoice-events'
const secret = 'fixture-issue-secret-at-least-32-characters'
const invoiceId = 'invoice-1'
const leaseToken = 'fixture-lease'
const snapshot = {
  version: 1,
  invoiceId,
  branchId: 'branch-1',
  bookingId: 'booking-1',
  customerId: 'private-source-id',
  invoice: {
    templateVersion: 'takumi-v2',
    invoiceNumber: 'TEST/2627/000001',
    issuedAt: '2026-11-27T11:00:00.000Z',
    invoiceType: 'service',
    paymentMethod: 'upi',
    paymentStatus: 'paid',
    taxReviewStatus: 'reviewed',
    financialYear: '2627',
    seller: {
      name: 'Test branch',
      addressLines: ['Synthetic address'],
      gstin: null,
      email: null,
      phone: null,
    },
    customer: { name: 'Original buyer', email: 'customer@example.invalid', phone: null },
    items: [
      {
        name: 'Sample service',
        quantity: 1,
        unitPricePaise: 50000,
        totalPricePaise: 50000,
        taxVersionId: 'test-tax',
      },
    ],
    totals: {
      subtotalPaise: 50000,
      discountPaise: 0,
      taxableValuePaise: 50000,
      cgstPaise: 0,
      sgstPaise: 0,
      gstPaise: 0,
      totalPaise: 50000,
    },
  },
}
const pending = { invoiceId, snapshot, leaseToken, attempts: 1, eventBody: null }
const transport = vi.fn<typeof fetch>()
const request = (authorized = true) =>
  new Request('https://admin-staging.example.test/api/jobs/invoice-outbox', {
    method: 'POST',
    body: '{}',
    headers: authorized ? { 'x-internal-job-token': 'fixture-job-token' } : {},
  })

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', undefined)
  vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', undefined)
  vi.stubEnv('INTERNAL_JOB_TOKEN', 'fixture-job-token')
  vi.stubEnv('INVOICE_EVENTS_URL', url)
  vi.stubEnv('INVOICE_EVENTS_SOURCE', 'staging')
  vi.stubEnv('INVOICE_EVENTS_SECRET', secret)
  vi.stubEnv('INVOICE_EVENTS_ACCESS_CLIENT_ID', 'fixture-client-id')
  vi.stubEnv('INVOICE_EVENTS_ACCESS_CLIENT_SECRET', 'fixture-client-secret')
  store.claimPendingInvoiceIssues.mockReset().mockResolvedValue([pending])
  store.saveInvoiceIssueBody.mockReset().mockResolvedValue(true)
  store.finishInvoiceIssue.mockReset().mockResolvedValue(true)
  transport.mockReset().mockResolvedValue(new Response(null, { status: 201 }))
  vi.stubGlobal('fetch', transport)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('authenticates the job and checks configuration before claiming private data', async () => {
  expect((await POST(request(false))).status).toBe(401)
  vi.stubEnv('INVOICE_EVENTS_URL', 'https://invoice-staging.example.test/unexpected')
  expect((await POST(request())).status).toBe(503)
  vi.stubEnv('INVOICE_EVENTS_URL', undefined)
  expect(await (await POST(request())).json()).toMatchObject({ skipped: true })
  expect(store.claimPendingInvoiceIssues).not.toHaveBeenCalled()
})

it('pins and signs the immutable invoice event before sending without email delivery', async () => {
  expect((await POST(request())).status).toBe(200)
  const [destination, options] = transport.mock.calls[0] ?? []
  const body = String(options?.body)
  const headers = new Headers(options?.headers)
  expect(String(destination)).toBe(url)
  expect(options?.redirect).toBe('error')
  expect(headers.get('cf-access-client-id')).toBe('fixture-client-id')
  expect(headers.get('cf-access-client-secret')).toBe('fixture-client-secret')
  expect(headers.get('x-rgss-signature')).toBe(
    createHmac('sha256', secret)
      .update(`${headers.get('x-rgss-timestamp')}.${body}`)
      .digest('hex'),
  )
  expect(JSON.parse(body)).toMatchObject({
    type: 'invoice.issued',
    version: 1,
    source: 'staging',
    eventId: invoiceId,
    invoiceId,
    bookingId: 'booking-1',
    invoice: {
      templateVersion: 'takumi-v2',
      customer: { name: 'Original buyer' },
      items: [{ taxVersionId: 'test-tax' }],
      totals: { totalPaise: 50000 },
    },
  })
  expect(JSON.parse(body)).not.toHaveProperty('delivery')
  expect(JSON.parse(body)).not.toHaveProperty('customerId')
  expect(JSON.parse(body).invoice.seller).not.toHaveProperty('gstin')
  expect(store.saveInvoiceIssueBody).toHaveBeenCalledWith(invoiceId, leaseToken, body)
  expect(store.saveInvoiceIssueBody.mock.invocationCallOrder[0]).toBeLessThan(
    transport.mock.invocationCallOrder[0] ?? 0,
  )
  expect(store.finishInvoiceIssue).toHaveBeenCalledWith(invoiceId, leaseToken, 'published')
})

it('reuses pinned bytes after a lost acknowledgment and accepts an exact replay', async () => {
  transport.mockRejectedValueOnce(new Error('lost response'))
  expect((await POST(request())).status).toBe(502)
  expect(store.finishInvoiceIssue).toHaveBeenCalledWith(invoiceId, leaseToken, 'retry')
  const eventBody = String(transport.mock.calls[0]?.[1]?.body)
  store.claimPendingInvoiceIssues.mockResolvedValueOnce([
    { ...pending, snapshot: null, eventBody, attempts: 2 },
  ])
  transport.mockResolvedValueOnce(new Response(null, { status: 204 }))
  expect((await POST(request())).status).toBe(200)
  expect(transport.mock.calls[1]?.[1]?.body).toBe(eventBody)
  expect(store.saveInvoiceIssueBody).toHaveBeenCalledOnce()
  expect(store.finishInvoiceIssue).toHaveBeenLastCalledWith(invoiceId, leaseToken, 'published')
})

it('adds automatic delivery only for an eligible, explicitly Worker-owned source snapshot', async () => {
  const ownedSnapshot = { ...snapshot, automaticDeliverySource: 'staging' }
  store.claimPendingInvoiceIssues.mockResolvedValueOnce([{ ...pending, snapshot: ownedSnapshot }])
  transport.mockRejectedValueOnce(new Error('lost response'))
  expect((await POST(request())).status).toBe(502)
  const eventBody = String(transport.mock.calls[0]?.[1]?.body)
  expect(JSON.parse(eventBody)).toMatchObject({
    delivery: { mode: 'automatic', completed: true, paid: true },
  })
  expect(JSON.parse(eventBody)).not.toHaveProperty('automaticDeliverySource')

  store.claimPendingInvoiceIssues.mockResolvedValueOnce([
    { ...pending, snapshot: ownedSnapshot, eventBody },
  ])
  transport.mockResolvedValueOnce(new Response(null, { status: 204 }))
  expect((await POST(request())).status).toBe(200)
  expect(transport.mock.calls[1]?.[1]?.body).toBe(eventBody)
  expect(store.saveInvoiceIssueBody).toHaveBeenCalledOnce()
})

it('holds a Worker-owned snapshot when the publisher points to a different source', async () => {
  store.claimPendingInvoiceIssues.mockResolvedValueOnce([
    { ...pending, snapshot: { ...snapshot, automaticDeliverySource: 'production' } },
  ])
  expect((await POST(request())).status).toBe(502)
  expect(transport).not.toHaveBeenCalled()
  expect(store.finishInvoiceIssue).toHaveBeenCalledWith(invoiceId, leaseToken, 'retry')
})

it('rejects an inconsistent assignment without publishing a new event body', async () => {
  store.claimPendingInvoiceIssues.mockResolvedValueOnce([
    {
      ...pending,
      snapshot: {
        ...snapshot,
        automaticDeliverySource: 'staging',
        invoice: { ...snapshot.invoice, customer: { name: 'Original buyer' } },
      },
    },
  ])
  expect(await (await POST(request())).json()).toMatchObject({ failed: 1 })
  expect(transport).not.toHaveBeenCalled()
  expect(store.saveInvoiceIssueBody).not.toHaveBeenCalled()
})

it('quarantines deterministic conflicts and invalid snapshots independently', async () => {
  const otherId = 'invoice-2'
  store.claimPendingInvoiceIssues.mockResolvedValueOnce([
    pending,
    { ...pending, invoiceId: otherId },
  ])
  transport.mockResolvedValueOnce(new Response('conflict', { status: 409 }))
  expect((await POST(request())).status).toBe(200)
  expect(transport).toHaveBeenCalledOnce()
  expect(store.finishInvoiceIssue).toHaveBeenCalledWith(invoiceId, leaseToken, 'failed')
  expect(store.finishInvoiceIssue).toHaveBeenCalledWith(otherId, leaseToken, 'failed')
})

it('leaves a claim for recovery when it loses the lease before saving', async () => {
  store.saveInvoiceIssueBody.mockResolvedValueOnce(false)
  expect((await POST(request())).status).toBe(502)
  expect(transport).not.toHaveBeenCalled()
  expect(store.finishInvoiceIssue).not.toHaveBeenCalled()
})
