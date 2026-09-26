/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : bookings/new/route.test
 * Scope        : POST /api/bookings/new — walk-ins only for onboarded customers
 *
 * Description  : Pins the rule that a receptionist can book a walk-in ONLY for
 *                a customer who has completed onboarding.
 *
 *                The phone number, date of birth and gender live on
 *                customer_profile, while booking.customer_id FKs user.id. So
 *                the database would accept a walk-in for an account that signed
 *                in but never onboarded. The route's getCustomerProfile lookup,
 *                an INNER JOIN on customer_profile, is the only thing that
 *                prevents it. Nothing covered that before.
 *
 * Approach     : @/lib/api/session (requireRole), @rgss/db/queries and
 *                @/lib/realtime/publish are mocked. @rgss/business, @rgss/errors
 *                and @rgss/types stay REAL, so the Zod schema, slot rules and
 *                pricing run as in production. No DB, no network.
 *
 * Layer        : Test
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
  getBranchById: vi.fn(),
  getCustomerProfile: vi.fn(),
  getServicesByIds: vi.fn(),
  getDefaultStaffForService: vi.fn(),
  createBookingWithServices: vi.fn(),
}))

const publishMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/realtime/publish', () => ({ publishBookingEvent: publishMock }))

import { POST } from '@/app/api/bookings/new/route'

const WALKIN = {
  branchId: 'br_1',
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
  sessionMocks.requireRole.mockResolvedValue({ user: { id: 'rcp_1', role: 'receptionist' } })
  dbMocks.getBranchById.mockResolvedValue({ id: 'br_1', code: 'RS', status: 'operational' })
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

  it('requires receptionist or above', async () => {
    dbMocks.getCustomerProfile.mockResolvedValue(ONBOARDED_CUSTOMER)

    await POST(postRequest(WALKIN))

    expect(sessionMocks.requireRole).toHaveBeenCalledWith('receptionist')
  })
})
