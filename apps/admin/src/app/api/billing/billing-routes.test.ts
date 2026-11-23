// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : billing-routes.test
 * Scope        : Unit tests for the admin Billing API routes
 *
 * Description  : Verifies GET /api/billing (list + pagination meta + filters)
 *                and GET /api/billing/[id] (detail + 404), plus the RBAC guard
 *                (401 unauthenticated / 403 forbidden) and the response
 *                envelope. Both read the active branch only: another branch's
 *                invoice is not found (multi-branch R2.3). requireBranchRole +
 *                DB are mocked; no live session/DB.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handlers). Receptionist+.
 ************************************************************/

import { verifyRequest } from '@rgss/business'
import { AppError, ERROR_CODES } from '@rgss/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
  getInvoices: vi.fn(),
  getInvoiceById: vi.fn(),
  getMembershipCorrectionTarget: vi.fn(),
  listMembershipCorrections: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/env', () => ({
  env: {
    INVOICING_SERVICE_URL: 'https://invoicing.example.invalid',
    INVOICE_PDF_HMAC_SECRET: 'fixture-invoice-secret',
  },
}))

import * as billingIdPdfRoute from '@/app/api/billing/[id]/pdf/route'
import * as billingIdRoute from '@/app/api/billing/[id]/route'
import * as billingRoute from '@/app/api/billing/route'

const unauthenticated = () =>
  new AppError({
    code: ERROR_CODES.UNAUTHENTICATED,
    message: 'You must be signed in.',
    statusCode: 401,
  })

const forbidden = () =>
  new AppError({
    code: ERROR_CODES.FORBIDDEN,
    message: 'You do not have permission to perform this action.',
    statusCode: 403,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_admin' }))
})
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/billing/[id]/pdf', () => {
  const request = new Request('https://admin.theroyalglow.in/api/billing/inv1/pdf')
  const route = { params: Promise.resolve({ id: 'inv1' }) }

  it('checks the active branch before fetching a private PDF', async () => {
    dbMocks.getInvoiceById.mockResolvedValue({
      id: 'inv1',
      invoiceNumber: 'RS/2627/000042',
      pdfUrl: '/api/billing/inv1/pdf',
      taxPointAt: new Date('2026-10-24T18:30:00.000Z'),
      createdAt: new Date('2026-10-24T18:31:00.000Z'),
    })
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('%PDF-fixture', { headers: { 'Content-Type': 'application/pdf' } }),
      )
    vi.stubGlobal('fetch', fetcher)

    const res = await billingIdPdfRoute.GET(request, route)
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getInvoiceById).toHaveBeenCalledWith('inv1', TEST_BRANCH.id)
    const call = fetcher.mock.calls[0]
    expect(call?.[0]).toBe('https://invoicing.example.invalid/v1/invoices/download')
    const init = call?.[1]
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error' })
    const body = String(init?.body)
    expect(JSON.parse(body)).toEqual({
      invoiceNumber: 'RS/2627/000042',
      issuedAt: '2026-10-24T18:30:00.000Z',
    })
    const headers = new Headers(init?.headers)
    expect(
      await verifyRequest({
        secret: 'fixture-invoice-secret',
        timestamp: Number(headers.get('x-rgss-timestamp')),
        signature: headers.get('x-rgss-signature') ?? '',
        body,
      }),
    ).toBe(true)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="RS-2627-000042.pdf"')
    expect(await res.text()).toBe('%PDF-fixture')
  })

  it('returns 404 without calling the renderer when a different branch owns the invoice', async () => {
    dbMocks.getInvoiceById.mockResolvedValue(null)
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)

    const res = await billingIdPdfRoute.GET(request, route)
    expect(dbMocks.getInvoiceById).toHaveBeenCalledWith('inv1', TEST_BRANCH.id)
    expect(res.status).toBe(404)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('enforces authorization before reading an invoice row', async () => {
    mocks.requireBranchRole.mockRejectedValue(forbidden())
    const res = await billingIdPdfRoute.GET(request, route)
    expect(res.status).toBe(403)
    expect(dbMocks.getInvoiceById).not.toHaveBeenCalled()
  })
})

