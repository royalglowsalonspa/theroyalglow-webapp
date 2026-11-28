// @vitest-environment node

import { createHash, createHmac } from 'node:crypto'
import { forbidden } from '@rgss/errors'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  getBranchById: vi.fn(),
  getBranchMembershipBalances: vi.fn(),
  getBranchSettlementReport: vi.fn(),
  readCheckoutCollections: vi.fn(),
  requireRole: vi.fn(),
  readInvoiceReconciliation: vi.fn(),
  readInvoiceSourceCoverage: vi.fn(),
  readOriginalInvoiceArchiveCandidate: vi.fn(),
  readPublishedInvoiceIssueBody: vi.fn(),
}))
vi.mock('@/lib/api/audit', () => ({ audit: mocks.audit }))
vi.mock('@/lib/api/session', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/env', () => ({
  env: {
    INVOICING_SERVICE_URL: 'https://legacy-renderer.example.test/',
    INVOICE_PDF_HMAC_SECRET: 'legacy-pdf-fixture-secret',
  },
}))
vi.mock('@rgss/db/queries', () => ({
  getBranchById: mocks.getBranchById,
  getBranchMembershipBalances: mocks.getBranchMembershipBalances,
  getBranchSettlementReport: mocks.getBranchSettlementReport,
  readCheckoutCollections: mocks.readCheckoutCollections,
  readInvoiceReconciliation: mocks.readInvoiceReconciliation,
  readInvoiceSourceCoverage: mocks.readInvoiceSourceCoverage,
  readOriginalInvoiceArchiveCandidate: mocks.readOriginalInvoiceArchiveCandidate,
  readPublishedInvoiceIssueBody: mocks.readPublishedInvoiceIssueBody,
}))

import { GET, POST } from './route'

const sharedSecret = 'fixture-events-secret-32-characters'
const fetchInvoice = vi.fn<typeof fetch>()
const result = {
  version: 1,
  month: '2026-10',
  source: 'staging',
  checkedAt: '2026-11-27T01:02:03.000Z',
  branches: [
    { branchId: 'branch-a', invoiceCount: 3, totalPaise: 60000 },
    { branchId: 'branch-c', invoiceCount: 1, totalPaise: 500 },
  ],
}
const coverageRows = [
  { invoiceId: 'invoice-z', totalPaise: 10001, publication: 'uncaptured' },
  { invoiceId: 'invoice-a', totalPaise: 20000, publication: 'published' },
  { invoiceId: 'invoice-m', totalPaise: 400, publication: 'failed' },
  { invoiceId: 'invoice-b', totalPaise: 599, publication: 'pending' },
]
const request = (month = '2026-10') =>
  new Request(`https://admin.example.test/api/invoice-reconciliation?month=${month}`)
