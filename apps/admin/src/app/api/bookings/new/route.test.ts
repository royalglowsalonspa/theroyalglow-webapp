/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : bookings/new/route.test
 * Scope        : POST /api/bookings/new — walk-ins at the active branch
 *
 * Description  : Pins the rule that a receptionist can book a walk-in ONLY for
 *                a customer who has completed onboarding, and only at the
 *                active branch (multi-branch R2.3, R2.4).
 *
 *                The phone number, date of birth and gender live on
 *                customer_profile, while booking.customer_id FKs user.id. So
 *                the database would accept a walk-in for an account that signed
 *                in but never onboarded. The route's getCustomerProfile lookup,
 *                an INNER JOIN on customer_profile, is the only thing that
 *                prevents it.
 *
 *                The form names the branch it was rendered for: after a switch
 *                it is refused (409) rather than booked at the new branch, the
 *                branch must be operational, and the auto-assigned staff come
 *                from that branch.
 *
 * Approach     : requireBranchRole, @rgss/db/queries and @/lib/realtime/publish
 *                are mocked. assertRenderedBranch, @rgss/business, @rgss/errors
 *                and @rgss/types stay REAL, so the Zod schema, slot rules and
 *                pricing run as in production. No DB, no network.
 *
 * Layer        : Test
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const mocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
  getClosureOn: vi.fn(async (): Promise<{ name: string; allBranches: boolean } | null> => null),
  getCustomerProfile: vi.fn(),
  getServicesByIds: vi.fn(),
  getDefaultStaffForService: vi.fn(),
  createBookingWithServices: vi.fn(),
}))

const publishMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/realtime/publish', () => ({ publishBookingEvent: publishMock }))

import { POST } from '@/app/api/bookings/new/route'

const WALKIN = {
  branchId: TEST_BRANCH.id,
  customerId: 'cust_1',
  serviceType: 'salon',
  bookingDate: '2026-10-01',
  startTime: '10:00',
  serviceIds: ['svc_1'],
}

/** What getCustomerProfile returns for a customer who completed onboarding. */
const ONBOARDED_CUSTOMER = {
  id: 'cust_1',
  name: 'Asha',
  email: 'asha@example.com',
  role: 'customer',
  phone: '9876543210',
  gender: 'female',
  dateOfBirth: new Date('1995-04-12T00:00:00.000Z'),
  tags: [],
}

function postRequest(body: unknown): Request {
  return new Request('https://admin.theroyalglow.in/api/bookings/new', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'rcp_1' }))
  dbMocks.getServicesByIds.mockResolvedValue([
    {
      id: 'svc_1',
      name: 'Haircut',
      serviceType: 'salon',
      isActive: true,
      pricePaise: 50_000,
      durationMinutes: 30,
    },
  ])
  dbMocks.getDefaultStaffForService.mockResolvedValue('stf_1')
  dbMocks.createBookingWithServices.mockImplementation(
    async (booking: { bookingNumber: string; status: string }) => ({
      id: 'bk_1',
      bookingNumber: booking.bookingNumber,
      status: booking.status,
    }),
  )
})

