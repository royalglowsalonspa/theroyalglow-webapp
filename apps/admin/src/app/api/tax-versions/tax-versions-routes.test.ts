// @vitest-environment node
/************************************************************
 * Module Name  : tax-versions-routes.test
 * Scope        : Unit tests — branch tax rates (multi-branch R6.4, TX-01, TX-10)
 *
 * Description  : GET|POST /api/tax-versions and PATCH /api/tax-versions/[id]:
 *                - only the Developer reads or changes them, at the active
 *                  branch (requireBranchRole('developer'));
 *                - GET lists the branch's rates with their state (in force,
 *                  scheduled, replaced), the issuer details and the
 *                  invoicing mode;
 *                - POST adds a rate from 00:00 IST on its date: a branch's
 *                  first rate for a code may start on any date, a change only
 *                  in the future, never on another rate's start; audited;
 *                - PATCH records the launch review once; another branch's
 *                  rate is not found; audited;
 *                - writes rendered for another branch get 409.
 *
 * Approach     : requireBranchRole, the db queries and audit are mocked;
 *                assertRenderedBranch, the business rules and the Zod schemas
 *                stay real. The clock is pinned to 25/10/2026 12:00 IST.
 ************************************************************/

import { ERROR_CODES, forbidden } from '@rgss/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({
  requireBranchRole: vi.fn(),
  audit: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  branchHasIssuedInvoices: vi.fn(),
  createTaxVersion: vi.fn(),
  getBranchByIdAdmin: vi.fn(),
  getBranchTaxVersions: vi.fn(),
  getInvoicingSetting: vi.fn(),
  getTaxVersionsForAdmin: vi.fn(),
  markTaxVersionReviewed: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@/lib/api/audit', () => ({ audit: mocks.audit }))
vi.mock('@rgss/db/queries', () => dbMocks)

import * as versionRoute from '@/app/api/tax-versions/[id]/route'
import * as versionsRoute from '@/app/api/tax-versions/route'

const BASE = 'https://admin.theroyalglow.in/api/tax-versions'
// 12:00 IST on 25/10/2026.
const NOW = new Date('2026-10-25T06:30:00.000Z')

type Version = {
  id: string
  branchId: string
  sacCode: string
  rateBps: number
  pricesIncludeTax: boolean
  effectiveFrom: Date
  reviewStatus: 'provisional' | 'reviewed'
  reason: string
  createdBy: string | null
  createdAt: Date
  reviewedBy: string | null
  reviewedAt: Date | null
}

function version(overrides: Partial<Version> = {}): Version {
  return {
    id: 'v_now',
    branchId: TEST_BRANCH.id,
    sacCode: '999721',
    rateBps: 500,
    pricesIncludeTax: true,
    effectiveFrom: new Date('2025-09-22T00:00:00+05:30'),
    reviewStatus: 'provisional',
    reason: 'Provisional development rate',
    createdBy: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
  }
}

const V_OLD = version({
  id: 'v_old',
  rateBps: 1800,
  effectiveFrom: new Date('2024-04-01T00:00:00+05:30'),
  reviewStatus: 'reviewed',
  reviewedBy: 'u_dev',
  reviewedAt: new Date('2024-03-30T10:00:00.000Z'),
})
const V_NOW = version()
const V_NEXT = version({
  id: 'v_next',
  rateBps: 1200,
  effectiveFrom: new Date('2026-11-01T00:00:00+05:30'),
})
const V_SPA = version({ id: 'v_spa', sacCode: '999723' })

function actAs(role: 'receptionist' | 'manager' | 'owner' | 'developer') {
  mocks.requireBranchRole.mockImplementation(async (minRole: string) => {
    if (minRole === 'developer' && role !== 'developer') {
      throw forbidden('Only the Developer manages tax rates.')
    }
    return branchContext({ userId: `u_${role}`, role })
  })
}