const publishRequest = (
  body = '{"month":"2026-11","branchId":"branch-a"}',
  origin = 'https://admin.example.test',
) =>
  new Request('https://admin.example.test/api/invoice-reconciliation', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body,
  })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // At this instant, it has just become December in India.
  vi.setSystemTime(new Date('2026-11-30T18:30:00.000Z'))
  mocks.requireRole.mockReset().mockResolvedValue({ user: { id: 'developer-fixture' } })
  mocks.audit.mockReset().mockResolvedValue(undefined)
  mocks.readPublishedInvoiceIssueBody.mockReset().mockResolvedValue(null)
  mocks.readOriginalInvoiceArchiveCandidate.mockReset().mockResolvedValue(null)
  mocks.getBranchById.mockReset().mockResolvedValue({ id: 'branch-a' })
  mocks.getBranchMembershipBalances.mockReset()
  mocks.getBranchSettlementReport.mockReset()
  mocks.readCheckoutCollections.mockReset().mockResolvedValue([])
  mocks.readInvoiceSourceCoverage.mockReset().mockResolvedValue(coverageRows)
  mocks.readInvoiceReconciliation.mockReset().mockResolvedValue([
    {
      branchId: 'branch-a',
      invoiceCount: 3,
      totalPaise: 60000,
      publishedCount: 2,
      pendingCount: 0,
      failedCount: 0,
      uncapturedCount: 1,
    },
    {
      branchId: 'branch-b',
      invoiceCount: 1,
      totalPaise: 10001,
      publishedCount: 0,
      pendingCount: 1,
      failedCount: 0,
      uncapturedCount: 0,
    },
  ])
  fetchInvoice.mockReset().mockImplementation(async () => Response.json(result))
  vi.stubGlobal('fetch', fetchInvoice)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://admin.example.test')
  vi.stubEnv('INVOICE_EVENTS_URL', 'https://invoice.example.test/internal/v1/invoice-events')
  vi.stubEnv('INVOICE_EVENTS_SOURCE', 'staging')
  vi.stubEnv('INVOICE_EVENTS_SECRET', sharedSecret)
  vi.stubEnv('INVOICE_EVENTS_ACCESS_CLIENT_ID', 'fixture-client-id')
  vi.stubEnv('INVOICE_EVENTS_ACCESS_CLIENT_SECRET', 'fixture-client-secret')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const archiveCandidate = {
  invoiceId: 'original-42',
  branchId: 'branch-a',
  bookingId: 'booking-42',
  bookingNumber: 'BK-42',
  invoiceNumber: 'RG/2526/000042',
  recordedAt: '2026-02-20T12:00:00.000Z',
  dateBasis: 'created_at',
  totalPaise: 30500,
}
const archiveRequest = () =>
  publishRequest(
    JSON.stringify({
      report: 'archive_original',
      branchId: archiveCandidate.branchId,
      invoiceId: archiveCandidate.invoiceId,
      reason: 'Verified historical record',
    }),
  )

it('archives the stored original from the configured renderer and signs the exact PDF bytes', async () => {
  mocks.readOriginalInvoiceArchiveCandidate.mockResolvedValue(archiveCandidate)
  const bytes = Buffer.from('%PDF-1.7\noriginal fixture\n')
  fetchInvoice.mockResolvedValueOnce(
    new Response(bytes, { headers: { 'content-type': 'application/pdf' } }),
  )
  fetchInvoice.mockResolvedValueOnce(new Response(null, { status: 201 }))
  const response = await POST(archiveRequest())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    success: true,
    data: {
      invoiceId: archiveCandidate.invoiceId,
      branchId: archiveCandidate.branchId,
      status: 'archived',
    },
  })
  expect(mocks.readOriginalInvoiceArchiveCandidate).toHaveBeenCalledWith('original-42', 'branch-a')
  const [legacyUrl, legacyRequest] = fetchInvoice.mock.calls[0] ?? []
  expect(String(legacyUrl)).toBe('https://legacy-renderer.example.test/v1/invoices/download')
  expect(JSON.parse(String(legacyRequest?.body))).toEqual({
    invoiceNumber: archiveCandidate.invoiceNumber,
    issuedAt: archiveCandidate.recordedAt,
  })
  const [workerUrl, send] = fetchInvoice.mock.calls[1] ?? []
  expect(String(workerUrl)).toBe(
    'https://invoice.example.test/internal/v1/invoice-events/archive-original',
  )
  expect(JSON.parse(String(send?.body))).toEqual({
    ...archiveCandidate,
    version: 1,
    type: 'invoice.original-archive',
    source: 'staging',
    pdfBase64: bytes.toString('base64'),
  })
  const headers = new Headers(send?.headers)
  expect(headers.get('x-rgss-signature')).toBe(
    createHmac('sha256', sharedSecret)
      .update(`${headers.get('x-rgss-timestamp')}.${send?.body}`)
      .digest('hex'),
  )
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.any(Request),
    { user: { id: 'developer-fixture' } },
    {
      action: 'update',
      entityType: 'invoice_original_archive',
      entityId: 'original-42',
      branchId: 'branch-a',
      newValues: { status: 'archived', reason: 'Verified historical record' },
    },
  )
})