describe('POST /api/bookings/new — walk-ins only for onboarded customers', () => {
  it('rejects a customer who never completed onboarding, and writes nothing', async () => {
    // getCustomerProfile INNER JOINs customer_profile, so an account that signed
    // in but never finished /onboarding resolves to null.
    dbMocks.getCustomerProfile.mockResolvedValue(null)

    const res = await POST(postRequest(WALKIN))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(dbMocks.getCustomerProfile).toHaveBeenCalledWith('cust_1')
    expect(dbMocks.createBookingWithServices).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('books a confirmed walk-in for a customer whose profile is complete', async () => {
    dbMocks.getCustomerProfile.mockResolvedValue(ONBOARDED_CUSTOMER)

    const res = await POST(postRequest(WALKIN))

    expect(res.status).toBe(201)
    expect(dbMocks.createBookingWithServices).toHaveBeenCalledTimes(1)
    expect(dbMocks.createBookingWithServices.mock.calls[0]?.[0]).toMatchObject({
      customerId: 'cust_1',
      status: 'confirmed',
      isWalkin: true,
    })
  })

  it('books against the customer the receptionist selected, never the receptionist', async () => {
    dbMocks.getCustomerProfile.mockResolvedValue(ONBOARDED_CUSTOMER)

    await POST(postRequest(WALKIN))

    const written = dbMocks.createBookingWithServices.mock.calls[0]?.[0]
    expect(written?.customerId).toBe('cust_1')
    expect(written?.customerId).not.toBe('rcp_1')
  })

  it('requires receptionist or above at the active branch', async () => {
    dbMocks.getCustomerProfile.mockResolvedValue(ONBOARDED_CUSTOMER)

    await POST(postRequest(WALKIN))

    expect(mocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
  })

  it('answers the refusal when the person may not book at the active branch', async () => {
    mocks.requireBranchRole.mockRejectedValue(
      new AppError({ code: ERROR_CODES.FORBIDDEN, message: 'No.', statusCode: 403 }),
    )

    const res = await POST(postRequest(WALKIN))

    expect(res.status).toBe(403)
    expect(dbMocks.createBookingWithServices).not.toHaveBeenCalled()
  })
})

describe('POST /api/bookings/new — the active branch only (R2.3, R2.4)', () => {
  beforeEach(() => {
    dbMocks.getCustomerProfile.mockResolvedValue(ONBOARDED_CUSTOMER)
  })

  it('books at the active branch, with its code and its staff', async () => {
    const res = await POST(postRequest(WALKIN))

    expect(res.status).toBe(201)
    const written = dbMocks.createBookingWithServices.mock.calls[0]?.[0]
    expect(written?.branchId).toBe(TEST_BRANCH.id)
    expect(written?.bookingNumber).toMatch(/^BK-RS-/)
    // Someone at the branch who isn't on approved leave that day (migration 0014).
    expect(dbMocks.getDefaultStaffForService).toHaveBeenCalledWith(
      'svc_1',
      TEST_BRANCH.id,
      '2026-10-01',
    )
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: TEST_BRANCH.id, event: 'created' }),
    )
  })

  it('refuses a form rendered for another branch with 409, and writes nothing', async () => {
    const res = await POST(postRequest({ ...WALKIN, branchId: OTHER_BRANCH.id }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.getCustomerProfile).not.toHaveBeenCalled()
    expect(dbMocks.createBookingWithServices).not.toHaveBeenCalled()
  })

  it('refuses a walk-in while the branch is not operational', async () => {
    mocks.requireBranchRole.mockResolvedValue(
      branchContext({ branch: { ...TEST_BRANCH, status: 'temporarily_closed' } }),
    )

    const res = await POST(postRequest(WALKIN))

    expect(res.status).toBe(400)
    expect(dbMocks.createBookingWithServices).not.toHaveBeenCalled()
  })

  it('refuses when nobody at the branch can take the services', async () => {
    dbMocks.getDefaultStaffForService.mockResolvedValue(null)

    const res = await POST(postRequest(WALKIN))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.message).toContain(TEST_BRANCH.name)
    expect(dbMocks.createBookingWithServices).not.toHaveBeenCalled()
  })
})

describe('POST /api/bookings/new — closed days (R1.8)', () => {
  it('refuses a walk-in on a closed day, tells a Receptionist whom to ask, and writes nothing', async () => {
    dbMocks.getCustomerProfile.mockResolvedValue(ONBOARDED_CUSTOMER)
    dbMocks.getClosureOn.mockResolvedValueOnce({ name: 'Diwali', allBranches: true })

    const res = await POST(postRequest(WALKIN))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.BOOKING_SLOT_UNAVAILABLE)
    expect(body.error.message).toBe(
      'Rayasandra is closed on 01/10/2026 (Diwali). Ask the branch Manager to remove the closure if the branch is open.',
    )
    expect(dbMocks.getClosureOn).toHaveBeenCalledWith(TEST_BRANCH.id, '2026-10-01')
    expect(dbMocks.createBookingWithServices).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('tells a Manager where to reopen the day', async () => {
    mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'mgr_1', role: 'manager' }))
    dbMocks.getCustomerProfile.mockResolvedValue(ONBOARDED_CUSTOMER)
    dbMocks.getClosureOn.mockResolvedValueOnce({ name: 'Renovation', allBranches: false })

    const body = await (await POST(postRequest(WALKIN))).json()

    expect(body.error.message).toBe(
      'Rayasandra is closed on 01/10/2026 (Renovation). Remove the closure on the Schedule page if the branch is open.',
    )
  })
})