const post = (body: Record<string, unknown>) =>
  versionsRoute.POST(
    new Request(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const review = (id: string, body: Record<string, unknown>) =>
  versionRoute.PATCH(
    new Request(`${BASE}/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )

const CHANGE = {
  branchId: TEST_BRANCH.id,
  sacCode: '999721',
  rateBps: 1800,
  effectiveFrom: '2026-11-15',
  reason: 'GST Council revision for hair care',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  actAs('developer')
  dbMocks.getBranchByIdAdmin.mockResolvedValue({
    id: TEST_BRANCH.id,
    name: TEST_BRANCH.name,
    legalName: 'Royal Glow Salon and Spa LLP',
    gstin: '29ABCDE1234F1Z5',
    invoicePrefix: 'RS',
  })
  dbMocks.getInvoicingSetting.mockResolvedValue({ live: false })
  dbMocks.branchHasIssuedInvoices.mockResolvedValue(true)
  dbMocks.getBranchTaxVersions.mockResolvedValue([V_OLD, V_NOW, V_NEXT, V_SPA])
  dbMocks.createTaxVersion.mockImplementation(async (values: Record<string, unknown>) => ({
    id: 'v_created',
    pricesIncludeTax: true,
    reviewStatus: 'provisional',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: NOW,
    ...values,
  }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/tax-versions', () => {
  it('lists the active branch’s rates with their state, the issuer and the mode', async () => {
    dbMocks.getTaxVersionsForAdmin.mockResolvedValue([
      { version: V_NEXT, createdByName: 'Bose', reviewedByName: null, usedByInvoices: false },
      { version: V_NOW, createdByName: null, reviewedByName: null, usedByInvoices: true },
      { version: V_OLD, createdByName: null, reviewedByName: 'Bose', usedByInvoices: true },
      { version: V_SPA, createdByName: null, reviewedByName: null, usedByInvoices: false },
    ])

    const res = await versionsRoute.GET(new Request(BASE))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('developer')
    expect(dbMocks.getTaxVersionsForAdmin).toHaveBeenCalledWith(TEST_BRANCH.id)
    expect(dbMocks.branchHasIssuedInvoices).toHaveBeenCalledWith(TEST_BRANCH.id)
    expect(body.data).toMatchObject({
      branchId: TEST_BRANCH.id,
      branchName: TEST_BRANCH.name,
      issuer: {
        legalName: 'Royal Glow Salon and Spa LLP',
        gstin: '29ABCDE1234F1Z5',
        invoicePrefix: 'RS',
        prefixFixed: true,
      },
      invoicingLive: false,
    })
    const states = Object.fromEntries(
      (body.data.versions as { id: string; state: string }[]).map((v) => [v.id, v.state]),
    )
    expect(states).toEqual({
      v_next: 'scheduled',
      v_now: 'in_force',
      v_old: 'replaced',
      v_spa: 'in_force',
    })
    expect(body.data.versions[2]).toEqual({
      id: 'v_old',
      branchId: TEST_BRANCH.id,
      sacCode: '999721',
      rateBps: 1800,
      effectiveFrom: '2024-03-31T18:30:00.000Z',
      reviewStatus: 'reviewed',
      reason: 'Provisional development rate',
      createdByName: null,
      reviewedByName: 'Bose',
      reviewedAt: '2024-03-30T10:00:00.000Z',
      state: 'replaced',
      usedByInvoices: true,
    })
  })

  it.each(['receptionist', 'manager', 'owner'] as const)(
    'answers 403 to a %s and reads nothing',
    async (role) => {
      actAs(role)

      const res = await versionsRoute.GET(new Request(BASE))

      expect(res.status).toBe(403)
      expect(dbMocks.getTaxVersionsForAdmin).not.toHaveBeenCalled()
    },
  )
})

describe('POST /api/tax-versions', () => {
  it('adds a change of rate from 00:00 IST on a future date, audited', async () => {
    const res = await post(CHANGE)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('developer')
    expect(dbMocks.getBranchTaxVersions).toHaveBeenCalledWith(TEST_BRANCH.id)
    expect(dbMocks.createTaxVersion).toHaveBeenCalledWith({
      branchId: TEST_BRANCH.id,
      sacCode: '999721',
      rateBps: 1800,
      // 15/11/2026 00:00 IST.
      effectiveFrom: new Date('2026-11-14T18:30:00.000Z'),
      reason: 'GST Council revision for hair care',
      createdBy: 'u_developer',
    })
    expect(body.data.version).toMatchObject({ id: 'v_created', reviewStatus: 'provisional' })
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      expect.objectContaining({
        action: 'create',
        entityType: 'branch_tax_version',
        entityId: 'v_created',
        branchId: TEST_BRANCH.id,
      }),
    )
  })

  it('lets a branch’s first rate for a code start on any date, even a past one', async () => {
    const res = await post({
      ...CHANGE,
      sacCode: '999729',
      rateBps: 500,
      effectiveFrom: '2025-09-22',
    })

    expect(res.status).toBe(201)
    expect(dbMocks.createTaxVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        sacCode: '999729',
        effectiveFrom: new Date('2025-09-21T18:30:00.000Z'),
      }),
    )
  })

  it.each([
    ['today', '2026-10-25'],
    ['yesterday', '2026-10-24'],
  ])('refuses a change of rate starting %s (400)', async (_label, effectiveFrom) => {
    const res = await post({ ...CHANGE, effectiveFrom })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(body.error.details).toEqual({ effectiveFrom: ['Choose tomorrow or later'] })
    expect(dbMocks.createTaxVersion).not.toHaveBeenCalled()
  })

  it('refuses a second rate on another rate’s start (409)', async () => {
    const res = await post({ ...CHANGE, effectiveFrom: '2026-11-01' })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.CONFLICT)
    expect(dbMocks.createTaxVersion).not.toHaveBeenCalled()
  })

  it.each([
    ['an unreviewed SAC code', { sacCode: '999999' }],
    ['a rate above 28%', { rateBps: 2801 }],
    ['a negative rate', { rateBps: -1 }],
    ['part of a basis point', { rateBps: 500.5 }],
    ['no reason', { reason: '  ' }],
    ['a date that does not exist', { effectiveFrom: '2026-02-30' }],
  ])('refuses %s (400)', async (_label, change) => {
    const res = await post({ ...CHANGE, ...change })

    expect(res.status).toBe(400)
    expect(dbMocks.createTaxVersion).not.toHaveBeenCalled()
  })

  it('refuses a rate rendered for another branch (409)', async () => {
    const res = await post({ ...CHANGE, branchId: OTHER_BRANCH.id })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.createTaxVersion).not.toHaveBeenCalled()
  })

  it('answers 403 to anyone but the Developer, writing nothing', async () => {
    actAs('owner')

    const res = await post(CHANGE)

    expect(res.status).toBe(403)
    expect(dbMocks.createTaxVersion).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/tax-versions/[id]', () => {
  it('records the launch review, audited (TX-10)', async () => {
    dbMocks.markTaxVersionReviewed.mockResolvedValue({
      ...V_NOW,
      reviewStatus: 'reviewed',
      reviewedBy: 'u_developer',
      reviewedAt: NOW,
    })

    const res = await review('v_now', { branchId: TEST_BRANCH.id, reviewed: true })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(dbMocks.markTaxVersionReviewed).toHaveBeenCalledWith(
      'v_now',
      TEST_BRANCH.id,
      'u_developer',
    )
    expect(body.data.version).toMatchObject({ id: 'v_now', reviewStatus: 'reviewed' })
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      expect.objectContaining({
        action: 'update',
        entityType: 'branch_tax_version',
        entityId: 'v_now',
        branchId: TEST_BRANCH.id,
        newValues: { reviewStatus: 'reviewed' },
      }),
    )
  })

  it('treats another branch’s rate as not found (404)', async () => {
    dbMocks.markTaxVersionReviewed.mockResolvedValue(null)

    const res = await review('v_elsewhere', { branchId: TEST_BRANCH.id, reviewed: true })

    expect(res.status).toBe(404)
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('refuses to review a rate twice (409)', async () => {
    dbMocks.markTaxVersionReviewed.mockResolvedValue(null)

    const res = await review('v_old', { branchId: TEST_BRANCH.id, reviewed: true })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.CONFLICT)
    expect(body.error.message).toBe('This rate is already reviewed.')
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('refuses anything but a review, or a review rendered for another branch', async () => {
    expect((await review('v_now', { branchId: TEST_BRANCH.id, rateBps: 1800 })).status).toBe(400)
    expect((await review('v_now', { branchId: TEST_BRANCH.id, reviewed: false })).status).toBe(400)
    const elsewhere = await review('v_now', { branchId: OTHER_BRANCH.id, reviewed: true })
    expect(elsewhere.status).toBe(409)
    expect((await elsewhere.json()).error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.markTaxVersionReviewed).not.toHaveBeenCalled()
  })

  it('answers 403 to anyone but the Developer', async () => {
    actAs('manager')

    const res = await review('v_now', { branchId: TEST_BRANCH.id, reviewed: true })

    expect(res.status).toBe(403)
    expect(dbMocks.markTaxVersionReviewed).not.toHaveBeenCalled()
  })
})