it('skips archives with missing, mismatched or oversized originals', async () => {
  expect((await POST(archiveRequest())).status).toBe(404)
  mocks.readOriginalInvoiceArchiveCandidate.mockResolvedValueOnce({
    ...archiveCandidate,
    branchId: 'branch-b',
  })
  expect((await POST(archiveRequest())).status).toBe(409)
  expect(fetchInvoice).not.toHaveBeenCalled()

  mocks.readOriginalInvoiceArchiveCandidate.mockResolvedValue(archiveCandidate)
  fetchInvoice.mockResolvedValueOnce(new Response(null, { status: 404 }))
  expect((await POST(archiveRequest())).status).toBe(404)
  fetchInvoice.mockResolvedValueOnce(
    new Response('%PDF-1.7\noversize fixture', {
      headers: { 'content-type': 'application/pdf', 'content-length': '1048577' },
    }),
  )
  expect((await POST(archiveRequest())).status).toBe(422)
  fetchInvoice.mockResolvedValueOnce(
    new Response('not a PDF', {
      headers: { 'content-type': 'application/pdf' },
    }),
  )
  expect((await POST(archiveRequest())).status).toBe(422)
  expect(fetchInvoice).toHaveBeenCalledTimes(3)
  expect(mocks.audit).not.toHaveBeenCalled()
})

it('inventories historical evidence from Neon without requiring the Worker', async () => {
  vi.stubEnv('INVOICE_EVENTS_URL', '')
  const base = {
    invoiceNumber: 'RG/2526/1',
    totalPaise: 30500,
    savedIssueTime: false,
    pinnedEvent: false,
    legacyPdfReference: false,
    originalUrl: 'https://private.example.test/should-never-leave-admin',
  }
  mocks.readInvoiceSourceCoverage.mockResolvedValue([
    {
      ...base,
      invoiceId: 'saved-event',
      publication: 'published',
      savedIssueTime: true,
      pinnedEvent: true,
    },
    { ...base, invoiceId: 'pending-event', publication: 'pending', pinnedEvent: true },
    { ...base, invoiceId: 'legacy-pdf', publication: 'uncaptured', legacyPdfReference: true },
    { ...base, invoiceId: 'needs-evidence', publication: 'uncaptured' },
  ])
  const endpoint = `${request().url}&report=backfill_inventory`
  expect((await GET(new Request(endpoint))).status).toBe(400)
  const response = await GET(new Request(`${endpoint}&branchId=branch-a`))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toMatch(/no-store/)
  const body = await response.text()
  expect(body).not.toContain(base.originalUrl)
  expect(JSON.parse(body)).toMatchObject({
    data: {
      branchId: 'branch-a',
      month: '2026-10',
      invoiceCount: 4,
      invoices: [
        {
          invoiceId: 'saved-event',
          pinnedEvent: true,
          periodBasis: 'saved_issue_time',
          nextAction: 'verify_published_event',
        },
        { invoiceId: 'pending-event', nextAction: 'review_outbox' },
        {
          invoiceId: 'legacy-pdf',
          legacyPdfReference: true,
          periodBasis: 'creation_time_fallback',
          nextAction: 'verify_original_pdf',
        },
        { invoiceId: 'needs-evidence', nextAction: 'locate_original_evidence' },
      ],
    },
  })
  expect(mocks.requireRole).toHaveBeenCalledWith('developer')
  expect(mocks.readInvoiceSourceCoverage).toHaveBeenCalledWith(
    new Date('2026-09-30T18:30:00.000Z'),
    new Date('2026-10-31T18:30:00.000Z'),
    'branch-a',
  )
  expect(fetchInvoice).not.toHaveBeenCalled()
  expect(mocks.audit).not.toHaveBeenCalled()
})

const recoveryRequest = (origin?: string) =>
  publishRequest(
    JSON.stringify({
      report: 'recover_invoice',
      invoiceId: 'invoice-recovery',
      branchId: 'branch-a',
      reason: 'Missing from the branch register',
    }),
    origin,
  )
const savedRecoveryEvent = {
  version: 1,
  type: 'invoice.issued',
  source: 'staging',
  eventId: 'invoice-recovery',
  invoiceId: 'invoice-recovery',
  branchId: 'branch-a',
  bookingId: 'booking-recovery',
  delivery: { mode: 'automatic', completed: true, paid: true },
  invoice: {
    templateVersion: 'takumi-v2',
    invoiceNumber: 'RG/2627/007',
    issuedAt: '2026-11-21T09:00:00Z',
    invoiceType: 'service',
    paymentStatus: 'paid',
    paymentMethod: 'upi',
    taxReviewStatus: 'reviewed',
    seller: { name: 'Royal Glow fixture', addressLines: ['Synthetic address'] },
    customer: { name: 'Fixture customer', email: 'recovery@example.invalid' },
    items: [{ name: 'Service', quantity: 1, unitPricePaise: 500, totalPricePaise: 500 }],
    totals: {
      subtotalPaise: 500,
      discountPaise: 0,
      taxableValuePaise: 500,
      cgstPaise: 0,
      sgstPaise: 0,
      gstPaise: 0,
      totalPaise: 500,
    },
  },
}

