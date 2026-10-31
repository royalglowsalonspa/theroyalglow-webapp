// @vitest-environment node
/************************************************************
 * Module Name  : membership-routes.test
 * Scope        : Unit tests for the admin membership list, detail, sale and
 *                cancel routes across branches
 *
 * Description  : Memberships are shared by every branch; their sale is not
 *                (route inventory gap 5). Verifies that
 *                  - the list and the detail show the price paid and the
 *                    tier's usual values only to people who can access the
 *                    selling branch, and name the selling branch to everyone;
 *                  - the detail shows another branch's sessions without their
 *                    booking number or staff;
 *                  - a sale belongs to the rendered, active, operational branch
 *                    and snapshots the tier's usual hours and price;
 *                  - only the selling branch's Manager, Owner or the Developer
 *                    cancels, from that branch, once, with an audit entry.
 *
 * Approach     : requireBranchRole and the DB are mocked; assertRenderedBranch
 *                and the business rules stay real.
 ************************************************************/

import { type BranchRole, resolveBranchAccess } from '@rgss/business'
import { ERROR_CODES } from '@rgss/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BranchContext } from '@/lib/api/branch-context'
import { OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({ requireBranchRole: vi.fn(), enqueueJob: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
  getMemberships: vi.fn(),
  getMembershipById: vi.fn(),
  getMembershipSessions: vi.fn(),
  getActiveMembershipForCustomer: vi.fn(),
  getMembershipTierById: vi.fn(),
  getBranchByIdAdmin: vi.fn(),
  getBranchTaxVersions: vi.fn(),
  getInvoicingSetting: vi.fn(),
  createMembershipWithInvoice: vi.fn(),
  cancelMembership: vi.fn(),
  recordAudit: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: mocks.enqueueJob }))
vi.mock('@rgss/db/queries', () => dbMocks)

import * as cancelRoute from '@/app/api/memberships/[id]/cancel/route'
import * as detailRoute from '@/app/api/memberships/[id]/route'
import * as listRoute from '@/app/api/memberships/route'

/**
 * The context a person gets when working at `active`, built with the real
 * access rules from the branches they own, manage or work at.
 */
function contextFor(
  role: BranchRole,
  branches: readonly (typeof TEST_BRANCH)[],
  active: typeof TEST_BRANCH = TEST_BRANCH,
): BranchContext {
  const userId = 'u_admin'
  const rows = [TEST_BRANCH, OTHER_BRANCH].map((b, index) => ({
    ...b,
    displayOrder: index,
    ownerUserId: role === 'owner' && branches.includes(b) ? userId : 'someone_else',
    managerUserId: role === 'manager' && branches.includes(b) ? userId : null,
  }))
  const staffBranch = branches[0]
  const access = resolveBranchAccess({
    user: { id: userId, role },
    branches: rows,
    profile:
      (role === 'receptionist' || role === 'staff') && staffBranch
        ? { branchId: staffBranch.id, roleWitness: role, isActive: true }
        : null,
  })
  const branch = access.branches.find((b) => b.id === active.id)
  if (!branch) {
    throw new Error(`no access to ${active.id}`)
  }
  return { session: { user: { id: userId, role } }, access, branch } as unknown as BranchContext
}

const SOLD_AT_RS = {
  id: 'mem_1',
  membershipNumber: 'RG-MEM-26-1-12345',
  customerId: 'cust_1',
  tierId: 'tier_gold',
  tierNameSnapshot: 'Gold',
  tierUsualHoursMinutes: 900,
  tierUsualPricePaise: 1_500_000,
  totalHoursMinutes: 960,
  usedHoursMinutes: 60,
  pricePaidPaise: 1_400_000,
  invoiceId: 'inv_purchase',
  startsAt: new Date('2026-10-01T00:00:00.000Z'),
  expiresAt: new Date('2026-12-30T00:00:00.000Z'),
  status: 'active',
  sellingBranchId: TEST_BRANCH.id,
  sellingBranch: { id: TEST_BRANCH.id, name: TEST_BRANCH.name },
  customerName: 'Asha',
  customerEmail: 'asha@example.com',
  tierName: 'Gold',
}

