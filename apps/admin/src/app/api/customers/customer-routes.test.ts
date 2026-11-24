// @vitest-environment node
/************************************************************
 * Module Name  : customer-routes.test
 * Scope        : Unit tests for the admin customer profile and notes routes
 *
 * Description  : Customers are shared by every Royal Glow branch; money is not
 *                (multi-branch R3). Verifies that
 *                  - GET /api/customers/[id] returns the active branch's money,
 *                    bookings and invoices, other branches' visits without
 *                    amounts, no customer-wide spending counter and no
 *                    membership price;
 *                  - PATCH /api/customers/[id] needs a Manager at the active
 *                    branch, refuses a stale branch and audits the change
 *                    with the branch;
 *                  - POST /api/customers/[id]/notes records the branch and the
 *                    writer's explicit visibility, and links only the
 *                    customer's bookings at the active branch.
 *
 * Approach     : requireBranchRole and the DB are mocked; assertRenderedBranch,
 *                the shared projection and the business helpers stay real.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import type { CustomerHistoryEntry } from '@rgss/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
  getCustomerProfile: vi.fn(),
  getCustomerBranchSpend: vi.fn(),
  getCustomerHistory: vi.fn(),
  getCustomerInvoices: vi.fn(),
  getCustomerMembership: vi.fn(),
  getCustomerNotes: vi.fn(),
  updateCustomerProfile: vi.fn(),
  addCustomerNote: vi.fn(),
  isCustomerBookingAtBranch: vi.fn(),
  recordAudit: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)

import * as notesRoute from '@/app/api/customers/[id]/notes/route'
import * as customerRoute from '@/app/api/customers/[id]/route'

const CUSTOMER_ID = 'cust_1'
const params = { params: Promise.resolve({ id: CUSTOMER_ID }) }

const PROFILE = {
  id: CUSTOMER_ID,
  name: 'Asha',
  email: 'asha@example.com',
  role: 'customer',
  image: null,
  phone: '9876543210',
  gender: 'female',
  dateOfBirth: new Date('1995-04-01T00:00:00.000Z'),
  totalVisits: 5,
  noshowCount: 1,
  lateCancellationCount: 0,
  bookingRequiresApproval: false,
  firstVisitAt: new Date('2026-01-10T05:00:00.000Z'),
  lastVisitAt: new Date('2026-10-20T05:00:00.000Z'),
  gemsBalance: 42,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  tags: [{ slug: 'vip', name: 'VIP', color: null }],
}

const OWN_BOOKING: CustomerHistoryEntry = {
  scope: 'this_branch',
  bookingId: 'bk_rs',
  bookingNumber: 'BK-RS-2610-H-11111',
  bookingDate: '2026-10-20',
  startTime: '10:00:00',
  serviceType: 'salon',
  status: 'completed',
  isMembershipSession: false,
  totalAmountPaise: 150_000,
  services: ['Haircut'],
}

const VISIT_ELSEWHERE: CustomerHistoryEntry = {
  scope: 'other_branch',
  branchName: OTHER_BRANCH.name,
  bookingDate: '2026-10-25',
  startTime: '16:00:00',
  serviceType: 'spa',
  services: ['Swedish massage'],
}

const MEMBERSHIP = {
  id: 'mem_1',
  membershipNumber: 'RG-MEM-26-1-12345',
  customerId: CUSTOMER_ID,
  tierId: 'tier_gold',
  tierNameSnapshot: 'Gold',
  totalHoursMinutes: 900,
  usedHoursMinutes: 120,
  pricePaidPaise: 1_500_000,
  startsAt: new Date('2026-09-01T00:00:00.000Z'),
  expiresAt: new Date('2026-11-30T00:00:00.000Z'),
  status: 'active',
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const patchGates = (body: Record<string, unknown>) =>
  customerRoute.PATCH(
    jsonRequest(`https://admin.theroyalglow.in/api/customers/${CUSTOMER_ID}`, 'PATCH', body),
    params,
  )

const postNote = (body: Record<string, unknown>) =>
  notesRoute.POST(
    jsonRequest(`https://admin.theroyalglow.in/api/customers/${CUSTOMER_ID}/notes`, 'POST', body),
    params,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_admin' }))
  dbMocks.getCustomerProfile.mockResolvedValue(PROFILE)
  dbMocks.getCustomerBranchSpend.mockResolvedValue({ spentPaise: 150_000, visits: 3 })
  dbMocks.getCustomerHistory.mockResolvedValue({
    thisBranch: [OWN_BOOKING],
    otherBranches: [VISIT_ELSEWHERE],
  })
  dbMocks.getCustomerInvoices.mockResolvedValue([
    {
      id: 'inv_rs',
      invoiceNumber: 'INV-1-2627-00001',
      invoiceType: 'service',
      paymentStatus: 'paid',
      totalAmountPaise: 150_000,
      gemsEarned: 15,
      createdAt: new Date('2026-10-20T06:00:00.000Z'),
    },
  ])
  dbMocks.getCustomerMembership.mockResolvedValue({ active: MEMBERSHIP, past: [] })
  dbMocks.getCustomerNotes.mockResolvedValue([])
})

describe('GET /api/customers/[id] — what the active branch sees', () => {
  it('reads money, bookings, invoices and notes for the active branch only', async () => {
    const res = await customerRoute.GET(
      new Request(`https://admin.theroyalglow.in/api/customers/${CUSTOMER_ID}`),
      params,
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getCustomerBranchSpend).toHaveBeenCalledWith(CUSTOMER_ID, TEST_BRANCH.id)
    expect(dbMocks.getCustomerHistory).toHaveBeenCalledWith(CUSTOMER_ID, TEST_BRANCH.id, 20)
    expect(dbMocks.getCustomerInvoices).toHaveBeenCalledWith(CUSTOMER_ID, TEST_BRANCH.id, 20, 0)
    expect(dbMocks.getCustomerNotes).toHaveBeenCalledWith(CUSTOMER_ID, TEST_BRANCH.id)

    expect(body.data.branchId).toBe(TEST_BRANCH.id)
    expect(body.data.branchMoney).toEqual({
      spentPaise: 150_000,
      visits: 3,
      averageSpendPaise: 50_000,
    })
    // Shared identity and visit history stay customer-wide.
    expect(body.data.customer).toMatchObject({ totalVisits: 5, gemsBalance: 42, noshowCount: 1 })
  })

  it('merges other branches’ visits newest first, without their amounts', async () => {
    const res = await customerRoute.GET(
      new Request(`https://admin.theroyalglow.in/api/customers/${CUSTOMER_ID}`),
      params,
    )
    const { data } = await res.json()

    expect(data.history).toEqual([VISIT_ELSEWHERE, OWN_BOOKING])
    expect(data.history[0]).not.toHaveProperty('totalAmountPaise')
    expect(data.history[0]).not.toHaveProperty('bookingId')
  })

  it('never returns the customer-wide spending counter or a membership price', async () => {
    dbMocks.getCustomerProfile.mockResolvedValue({ ...PROFILE, totalSpentPaise: 9_999_999 })

    const res = await customerRoute.GET(
      new Request(`https://admin.theroyalglow.in/api/customers/${CUSTOMER_ID}`),
      params,
    )
    const text = await res.text()

    expect(text).not.toContain('totalSpentPaise')
    expect(text).not.toContain('9999999')
    expect(text).not.toContain('pricePaidPaise')
    expect(text).not.toContain('dateOfBirth')
    expect(JSON.parse(text).data.membership.active).toMatchObject({
      tierNameSnapshot: 'Gold',
      totalHoursMinutes: 900,
      usedHoursMinutes: 120,
    })
  })

  it('answers 404 for an unknown customer', async () => {
    dbMocks.getCustomerProfile.mockResolvedValue(null)

    const res = await customerRoute.GET(
      new Request(`https://admin.theroyalglow.in/api/customers/${CUSTOMER_ID}`),
      params,
    )

    expect(res.status).toBe(404)
    expect(dbMocks.getCustomerHistory).not.toHaveBeenCalled()
  })

  it('passes on a refusal at the active branch', async () => {
    mocks.requireBranchRole.mockRejectedValue(
      new AppError({ code: ERROR_CODES.FORBIDDEN, message: 'No.', statusCode: 403 }),
    )

    const res = await customerRoute.GET(
      new Request(`https://admin.theroyalglow.in/api/customers/${CUSTOMER_ID}`),
      params,
    )

    expect(res.status).toBe(403)
    expect(dbMocks.getCustomerProfile).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/customers/[id] — no-show gates', () => {
  beforeEach(() => {
    dbMocks.updateCustomerProfile.mockResolvedValue({
      id: CUSTOMER_ID,
      noshowCount: 0,
      bookingRequiresApproval: false,
    })
  })

  it('needs a Manager or above at the active branch', async () => {
    await patchGates({ branchId: TEST_BRANCH.id, noshowCount: 0 })
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('manager')
  })

  it('updates the gates, returns only the gates and audits the branch', async () => {
    const res = await patchGates({ branchId: TEST_BRANCH.id, noshowCount: 0 })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(dbMocks.updateCustomerProfile).toHaveBeenCalledWith(CUSTOMER_ID, { noshowCount: 0 })
    expect(body.data).toEqual({
      customer: { id: CUSTOMER_ID, noshowCount: 0, bookingRequiresApproval: false },
    })
    expect(dbMocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'customer_profile',
        entityId: CUSTOMER_ID,
        branchId: TEST_BRANCH.id,
        oldValues: { noshowCount: 1, bookingRequiresApproval: false },
        newValues: { noshowCount: 0 },
      }),
    )
  })

  it('refuses a change rendered for another branch, without writing', async () => {
    const res = await patchGates({ branchId: OTHER_BRANCH.id, noshowCount: 0 })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.updateCustomerProfile).not.toHaveBeenCalled()
    expect(dbMocks.recordAudit).not.toHaveBeenCalled()
  })

  it('rejects a change that names no branch', async () => {
    const res = await patchGates({ noshowCount: 0 })
    expect(res.status).toBe(400)
    expect(dbMocks.updateCustomerProfile).not.toHaveBeenCalled()
  })

  it('records nothing for an empty change', async () => {
    const res = await patchGates({ branchId: TEST_BRANCH.id })

    expect(res.status).toBe(200)
    expect(dbMocks.recordAudit).not.toHaveBeenCalled()
  })

  it('answers 404 for an unknown customer, without writing', async () => {
    dbMocks.getCustomerProfile.mockResolvedValue(null)

    const res = await patchGates({ branchId: TEST_BRANCH.id, bookingRequiresApproval: false })

    expect(res.status).toBe(404)
    expect(dbMocks.updateCustomerProfile).not.toHaveBeenCalled()
  })
})

describe('POST /api/customers/[id]/notes — shared or branch-private', () => {
  beforeEach(() => {
    dbMocks.addCustomerNote.mockResolvedValue({
      id: 'note_1',
      content: 'Prefers Anjali',
      visibility: 'branch',
      bookingId: null,
      createdAt: new Date('2026-10-30T09:00:00.000Z'),
    })
  })

  it('records the active branch, the author and the chosen visibility', async () => {
    const res = await postNote({
      branchId: TEST_BRANCH.id,
      content: 'Prefers Anjali',
      visibility: 'branch',
    })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(dbMocks.addCustomerNote).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      authorId: 'u_admin',
      branchId: TEST_BRANCH.id,
      content: 'Prefers Anjali',
      visibility: 'branch',
      bookingId: undefined,
    })
    expect(body.data.note).toEqual({
      id: 'note_1',
      content: 'Prefers Anjali',
      visibility: 'branch',
      branchName: TEST_BRANCH.name,
      createdAt: '2026-10-30T09:00:00.000Z',
    })
  })

  it('makes the writer choose who may read it', async () => {
    const res = await postNote({ branchId: TEST_BRANCH.id, content: 'Prefers Anjali' })

    expect(res.status).toBe(400)
    expect(dbMocks.addCustomerNote).not.toHaveBeenCalled()
  })

  it('refuses a note rendered for another branch, without writing', async () => {
    const res = await postNote({
      branchId: OTHER_BRANCH.id,
      content: 'Prefers Anjali',
      visibility: 'shared',
    })

    expect(res.status).toBe(409)
    expect(dbMocks.addCustomerNote).not.toHaveBeenCalled()
  })

  it('answers 404 for an unknown customer', async () => {
    dbMocks.getCustomerProfile.mockResolvedValue(null)

    const res = await postNote({ branchId: TEST_BRANCH.id, content: 'x', visibility: 'shared' })

    expect(res.status).toBe(404)
    expect(dbMocks.addCustomerNote).not.toHaveBeenCalled()
  })

  it('links only the customer’s booking at the active branch', async () => {
    dbMocks.isCustomerBookingAtBranch.mockResolvedValue(false)

    const refused = await postNote({
      branchId: TEST_BRANCH.id,
      content: 'x',
      visibility: 'branch',
      bookingId: 'bk_mh',
    })
    expect(refused.status).toBe(404)
    expect(dbMocks.isCustomerBookingAtBranch).toHaveBeenCalledWith(
      'bk_mh',
      CUSTOMER_ID,
      TEST_BRANCH.id,
    )
    expect(dbMocks.addCustomerNote).not.toHaveBeenCalled()

    dbMocks.isCustomerBookingAtBranch.mockResolvedValue(true)
    const linked = await postNote({
      branchId: TEST_BRANCH.id,
      content: 'x',
      visibility: 'branch',
      bookingId: 'bk_rs',
    })
    expect(linked.status).toBe(201)
    expect(dbMocks.addCustomerNote).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'bk_rs', branchId: TEST_BRANCH.id }),
    )
  })
})