it('audits a targeted recovery and signs the original event inside its own envelope', async () => {
  const eventBody = ` ${JSON.stringify(savedRecoveryEvent, null, 2)}\n`
  mocks.readPublishedInvoiceIssueBody.mockResolvedValue(eventBody)
  fetchInvoice.mockResolvedValueOnce(new Response(null, { status: 201 }))
  const response = await POST(recoveryRequest())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    success: true,
    data: { invoiceId: 'invoice-recovery', branchId: 'branch-a', status: 'restored' },
  })
  expect(mocks.requireRole).toHaveBeenCalledWith('developer')
  expect(mocks.readPublishedInvoiceIssueBody).toHaveBeenCalledWith('invoice-recovery', 'branch-a')
  const [url, init] = fetchInvoice.mock.calls[0] ?? []
  expect(String(url)).toBe('https://invoice.example.test/internal/v1/invoice-events/recover')
  expect(JSON.parse(String(init?.body))).toEqual({
    version: 1,
    type: 'invoice.recovery',
    eventBody,
  })
  const headers = new Headers(init?.headers)
  expect(headers.get('x-rgss-signature')).toBe(
    createHmac('sha256', sharedSecret)
      .update(`${headers.get('x-rgss-timestamp')}.${init?.body}`)
      .digest('hex'),
  )
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.any(Request),
    { user: { id: 'developer-fixture' } },
    {
      action: 'update',
      entityType: 'invoice_portal_recovery',
      entityId: 'invoice-recovery',
      branchId: 'branch-a',
      newValues: { reason: 'Missing from the branch register', status: 'restored' },
    },
  )
  fetchInvoice.mockResolvedValueOnce(new Response(null, { status: 204 }))
  expect(await (await POST(recoveryRequest())).json()).toMatchObject({
    data: { status: 'verified' },
  })
})

it('fails closed for unavailable, unrelated or conflicting recovery records', async () => {
  expect((await POST(recoveryRequest('https://unrelated.example.test'))).status).toBe(403)
  expect(mocks.readPublishedInvoiceIssueBody).not.toHaveBeenCalled()
  expect((await POST(recoveryRequest())).status).toBe(404)
  mocks.readPublishedInvoiceIssueBody
    .mockResolvedValueOnce(JSON.stringify({ ...savedRecoveryEvent, branchId: 'branch-b' }))
    .mockResolvedValueOnce(JSON.stringify({ ...savedRecoveryEvent, source: 'production' }))
    .mockResolvedValue(JSON.stringify(savedRecoveryEvent))
  expect((await POST(recoveryRequest())).status).toBe(409)
  expect((await POST(recoveryRequest())).status).toBe(409)
  expect(fetchInvoice).not.toHaveBeenCalled()
  fetchInvoice.mockResolvedValueOnce(new Response(null, { status: 409 }))
  expect((await POST(recoveryRequest())).status).toBe(409)
  expect(mocks.audit).not.toHaveBeenCalled()
})

