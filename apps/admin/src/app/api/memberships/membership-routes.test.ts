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
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BranchContext } from '@/lib/api/branch-context'
import { OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({ requireBranchRole: vi.fn(), enqueueJob: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
  getMemberships: vi.fn(),
  getMembershipById: vi.fn(),
  getMembershipSessions: vi.fn(),
  getActiveMembershipForCustomer: vi.fn(),
  getMembershipTiers: vi.fn(),
  getBranchByIdAdmin: vi.fn(),
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
      services: [{ serviceNameSnapshot: 'Aroma therapy', durationMinutes: 60 }],
    })
    expect(data.sessions[1]).toMatchObject({
      scope: 'this_branch',
      id: 'bk_1',
      services: [{ staffName: 'Anita' }],
    })
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
  const SALE = {
    branchId: TEST_BRANCH.id,
    customerId: 'cust_1',
    tierId: 'tier_gold',
    hoursMinutes: 960,
    pricePaise: 1_400_000,
    startDate: '2026-10-30',
    validityDays: 90,
    paymentMethod: 'upi',
  }

  beforeEach(() => {
    dbMocks.getActiveMembershipForCustomer.mockResolvedValue(null)
    dbMocks.getMembershipTiers.mockResolvedValue([
      {
        id: 'tier_gold',
        name: 'Gold',
        defaultHoursMinutes: 900,
        defaultPricePaise: 1_500_000,
        defaultValidityDays: 90,
      },
    ])
    dbMocks.getBranchByIdAdmin.mockResolvedValue({
      id: TEST_BRANCH.id,
      name: TEST_BRANCH.name,
      number: 1,
      status: 'operational',
    })
    dbMocks.createMembershipWithInvoice.mockResolvedValue({
      membership: { id: 'mem_new' },
      invoice: { id: 'inv_new' },
    })
  })

  const sell = (body: Record<string, unknown>) =>
    listRoute.POST(jsonRequest('https://admin.theroyalglow.in/api/memberships', body))

  it('sells at the active branch, which issues the invoice, with the tier snapshot', async () => {
    const res = await sell(SALE)

    expect(res.status).toBe(201)
    expect(dbMocks.getBranchByIdAdmin).toHaveBeenCalledWith(TEST_BRANCH.id)
    expect(dbMocks.createMembershipWithInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: TEST_BRANCH.id,
        tierNameSnapshot: 'Gold',
        tierUsualHoursMinutes: 900,
        tierUsualPricePaise: 1_500_000,
        totalHoursMinutes: 960,
        pricePaidPaise: 1_400_000,
        createdBy: 'u_admin',
      }),
    )
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
    dbMocks.cancelMembership.mockResolvedValue({ id: 'mem_1', status: 'cancelled' })
  })

  it('lets the selling branch’s Manager cancel, once, with an audit entry', async () => {
    mocks.requireBranchRole.mockResolvedValue(contextFor('manager', [TEST_BRANCH]))

    const res = await cancel({ branchId: TEST_BRANCH.id, reason: 'Moved abroad' })

    expect(res.status).toBe(200)
    expect(dbMocks.cancelMembership).toHaveBeenCalledWith('mem_1', TEST_BRANCH.id, 'Moved abroad')
    expect(dbMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'status_change',
        entityType: 'spa_membership',
        entityId: 'mem_1',
        branchId: TEST_BRANCH.id,
      }),
    )
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
    dbMocks.cancelMembership.mockResolvedValue(null)

    const res = await cancel({ branchId: TEST_BRANCH.id, reason: 'x' })

    expect(res.status).toBe(409)
    expect(dbMocks.recordAudit).not.toHaveBeenCalled()
  })
})
