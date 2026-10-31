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

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
  getInvoices: vi.fn(),
  getInvoiceById: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)

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