it('finds exact invoice differences when Neon and Cloudflare totals agree', async () => {
  const invoices = [
    { invoiceId: 'invoice-a', totalPaise: 19999 },
    { invoiceId: 'invoice-b', totalPaise: 599 },
    { invoiceId: 'invoice-extra', totalPaise: 10002 },
    { invoiceId: 'invoice-m', totalPaise: 400 },
  ]
  const portal = {
    version: 1,
    type: 'invoice.branch-reconciliation',
    source: 'staging',
    month: '2026-10',
    branchId: 'branch-a',
    checkedAt: result.checkedAt,
    invoices,
  }
  fetchInvoice.mockResolvedValueOnce(Response.json(portal))
  const response = await GET(new Request(`${request().url}&branchId=branch-a`))
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toMatch(/no-store/)
  expect(await response.json()).toMatchObject({
    data: {
      branchId: 'branch-a',
      status: 'different',
      neonCount: 4,
      portalCount: 4,
      exceptions: [
        { invoiceId: 'invoice-a', reason: 'amount_differs', neonPaise: 20000, portalPaise: 19999 },
        { invoiceId: 'invoice-b', reason: 'publication_incomplete', publication: 'pending' },
        {
          invoiceId: 'invoice-extra',
          reason: 'missing_from_neon',
          neonPaise: null,
          portalPaise: 10002,
        },
        { invoiceId: 'invoice-m', reason: 'publication_incomplete', publication: 'failed' },
        {
          invoiceId: 'invoice-z',
          reason: 'missing_from_portal',
          publication: 'uncaptured',
          portalPaise: null,
        },
      ],
    },
  })
  expect(mocks.readInvoiceReconciliation).not.toHaveBeenCalled()
  expect(mocks.readInvoiceSourceCoverage).toHaveBeenCalledWith(
    new Date('2026-09-30T18:30:00.000Z'),
    new Date('2026-10-31T18:30:00.000Z'),
    'branch-a',
  )
  const [url, init] = fetchInvoice.mock.calls[0] ?? []
  expect(String(url)).toBe('https://invoice.example.test/internal/v1/invoice-events/reconcile')
  const headers = new Headers(init?.headers)
  expect(headers.get('x-rgss-signature')).toBe(
    createHmac('sha256', sharedSecret)
      .update(`${headers.get('x-rgss-timestamp')}.${init?.body}`)
      .digest('hex'),
  )
  expect(JSON.parse(String(init?.body))).toEqual({
    version: 1,
    type: 'invoice.branch-reconciliation',
    source: 'staging',
    month: '2026-10',
    branchId: 'branch-a',
  })

  fetchInvoice.mockResolvedValueOnce(Response.json({ ...portal, branchId: 'branch-b' }))
  expect((await GET(new Request(`${request().url}&branchId=branch-a`))).status).toBe(503)
  fetchInvoice.mockResolvedValueOnce(
    Response.json({ ...portal, invoices: [invoices[0], invoices[0]] }),
  )
  expect((await GET(new Request(`${request().url}&branchId=branch-a`))).status).toBe(503)
  expect((await GET(new Request(`${request().url}&branchId=`))).status).toBe(400)
})

it('publishes current-month collections through the signed branch snapshot endpoint', async () => {
  vi.setSystemTime(new Date('2026-12-01T09:30:00.000Z'))
  const rows = [{ day: '2026-12-01', method: 'upi', receiptCount: 2, totalPaise: 220099 }]
  mocks.readCheckoutCollections.mockResolvedValueOnce(rows)
  fetchInvoice.mockResolvedValueOnce(new Response(null, { status: 201 }))
  const response = await POST(
    publishRequest('{"month":"2026-12","branchId":"branch-a","report":"checkout_collections"}'),
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    data: { status: 'published', branchId: 'branch-a' },
  })
  expect(mocks.readCheckoutCollections).toHaveBeenCalledWith(
    new Date('2026-11-30T18:30:00.000Z'),
    new Date('2026-12-01T09:30:00.000Z'),
    'branch-a',
  )
  expect(mocks.readInvoiceSourceCoverage).not.toHaveBeenCalled()
  const [target, init] = fetchInvoice.mock.calls[0] ?? []
  expect(String(target)).toBe(
    'https://invoice.example.test/internal/v1/invoice-events/checkout-collections',
  )
  const headers = new Headers(init?.headers)
  expect(headers.get('x-rgss-signature')).toBe(
    createHmac('sha256', sharedSecret)
      .update(`${headers.get('x-rgss-timestamp')}.${init?.body}`)
      .digest('hex'),
  )
  expect(JSON.parse(String(init?.body))).toEqual({
    version: 1,
    type: 'invoice.checkout-collections',
    source: 'staging',
    month: '2026-12',
    branchId: 'branch-a',
    observedAt: '2026-12-01T09:30:00.000Z',
    rows,
  })
})