describe('GET /api/billing', () => {
  it('returns invoices with pagination meta', async () => {
    dbMocks.getInvoices.mockResolvedValue({
      rows: [{ id: 'inv1', invoiceNumber: 'INV-1-2627-00001' }],
      totalCount: 1,
    })

    const res = await billingRoute.GET(new Request('https://admin.theroyalglow.in/api/billing'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({
      branchId: TEST_BRANCH.id,
      invoices: [{ id: 'inv1', invoiceNumber: 'INV-1-2627-00001' }],
    })
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(body.meta).toMatchObject({ page: 1, totalPages: 1, totalCount: 1 })
  })

  it('forwards search + status + type filters to the query', async () => {
    dbMocks.getInvoices.mockResolvedValue({ rows: [], totalCount: 0 })

    await billingRoute.GET(
      new Request(
        'https://admin.theroyalglow.in/api/billing?q=asha&status=paid&type=service&page=2&pageSize=10',
      ),
    )

    expect(dbMocks.getInvoices).toHaveBeenCalledWith(
      TEST_BRANCH.id,
      expect.objectContaining({
        q: 'asha',
        status: 'paid',
        type: 'service',
        page: 2,
        pageSize: 10,
      }),
    )
  })

  it('rejects an invalid status with the 400 envelope', async () => {
    const res = await billingRoute.GET(
      new Request('https://admin.theroyalglow.in/api/billing?status=banana'),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 })
    expect(dbMocks.getInvoices).not.toHaveBeenCalled()
  })

  it('→ 401 when unauthenticated', async () => {
    mocks.requireBranchRole.mockRejectedValue(unauthenticated())
    const res = await billingRoute.GET(new Request('https://admin.theroyalglow.in/api/billing'))
    expect(res.status).toBe(401)
    expect(dbMocks.getInvoices).not.toHaveBeenCalled()
  })

  it('→ 403 when role is insufficient', async () => {
    mocks.requireBranchRole.mockRejectedValue(forbidden())
    const res = await billingRoute.GET(new Request('https://admin.theroyalglow.in/api/billing'))
    expect(res.status).toBe(403)
  })

  it('exports GET only', () => {
    expect(typeof billingRoute.GET).toBe('function')
    expect((billingRoute as Record<string, unknown>).POST).toBeUndefined()
  })
})

describe('GET /api/billing/[id]', () => {
  it('returns the invoice with items', async () => {
    dbMocks.getInvoiceById.mockResolvedValue({ id: 'inv1', items: [{ id: 'it1' }] })

    const res = await billingIdRoute.GET(
      new Request('https://admin.theroyalglow.in/api/billing/inv1'),
      { params: Promise.resolve({ id: 'inv1' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: { invoice: { id: 'inv1', items: [{ id: 'it1' }] } },
    })
    // Looked up at the active branch: another branch's invoice is not found.
    expect(dbMocks.getInvoiceById).toHaveBeenCalledWith('inv1', TEST_BRANCH.id)
  })

  it('returns the 404 envelope when the invoice is missing', async () => {
    dbMocks.getInvoiceById.mockResolvedValue(null)

    const res = await billingIdRoute.GET(
      new Request('https://admin.theroyalglow.in/api/billing/missing'),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toMatchObject({ code: ERROR_CODES.NOT_FOUND, statusCode: 404 })
    expect(dbMocks.listMembershipCorrections).not.toHaveBeenCalled()
  })

  it.each(['receptionist', 'developer'] as const)(
    'scopes session corrections to the invoice branch for the %s',
    async (role) => {
      mocks.requireBranchRole.mockResolvedValue(branchContext({ role }))
      dbMocks.getInvoiceById.mockResolvedValue({ id: 'inv1', invoiceType: 'membership_session' })
      const correction = { id: 'mc1', reason: 'Verified incorrect deduction' }
      dbMocks.listMembershipCorrections.mockResolvedValue([correction])
      dbMocks.getMembershipCorrectionTarget.mockResolvedValue({
        membershipId: 'mem1',
        bookingId: 'bk1',
      })

      const response = await billingIdRoute.GET(
        new Request('https://admin.theroyalglow.in/api/billing/inv1'),
        { params: Promise.resolve({ id: 'inv1' }) },
      )

      expect(response.status).toBe(200)
      const { data } = await response.json()
      expect(data.corrections).toEqual([correction])
      expect(dbMocks.listMembershipCorrections).toHaveBeenCalledExactlyOnceWith({
        invoiceId: 'inv1',
        branchId: TEST_BRANCH.id,
      })
      if (role === 'developer') {
        expect(dbMocks.getMembershipCorrectionTarget).toHaveBeenCalledExactlyOnceWith(
          'inv1',
          TEST_BRANCH.id,
        )
        expect(data.correctionTarget).toEqual({
          membershipId: 'mem1',
          bookingId: 'bk1',
          originalInvoiceId: 'inv1',
          branchId: TEST_BRANCH.id,
          branchName: TEST_BRANCH.name,
        })
      } else {
        expect(dbMocks.getMembershipCorrectionTarget).not.toHaveBeenCalled()
        expect(data.correctionTarget).toBeNull()
      }
    },
  )

  it('does not offer corrections for an ineligible session invoice', async () => {
    mocks.requireBranchRole.mockResolvedValue(branchContext({ role: 'developer' }))
    dbMocks.getInvoiceById.mockResolvedValue({ id: 'inv1', invoiceType: 'membership_session' })
    dbMocks.getMembershipCorrectionTarget.mockResolvedValue(null)
    dbMocks.listMembershipCorrections.mockResolvedValue([])

    const response = await billingIdRoute.GET(
      new Request('https://admin.theroyalglow.in/api/billing/inv1'),
      { params: Promise.resolve({ id: 'inv1' }) },
    )

    expect((await response.json()).data.correctionTarget).toBeNull()
  })

  it('→ 403 when role is insufficient', async () => {
    mocks.requireBranchRole.mockRejectedValue(forbidden())
    const res = await billingIdRoute.GET(
      new Request('https://admin.theroyalglow.in/api/billing/inv1'),
      { params: Promise.resolve({ id: 'inv1' }) },
    )
    expect(res.status).toBe(403)
    expect(dbMocks.getInvoiceById).not.toHaveBeenCalled()
  })
})