const SESSION_AT = (branch: typeof TEST_BRANCH, id: string) => ({
  id,
  bookingNumber: `BK-${branch.code}-2610-S-0000${id.slice(-1)}-M`,
  branchId: branch.id,
  branchName: branch.name,
  bookingDate: new Date('2026-10-20T00:00:00.000Z'),
  startTime: '11:00:00',
  endTime: '12:00:00',
  totalDurationMinutes: 60,
  status: 'completed',
  services: [
    {
      bookingId: id,
      serviceId: 'svc_aroma',
      serviceNameSnapshot: 'Aroma therapy',
      durationMinutes: 60,
      staffId: 'stf_1',
      staffName: 'Anita',
      displayOrder: 0,
    },
  ],
})

const params = { params: Promise.resolve({ id: 'mem_1' }) }

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireBranchRole.mockResolvedValue(contextFor('receptionist', [TEST_BRANCH]))
  dbMocks.getMembershipById.mockResolvedValue(SOLD_AT_RS)
  dbMocks.getMembershipSessions.mockResolvedValue([])
})

describe('GET /api/memberships — who sees what a membership was sold for', () => {
  beforeEach(() => {
    dbMocks.getMemberships.mockResolvedValue([SOLD_AT_RS])
  })

  it('shows the sale at the selling branch', async () => {
    const res = await listRoute.GET(new Request('https://admin.theroyalglow.in/api/memberships'))
    const { data } = await res.json()

    expect(data.branchId).toBe(TEST_BRANCH.id)
    expect(data.memberships[0].sale).toEqual({
      pricePaidPaise: 1_400_000,
      tierUsualHoursMinutes: 900,
      tierUsualPricePaise: 1_500_000,
      invoiceId: 'inv_purchase',
    })
  })

  it('hides it from another branch, which still sees hours, expiry and the selling branch', async () => {
    mocks.requireBranchRole.mockResolvedValue(contextFor('owner', [OTHER_BRANCH], OTHER_BRANCH))

    const res = await listRoute.GET(new Request('https://admin.theroyalglow.in/api/memberships'))
    const text = await res.text()
    const [row] = JSON.parse(text).data.memberships

    expect(row.sale).toBeNull()
    expect(row).toMatchObject({
      totalHoursMinutes: 960,
      usedHoursMinutes: 60,
      sellingBranch: { id: TEST_BRANCH.id, name: TEST_BRANCH.name },
    })
    expect(text).not.toContain('1400000')
    expect(text).not.toContain('inv_purchase')
  })

  it('shows it to an Owner of both branches while working at the other one', async () => {
    mocks.requireBranchRole.mockResolvedValue(
      contextFor('owner', [TEST_BRANCH, OTHER_BRANCH], OTHER_BRANCH),
    )

    const res = await listRoute.GET(new Request('https://admin.theroyalglow.in/api/memberships'))
    const { data } = await res.json()

    expect(data.memberships[0].sale?.pricePaidPaise).toBe(1_400_000)
  })
})