it.each([
  { month: '2026-11', through: '2026-11-30', includeBalances: false },
  { month: '2026-12', through: '2026-12-01', includeBalances: true },
])(
  'publishes a signed settlement aggregate for $month using IST boundaries',
  async ({ month, through, includeBalances }) => {
    const membershipBalances = {
      activeCount: 2,
      purchasedMinutes: 500,
      heldMinutes: 100,
      usedMinutes: 200,
      availableMinutes: 200,
      expiringAvailableMinutes: 150,
    }
    const report = {
      memberships: {
        deliveredMinutes: 60,
        deliveredValuePaise: 40500,
        ownMembersMinutes: -15,
        ownMembersValuePaise: -10250,
        toReceivePaise: 40500,
        toPayPaise: -10250,
      },
      gems: { issued: 180, redeemed: 50, toReceivePaise: 2500, toPayPaise: 0 },
    }
    mocks.getBranchSettlementReport.mockResolvedValueOnce(report)
    mocks.getBranchMembershipBalances.mockResolvedValueOnce(membershipBalances)
    fetchInvoice.mockResolvedValueOnce(new Response(null, { status: 201 }))
    const response = await POST(
      publishRequest(JSON.stringify({ month, branchId: 'branch-a', report: 'branch_settlement' })),
    )
    expect(response.status).toBe(200)
    expect(mocks.getBranchSettlementReport).toHaveBeenCalledWith('branch-a', {
      from: `${month}-01`,
      to: through,
    })
    if (includeBalances) {
      expect(mocks.getBranchMembershipBalances).toHaveBeenCalledExactlyOnceWith(
        'branch-a',
        new Date('2026-11-30T18:30:00.000Z'),
      )
    } else {
      expect(mocks.getBranchMembershipBalances).not.toHaveBeenCalled()
    }
    const [target, init] = fetchInvoice.mock.calls[0] ?? []
    expect(String(target)).toBe(
      'https://invoice.example.test/internal/v1/invoice-events/branch-settlement',
    )
    const headers = new Headers(init?.headers)
    expect(headers.get('x-rgss-signature')).toBe(
      createHmac('sha256', sharedSecret)
        .update(`${headers.get('x-rgss-timestamp')}.${init?.body}`)
        .digest('hex'),
    )
    expect(JSON.parse(String(init?.body))).toEqual({
      version: 1,
      type: 'invoice.branch-settlement',
      source: 'staging',
      month,
      branchId: 'branch-a',
      observedAt: '2026-11-30T18:30:00.000Z',
      through,
      report,
      ...(includeBalances ? { membershipBalances } : {}),
    })
  },
)

it('rejects a future collections month before reading Neon', async () => {
  const response = await POST(
    publishRequest('{"month":"2027-01","branchId":"branch-a","report":"checkout_collections"}'),
  )
  expect(response.status).toBe(400)
  expect(mocks.readCheckoutCollections).not.toHaveBeenCalled()
  expect(fetchInvoice).not.toHaveBeenCalled()
})

it('requires the Admin developer role before consulting billing or the portal', async () => {
  mocks.requireRole.mockRejectedValueOnce(forbidden())
  expect((await GET(request())).status).toBe(403)
  expect(mocks.requireRole).toHaveBeenCalledWith('developer')
  expect(mocks.readInvoiceReconciliation).not.toHaveBeenCalled()
  expect(fetchInvoice).not.toHaveBeenCalled()
})

it('uses IST month boundaries and reports missing, extra and uncaptured invoices by branch', async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(mocks.readInvoiceReconciliation).toHaveBeenCalledWith(
    new Date('2026-09-30T18:30:00.000Z'),
    new Date('2026-10-31T18:30:00.000Z'),
  )
  const [target, options] = fetchInvoice.mock.calls[0] ?? []
  expect(String(target)).toBe('https://invoice.example.test/internal/v1/invoice-events/reconcile')
  const headers = new Headers(options?.headers)
  expect(headers.get('cf-access-client-id')).toBe('fixture-client-id')
  expect(headers.get('x-rgss-signature')).toBe(
    createHmac('sha256', sharedSecret)
      .update(`${headers.get('x-rgss-timestamp')}.${options?.body}`)
      .digest('hex'),
  )
  expect(JSON.parse(String(options?.body))).toEqual({
    version: 1,
    type: 'invoice.reconciliation',
    source: 'staging',
    month: '2026-10',
  })
  const { data } = await response.json()
  expect(data).toMatchObject({
    month: '2026-10',
    status: 'different',
    branches: [
      {
        branchId: 'branch-a',
        status: 'incomplete',
        neon: { uncapturedCount: 1 },
        delta: { invoiceCount: 0, totalPaise: 0 },
      },
      {
        branchId: 'branch-b',
        status: 'different',
        neon: { pendingCount: 1 },
        delta: { invoiceCount: -1, totalPaise: -10001 },
      },
      { branchId: 'branch-c', status: 'different', delta: { invoiceCount: 1, totalPaise: 500 } },
    ],
  })
})

