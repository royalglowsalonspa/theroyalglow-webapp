// @vitest-environment node
/************************************************************
 * Module Name  : bookings/[id]/offers route.test
 * Scope        : API — Admin Booking checkout (multi-branch offers.md)
 *
 * Description  : GET /api/bookings/[id]/offers lists the live offers that
 *                save something on a salon booking at the active branch,
 *                best first; none, with the reason, for a SPA booking, a
 *                membership session, a booking made with gems or a customer
 *                who used an offer today (IST); 404 at another branch.
 *
 * Approach     : requireBranchRole and @rgss/db/queries are mocked;
 *                @rgss/business stays REAL.
 ************************************************************/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const branchMocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))
const dbMocks = vi.hoisted(() => ({
  getBookingForAdmin: vi.fn(),
  getOffersForCheckout: vi.fn(),
  getOfferRedemptionForCustomerOnDate: vi.fn(),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: branchMocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)

import { GET } from './route'

const BOOKING_ID = 'bk_offers_1'
// 00:30 IST on 01/12/2026: the UTC date is still 30/11.
const NOW = new Date('2026-11-30T19:00:00.000Z')

function salonBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    status: 'in_progress',
    branchId: TEST_BRANCH.id,
    customerId: 'cust_1',
    serviceType: 'salon',
    isMembershipSession: false,
    isGemsRedemption: false,
    services: [
      { serviceId: 'svc_haircut', priceAtBookingPaise: 80_000 },
      { serviceId: 'svc_facial', priceAtBookingPaise: 150_000 },
    ],
    ...overrides,
  }
}

function offer(over: Record<string, unknown>) {
  return {
    id: 'cms_offer_1',
    name: 'Offer',
    terms: null,
    isActive: true,
    startDate: new Date('2026-12-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    offerType: 'percentage',
    discountPercentage: 10,
    discountAmountPaise: null,
    comboPricePaise: null,
    serviceIds: ['svc_facial'],
    ...over,
  }
}

function get(id = BOOKING_ID) {
  return GET(new Request(`https://admin.theroyalglow.in/api/bookings/${id}/offers`), {
    params: Promise.resolve({ id }),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  branchMocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_reception' }))
  dbMocks.getBookingForAdmin.mockImplementation(async (id: string, branchId: string) =>
    id === BOOKING_ID && branchId === TEST_BRANCH.id ? salonBooking() : null,
  )
  dbMocks.getOfferRedemptionForCustomerOnDate.mockResolvedValue(null)
  dbMocks.getOffersForCheckout.mockResolvedValue([
    offer({ id: 'cms_offer_1', name: '10% off facials' }),
    offer({
      id: 'cms_offer_2',
      name: '₹300 off haircuts',
      offerType: 'flat',
      discountPercentage: null,
      discountAmountPaise: 30_000,
      serviceIds: ['svc_haircut'],
      terms: 'Weekdays only',
    }),
    offer({ id: 'cms_offer_3', name: 'Pedicure deal', serviceIds: ['svc_pedicure'] }),
  ])
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('GET /api/bookings/[id]/offers', () => {
  it('lists the offers that save something on the booking, best first', async () => {
    const res = await get()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toEqual({
      offers: [
        {
          id: 'cms_offer_2',
          name: '₹300 off haircuts',
          terms: 'Weekdays only',
          offerType: 'flat',
          discountPaise: 30_000,
        },
        {
          id: 'cms_offer_1',
          name: '10% off facials',
          terms: null,
          offerType: 'percentage',
          discountPaise: 15_000,
        },
      ],
      usedOfferToday: false,
      note: null,
    })
    // Today is read on the IST calendar: 01/12, though UTC says 30/11.
    expect(dbMocks.getOfferRedemptionForCustomerOnDate).toHaveBeenCalledWith('cust_1', '2026-12-01')
  })

  it('offers none once the customer has used an offer today', async () => {
    dbMocks.getOfferRedemptionForCustomerOnDate.mockResolvedValue({ id: 'red_1' })

    const json = await (await get()).json()

    expect(json.data).toEqual({
      offers: [],
      usedOfferToday: true,
      note: 'This customer has already used an offer today.',
    })
  })

  it.each([
    [{ serviceType: 'spa' }, 'Offers apply to salon bookings only.'],
    [{ isMembershipSession: true, serviceType: 'spa' }, 'A membership session takes no offer.'],
    [{ isGemsRedemption: true }, 'A booking made with gems takes no offer.'],
  ])('offers none for %o, saying why', async (overrides, note) => {
    dbMocks.getBookingForAdmin.mockResolvedValue(salonBooking(overrides))

    const json = await (await get()).json()

    expect(json.data).toEqual({ offers: [], usedOfferToday: false, note })
    expect(dbMocks.getOffersForCheckout).not.toHaveBeenCalled()
  })

  it('says when no offer applies', async () => {
    dbMocks.getOffersForCheckout.mockResolvedValue([offer({ serviceIds: ['svc_pedicure'] })])

    const json = await (await get()).json()

    expect(json.data.offers).toEqual([])
    expect(json.data.note).toBe('No offer applies to this booking today.')
  })

  it('is 404 for a booking at another branch', async () => {
    branchMocks.requireBranchRole.mockResolvedValue(
      branchContext({ userId: 'u_reception', branch: OTHER_BRANCH }),
    )

    const res = await get()

    expect(res.status).toBe(404)
    expect(dbMocks.getOffersForCheckout).not.toHaveBeenCalled()
  })
})