describe('GET /api/memberships/[id] — sessions and cancelling across branches', () => {
  it('names another branch’s sessions without their booking number or staff', async () => {
    dbMocks.getMembershipSessions.mockResolvedValue([
      SESSION_AT(OTHER_BRANCH, 'bk_2'),
      SESSION_AT(TEST_BRANCH, 'bk_1'),
    ])

    const res = await detailRoute.GET(
      new Request('https://admin.theroyalglow.in/api/memberships/mem_1'),
      params,
    )
    const { data } = await res.json()

    expect(data.sessions[0]).toEqual({
      scope: 'other_branch',
      branchName: OTHER_BRANCH.name,
      bookingDate: '2026-10-20',
      startTime: '11:00:00',
      endTime: '12:00:00',
      totalDurationMinutes: 60,
      // Whether its minutes are held or used, which every branch shares.
      status: 'completed',
      services: [{ serviceNameSnapshot: 'Aroma therapy', durationMinutes: 60 }],
    })
    expect(data.sessions[1]).toMatchObject({
      scope: 'this_branch',
      id: 'bk_1',
      status: 'completed',
      services: [{ staffName: 'Anita' }],
    })
  })

  it('shows the minutes held by sessions booked or in progress with the sale', async () => {
    dbMocks.getMembershipById.mockResolvedValue({ ...SOLD_AT_RS, reservedMinutes: 90 })
    dbMocks.getMembershipSessions.mockResolvedValue([
      { ...SESSION_AT(TEST_BRANCH, 'bk_3'), status: 'in_progress' },
    ])

    const res = await detailRoute.GET(
      new Request('https://admin.theroyalglow.in/api/memberships/mem_1'),
      params,
    )
    const { data } = await res.json()

    expect(data).toMatchObject({ usedHoursMinutes: 60, reservedMinutes: 90 })
    expect(data.sessions[0]).toMatchObject({ scope: 'this_branch', status: 'in_progress' })
  })

  it('offers cancelling only to the selling branch’s Manager, Owner or the Developer', async () => {
    const detail = async () =>
      (
        await (
          await detailRoute.GET(
            new Request('https://admin.theroyalglow.in/api/memberships/mem_1'),
            params,
          )
        ).json()
      ).data

    expect(await detail()).toMatchObject({ canCancel: false })

    mocks.requireBranchRole.mockResolvedValue(contextFor('manager', [TEST_BRANCH]))
    expect(await detail()).toMatchObject({ canCancel: true, cancelRefusal: null })

    mocks.requireBranchRole.mockResolvedValue(
      contextFor('owner', [TEST_BRANCH, OTHER_BRANCH], OTHER_BRANCH),
    )
    const elsewhere = await detail()
    expect(elsewhere.canCancel).toBe(false)
    expect(elsewhere.cancelRefusal).toContain('Switch to Rayasandra')
  })
})