it('accepts the month that just closed in IST and refuses the current month', async () => {
  fetchInvoice.mockResolvedValueOnce(Response.json({ ...result, month: '2026-11' }))
  expect((await GET(request('2026-11'))).status).toBe(200)
  expect((await GET(request('2026-12'))).status).toBe(400)
  expect(fetchInvoice).toHaveBeenCalledOnce()
})

it('returns a closed-month response only when the signed portal scope matches', async () => {
  fetchInvoice.mockResolvedValueOnce(Response.json({ ...result, source: 'prod' }))
  expect((await GET(request())).status).toBe(503)
  fetchInvoice.mockResolvedValueOnce(
    Response.json({ ...result, branches: [result.branches[0], result.branches[0]] }),
  )
  expect((await GET(request())).status).toBe(503)
  vi.stubEnv('INVOICE_EVENTS_URL', undefined)
  expect((await GET(request())).status).toBe(503)
  expect(fetchInvoice).toHaveBeenCalledTimes(2)
})

it('reports a match only when both amounts and publication coverage agree', async () => {
  mocks.readInvoiceReconciliation.mockResolvedValueOnce([
    {
      branchId: 'branch-a',
      invoiceCount: 3,
      totalPaise: 60000,
      publishedCount: 3,
      pendingCount: 0,
      failedCount: 0,
      uncapturedCount: 0,
    },
  ])
  fetchInvoice.mockResolvedValueOnce(Response.json({ ...result, branches: [result.branches[0]] }))
  expect((await (await GET(request())).json()).data.status).toBe('matched')
})

it('reports a difference when counts match but the portal is off by one paise', async () => {
  mocks.readInvoiceReconciliation.mockResolvedValueOnce([
    {
      branchId: 'branch-a',
      invoiceCount: 3,
      totalPaise: 60001,
      publishedCount: 3,
      pendingCount: 0,
      failedCount: 0,
      uncapturedCount: 0,
    },
  ])
  fetchInvoice.mockResolvedValueOnce(Response.json({ ...result, branches: [result.branches[0]] }))
  const { data } = await (await GET(request())).json()
  expect(data).toMatchObject({
    status: 'different',
    branches: [{ delta: { invoiceCount: 0, totalPaise: -1 } }],
  })
})

it('restricts coverage publishing to the developer role and exact browser origin', async () => {
  mocks.requireRole.mockRejectedValueOnce(forbidden())
  expect((await POST(publishRequest())).status).toBe(403)
  expect(mocks.requireRole).toHaveBeenCalledWith('developer')
  for (const origin of [
    'https://invoice.example.test',
    'https://admin.example.test.evil.test',
    'null',
    '',
  ]) {
    expect((await POST(publishRequest(undefined, origin))).status).toBe(403)
  }
  expect(mocks.readInvoiceSourceCoverage).not.toHaveBeenCalled()
  expect(fetchInvoice).not.toHaveBeenCalled()
})

it.each([
  { reason: 'open month', body: '{"month":"2026-12","branchId":"branch-a"}', status: 400 },
  { reason: 'invalid branch', body: '{"month":"2026-11","branchId":"branch/a"}', status: 400 },
  {
    reason: 'extra field',
    body: '{"month":"2026-11","branchId":"branch-a","extra":true}',
    status: 400,
  },
  { reason: 'malformed JSON', body: '{malformed', status: 400 },
  { reason: 'large body without a declared length', body: ' '.repeat(1025), status: 413 },
])('refuses $reason with $status before reading Neon', async ({ body, status }) => {
  expect((await POST(publishRequest(body))).status).toBe(status)
  expect(mocks.readInvoiceSourceCoverage).not.toHaveBeenCalled()
  expect(fetchInvoice).not.toHaveBeenCalled()
})

it('fails closed if the Worker connection is disabled', async () => {
  vi.stubEnv('INVOICE_EVENTS_URL', undefined)
  expect((await POST(publishRequest())).status).toBe(503)
  expect(mocks.readInvoiceSourceCoverage).not.toHaveBeenCalled()
})

it('publishes only signed coverage and a canonical identity hash for one closed IST branch month', async () => {
  mocks.readInvoiceSourceCoverage.mockImplementationOnce(async () => {
    // Ensure the observation timestamp represents the start of the source read.
    vi.setSystemTime(new Date('2026-11-30T18:30:02.000Z'))
    return coverageRows
  })
  fetchInvoice.mockResolvedValueOnce(new Response(null, { status: 201 }))

  const response = await POST(publishRequest())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ data: { status: 'published' } })
  expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(
    expect.any(Request),
    { user: { id: 'developer-fixture' } },
    {
      action: 'update',
      entityType: 'invoice_portal_report',
      entityId: 'coverage:branch-a:2026-11',
      branchId: 'branch-a',
      newValues: { report: 'coverage', month: '2026-11', observedAt: '2026-11-30T18:30:00.000Z' },
    },
  )
  expect(mocks.readInvoiceSourceCoverage).toHaveBeenCalledExactlyOnceWith(
    new Date('2026-10-31T18:30:00.000Z'),
    new Date('2026-11-30T18:30:00.000Z'),
    'branch-a',
  )
  const [target, options] = fetchInvoice.mock.calls[0] ?? []
  expect(String(target)).toBe(
    'https://invoice.example.test/internal/v1/invoice-events/source-coverage',
  )
  expect(JSON.parse(String(options?.body))).toEqual({
    version: 1,
    type: 'invoice.source-coverage',
    source: 'staging',
    branchId: 'branch-a',
    month: '2026-11',
    observedAt: '2026-11-30T18:30:00.000Z',
    invoiceCount: 4,
    totalPaise: 31000,
    publishedCount: 1,
    pendingCount: 1,
    failedCount: 1,
    uncapturedCount: 1,
    identitiesSha256: createHash('sha256')
      .update('[["invoice-a",20000],["invoice-b",599],["invoice-m",400],["invoice-z",10001]]')
      .digest('hex'),
  })
  const headers = new Headers(options?.headers)
  expect(headers.get('cf-access-client-secret')).toBe('fixture-client-secret')
  expect(headers.get('x-rgss-signature')).toBe(
    createHmac('sha256', sharedSecret)
      .update(`${headers.get('x-rgss-timestamp')}.${options?.body}`)
      .digest('hex'),
  )
})

it('does not send an incomplete observation for an oversized branch month', async () => {
  mocks.readInvoiceSourceCoverage.mockResolvedValueOnce(
    Array.from({ length: 2001 }, (_, index) => ({
      invoiceId: `invoice-${index}`,
      totalPaise: 50000,
      publication: 'published',
    })),
  )
  expect((await POST(publishRequest())).status).toBe(400)
  expect(fetchInvoice).not.toHaveBeenCalled()
})

it('does not claim a stale or replayed observation updated portal coverage', async () => {
  fetchInvoice.mockResolvedValueOnce(new Response(null, { status: 204 }))
  const response = await POST(publishRequest())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ data: { status: 'unchanged' } })
  expect(mocks.audit).not.toHaveBeenCalled()
})

it.each([
  [200, 503],
  [409, 409],
  [503, 503],
])(
  'surfaces unexpected Worker status %i without claiming publication',
  async (upstream, status) => {
    fetchInvoice.mockResolvedValueOnce(new Response('private upstream body', { status: upstream }))
    const response = await POST(publishRequest())
    expect(response.status).toBe(status)
    expect(await response.text()).not.toContain('private upstream body')
    expect(mocks.audit).not.toHaveBeenCalled()
  },
)