describe('POST /api/memberships — sold at the active branch', () => {
  // 30/10/2026 11:30 IST.
  const NOW = new Date('2026-10-30T06:00:00.000Z')
  const GOLD = {
    id: 'tier_gold',
    name: 'Gold',
    defaultHoursMinutes: 900,
    defaultPricePaise: 1_500_000,
    defaultValidityDays: 90,
    sacCode: '999723',
    isActive: true,
  }
  // A negotiated deal: 16 hours for ₹14,000 against Gold's usual 15 hours for ₹15,000.
  const SALE = {
    branchId: TEST_BRANCH.id,
    customerId: 'cust_1',
    tierId: 'tier_gold',
    hours: 16,
    pricePaise: 1_400_000,
    startDate: '2026-10-30',
    expiresOn: '2027-01-27',
    paymentMethod: 'upi',
  }

  // The selling branch's provisional 5% for SPA services, in force since 0018.
  const SPA_RATE = {
    id: `tax_${TEST_BRANCH.id}_999723`,
    branchId: TEST_BRANCH.id,
    sacCode: '999723',
    rateBps: 500,
    pricesIncludeTax: true,
    effectiveFrom: new Date('2025-09-22T00:00:00+05:30'),
    reviewStatus: 'provisional',
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    dbMocks.getActiveMembershipForCustomer.mockResolvedValue(null)
    dbMocks.getMembershipTierById.mockResolvedValue(GOLD)
    dbMocks.getBranchByIdAdmin.mockResolvedValue({
      id: TEST_BRANCH.id,
      name: TEST_BRANCH.name,
      number: 1,
      status: 'operational',
      legalName: null,
      gstin: null,
    })
    dbMocks.getBranchTaxVersions.mockResolvedValue([SPA_RATE])
    dbMocks.getInvoicingSetting.mockResolvedValue({ live: false })
    dbMocks.createMembershipWithInvoice.mockResolvedValue({
      membership: { id: 'mem_new' },
      invoice: { id: 'inv_new' },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const sell = (body: Record<string, unknown>) =>
    listRoute.POST(jsonRequest('https://admin.theroyalglow.in/api/memberships', body))

  it('stores the agreed hours and price with the tier snapshot, invoiced by the active branch (MS-14)', async () => {
    const res = await sell(SALE)

    expect(res.status).toBe(201)
    expect(dbMocks.getBranchByIdAdmin).toHaveBeenCalledWith(TEST_BRANCH.id)
    expect(dbMocks.getMembershipTierById).toHaveBeenCalledWith('tier_gold')
    expect(dbMocks.createMembershipWithInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: TEST_BRANCH.id,
        tierId: 'tier_gold',
        tierNameSnapshot: 'Gold',
        tierUsualHoursMinutes: 900,
        tierUsualPricePaise: 1_500_000,
        totalHoursMinutes: 960,
        pricePaidPaise: 1_400_000,
        createdBy: 'u_admin',
        invoice: expect.objectContaining({
          paymentMethod: 'upi',
          subtotalPaise: 1_400_000,
          discountAmountPaise: 0,
          totalAmountPaise: 1_400_000,
        }),
      }),
    )
  })

  it('taxes the agreed price at the selling branch’s rate for the tier’s SAC code (TX-11)', async () => {
    const res = await sell(SALE)

    expect(res.status).toBe(201)
    expect(dbMocks.getBranchTaxVersions).toHaveBeenCalledWith(TEST_BRANCH.id)
    const params = dbMocks.createMembershipWithInvoice.mock.calls[0]?.[0]
    // ₹14,000 at 5%: taxable round(14,00,000 × 10,000 / 10,500) = 13,33,333.
    expect(params.invoiceLine).toMatchObject({
      quantity: 1,
      unitPricePaise: 1_400_000,
      totalPricePaise: 1_400_000,
      sacCode: '999723',
      taxVersionId: SPA_RATE.id,
      rateBps: 500,
      discountPaise: 0,
      taxableValuePaise: 1_333_333,
      taxPaise: 66_667,
      cgstPaise: 33_333,
      sgstPaise: 33_334,
    })
    expect(params.invoice).toMatchObject({
      taxableValuePaise: 1_333_333,
      gstAmountPaise: 66_667,
      cgstPaise: 33_333,
      sgstPaise: 33_334,
      financialYear: '2627',
      taxReviewStatus: 'provisional',
    })
    // The tax point is the moment of sale.
    expect(params.invoice.taxPointAt.toISOString()).toBe(NOW.toISOString())
  })

  it('refuses a sale the branch has no rate in force for, without writing (409)', async () => {
    dbMocks.getBranchTaxVersions.mockResolvedValue([
      { ...SPA_RATE, effectiveFrom: new Date('2026-11-01T00:00:00+05:30') },
    ])

    const res = await sell(SALE)

    expect(res.status).toBe(409)
    const { error } = await res.json()
    expect(error.code).toBe(ERROR_CODES.TAX_CONFIGURATION_INCOMPLETE)
    expect(error.message).toMatch(/^Rayasandra has no tax rate in force for SAC 999723\./)
    expect(dbMocks.createMembershipWithInvoice).not.toHaveBeenCalled()
  })

  it('in live invoicing, refuses a branch without its legal name and GSTIN (TX-08)', async () => {
    dbMocks.getInvoicingSetting.mockResolvedValue({ live: true })
    dbMocks.getBranchTaxVersions.mockResolvedValue([{ ...SPA_RATE, reviewStatus: 'reviewed' }])

    const res = await sell(SALE)

    expect(res.status).toBe(409)
    const { error } = await res.json()
    expect(error.code).toBe(ERROR_CODES.TAX_CONFIGURATION_INCOMPLETE)
    expect(error.message).toBe(
      "Rayasandra can't issue invoices yet: it needs its legal name, its GSTIN.",
    )
    expect(dbMocks.createMembershipWithInvoice).not.toHaveBeenCalled()
  })

  it('runs from 00:00 IST on the start date to 23:59:59.999 IST on the expiry date (MS-16)', async () => {
    await sell(SALE)

    const params = dbMocks.createMembershipWithInvoice.mock.calls[0]?.[0]
    expect(params.startsAt.toISOString()).toBe('2026-10-29T18:30:00.000Z')
    expect(params.expiresAt.toISOString()).toBe('2027-01-27T18:29:59.999Z')
    expect(params.membershipNumber).toMatch(/^RG-MEM-26-1-\d{5}$/)
    // The expired notice runs an hour after the expiry instant.
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      '/api/jobs/membership-expired-notice',
      { membershipId: 'mem_new' },
      Math.floor((params.expiresAt.getTime() + 3_600_000 - NOW.getTime()) / 1000),
    )
  })

  it('names the hours and expiry on the invoice line, never the tier (R9.1)', async () => {
    await sell(SALE)

    const params = dbMocks.createMembershipWithInvoice.mock.calls[0]?.[0]
    expect(params.invoiceLine.serviceNameSnapshot).toBe(
      'SPA membership: 16 hours, valid until 27/01/2027',
    )
    expect(params.invoiceLine.serviceNameSnapshot).not.toContain('Gold')
  })

  it('starts today in IST when no start date is sent', async () => {
    // 31/10/2026 01:30 IST, still 30/10 in UTC.
    vi.setSystemTime(new Date('2026-10-30T20:00:00.000Z'))
    const { startDate: _omitted, ...withoutStart } = SALE

    const res = await sell(withoutStart)

    expect(res.status).toBe(201)
    const params = dbMocks.createMembershipWithInvoice.mock.calls[0]?.[0]
    expect(params.startsAt.toISOString()).toBe('2026-10-30T18:30:00.000Z')
  })

  it.each([
    ['part of an hour', { hours: 15.5 }],
    ['no hours', { hours: 0 }],
    ['no price', { pricePaise: 0 }],
    ['the old minutes field', { hours: undefined, hoursMinutes: 960 }],
  ])('refuses a sale with %s, without writing (MS-15)', async (_label, change) => {
    const res = await sell({ ...SALE, ...change })

    expect(res.status).toBe(400)
    expect(dbMocks.createMembershipWithInvoice).not.toHaveBeenCalled()
  })

  it.each([
    ['an expiry on the start date', { expiresOn: '2026-10-30' }],
    ['an expiry before the start date', { expiresOn: '2026-10-01' }],
    ['a start in the past', { startDate: '2026-10-29' }],
    ['a start too far ahead', { startDate: '2027-01-01', expiresOn: '2027-03-01' }],
    ['a date that does not exist', { expiresOn: '2027-02-30' }],
  ])('refuses %s (MS-16)', async (_label, change) => {
    const res = await sell({ ...SALE, ...change })

    expect(res.status).toBe(400)
    expect(dbMocks.createMembershipWithInvoice).not.toHaveBeenCalled()
  })

  it('refuses a retired or unknown tier', async () => {
    dbMocks.getMembershipTierById.mockResolvedValue({ ...GOLD, isActive: false })
    expect((await sell(SALE)).status).toBe(400)

    dbMocks.getMembershipTierById.mockResolvedValue(null)
    expect((await sell(SALE)).status).toBe(400)

    expect(dbMocks.createMembershipWithInvoice).not.toHaveBeenCalled()
  })

  it('refuses a customer who already has an active membership', async () => {
    dbMocks.getActiveMembershipForCustomer.mockResolvedValue({ id: 'mem_old' })

    const res = await sell(SALE)

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe(ERROR_CODES.MEMBERSHIP_ALREADY_ACTIVE)
    expect(dbMocks.createMembershipWithInvoice).not.toHaveBeenCalled()
  })

  it('refuses a sale rendered for another branch, without writing', async () => {
    const res = await sell({ ...SALE, branchId: OTHER_BRANCH.id })

    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.createMembershipWithInvoice).not.toHaveBeenCalled()
  })

  it('refuses a sale at a branch that is not operational', async () => {
    dbMocks.getBranchByIdAdmin.mockResolvedValue({
      id: TEST_BRANCH.id,
      name: TEST_BRANCH.name,
      number: 1,
      status: 'opens_soon',
    })

    const res = await sell(SALE)

    expect(res.status).toBe(400)
    expect(dbMocks.createMembershipWithInvoice).not.toHaveBeenCalled()
  })
})

describe('POST /api/memberships/[id]/cancel — the selling branch only', () => {
  const cancel = (body: Record<string, unknown>) =>
    cancelRoute.POST(
      jsonRequest('https://admin.theroyalglow.in/api/memberships/mem_1/cancel', body),
      params,
    )

  beforeEach(() => {
    dbMocks.cancelMembership.mockResolvedValue({
      ok: true,
      membership: { id: 'mem_1', status: 'cancelled' },
      cancelledSessions: 0,
    })
  })

  it('lets the selling branch’s Manager cancel, once, with an audit entry', async () => {
    mocks.requireBranchRole.mockResolvedValue(contextFor('manager', [TEST_BRANCH]))

    const res = await cancel({ branchId: TEST_BRANCH.id, reason: 'Moved abroad' })

    expect(res.status).toBe(200)
    expect(dbMocks.cancelMembership).toHaveBeenCalledWith({
      id: 'mem_1',
      sellingBranchId: TEST_BRANCH.id,
      reason: 'Moved abroad',
      // The status logs of the sessions cancelled with it name this person.
      actorId: 'u_admin',
    })
    expect((await res.json()).data).toEqual({
      id: 'mem_1',
      status: 'cancelled',
      cancelledSessions: 0,
    })
    expect(dbMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'status_change',
        entityType: 'spa_membership',
        entityId: 'mem_1',
        branchId: TEST_BRANCH.id,
      }),
    )
  })

  it('cancels the sessions still to happen with it and says how many (MS-13)', async () => {
    mocks.requireBranchRole.mockResolvedValue(contextFor('manager', [TEST_BRANCH]))
    dbMocks.cancelMembership.mockResolvedValue({
      ok: true,
      membership: { id: 'mem_1', status: 'cancelled' },
      cancelledSessions: 2,
    })

    const res = await cancel({ branchId: TEST_BRANCH.id, reason: 'Moved abroad' })

    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ cancelledSessions: 2 })
    expect(dbMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: { status: 'cancelled', reason: 'Moved abroad', cancelledSessions: 2 },
      }),
    )
  })

  it('refuses while a session is in progress, saying what to do first (MS-13)', async () => {
    mocks.requireBranchRole.mockResolvedValue(contextFor('manager', [TEST_BRANCH]))
    dbMocks.cancelMembership.mockResolvedValue({ ok: false, reason: 'session_in_progress' })

    const res = await cancel({ branchId: TEST_BRANCH.id, reason: 'x' })

    expect(res.status).toBe(409)
    expect((await res.json()).error.message).toBe(
      'A session on this membership is in progress. Complete it, then cancel the membership.',
    )
    expect(dbMocks.recordAudit).not.toHaveBeenCalled()
  })

  it('refuses the selling branch’s Receptionist', async () => {
    const res = await cancel({ branchId: TEST_BRANCH.id, reason: 'x' })

    expect(res.status).toBe(403)
    expect(dbMocks.cancelMembership).not.toHaveBeenCalled()
  })

  it('refuses another branch’s Owner, saying which branch can', async () => {
    mocks.requireBranchRole.mockResolvedValue(contextFor('owner', [OTHER_BRANCH], OTHER_BRANCH))

    const res = await cancel({ branchId: OTHER_BRANCH.id, reason: 'x' })
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error.message).toBe(
      'This membership was sold at Rayasandra. Only Rayasandra can cancel it.',
    )
    expect(dbMocks.cancelMembership).not.toHaveBeenCalled()
  })

  it('refuses a stale tab before reading anything', async () => {
    mocks.requireBranchRole.mockResolvedValue(contextFor('manager', [TEST_BRANCH]))

    const res = await cancel({ branchId: OTHER_BRANCH.id, reason: 'x' })

    expect(res.status).toBe(409)
    expect(dbMocks.getMembershipById).not.toHaveBeenCalled()
  })

  it('answers 409 when the membership stopped being active meanwhile', async () => {
    mocks.requireBranchRole.mockResolvedValue(contextFor('manager', [TEST_BRANCH]))
    dbMocks.cancelMembership.mockResolvedValue({ ok: false, reason: 'not_active' })

    const res = await cancel({ branchId: TEST_BRANCH.id, reason: 'x' })

    expect(res.status).toBe(409)
    expect((await res.json()).error.message).toBe(
      'This membership is no longer active. Refresh to see its current state.',
    )
    expect(dbMocks.recordAudit).not.toHaveBeenCalled()
  })
})
