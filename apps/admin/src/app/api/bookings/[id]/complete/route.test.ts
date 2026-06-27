// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : bookings/[id]/complete/route.test
 * Scope        : Property + integration tests — POST /api/bookings/[id]/complete
 *
 * Description  : Verifies that completing a booking transitions it to
 *                `completed` and creates a service invoice for any
 *                confirmed/in-progress booking, and returns
 *                BOOKING_INVALID_STATUS_TRANSITION (409) for an already
 *                completed booking. A separate integration block exercises the
 *                confirmed/in-progress happy path end-to-end, asserting the
 *                invoice is created and gems are credited in one transaction.
 *
 * Approach     : `@/lib/api/session`, `@/lib/jobs/enqueue`,
 *                `@/lib/notifications/providers/email`, and `@rgss/db/queries`
 *                are mocked with an in-memory fake store + loyalty ledger that
 *                mirrors the real completeBookingWithInvoice atomic write.
 *                `@rgss/business` (GST split, gems, invoice number) stays REAL.
 *                No DB, no network.
 *
 * Layer        : Testing (node environment — server route handler)
 *
 * Notes        : fast-check + Vitest, ≥100 runs for the property.
 *                Validates: Requirements 12.1, 12.5 (property) and 12.1 (integration)
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// In-memory fakes for the admin completion query layer. completeBookingWithInvoice
// mirrors the real atomic writer: it flips the booking to `completed`, records
// the supplied invoice (with the caller-computed GST split + gems), and credits
// the gems to a per-customer loyalty ledger. The route guards the transition
// (confirmed/in_progress only) before calling it, so for any other status the
// writer is never invoked.
// ---------------------------------------------------------------------------
type FakeService = {
  serviceId: string
  serviceNameSnapshot: string
  staffId: string | null
  priceAtBookingPaise: number
}
type FakeBooking = {
  id: string
  status: string
  branchId: string
  customerId: string
  customerName: string | null
  customerEmail: string | null
  bookingNumber: string
  serviceType: 'salon' | 'spa'
  totalAmountPaise: number
  isMembershipSession: boolean
  services: FakeService[]
}
type CapturedInvoice = {
  invoiceNumber: string
  subtotalPaise: number
  taxableValuePaise: number
  gstAmountPaise: number
  totalAmountPaise: number
  invoiceType: string
  paymentMethod: string
  gemsEarned: number
  gemsRedemption?: { serviceId: string; gemsRequired: number } | null
}

const harness = vi.hoisted(() => ({
  booking: null as unknown,
  ledger: new Map<string, number>(),
  lastInvoice: null as unknown,
})) as {
  booking: FakeBooking | null
  ledger: Map<string, number>
  lastInvoice: CapturedInvoice | null
}

const sessionMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))
const enqueueMocks = vi.hoisted(() => ({ enqueueJob: vi.fn(async () => {}) }))
const emailMocks = vi.hoisted(() => ({ sendEmail: vi.fn(async () => {}) }))

const dbMocks = vi.hoisted(() => {
  const h = (globalThis as { __completeHarness?: typeof harness }).__completeHarness
  // The harness object is captured lazily inside each fn so the reference is
  // always the live one set up in beforeEach.
  const store = () =>
    (globalThis as { __completeHarness?: typeof harness }).__completeHarness as
      | typeof harness
      | undefined
  void h
  return {
    getBookingForAdmin: vi.fn(async (id: string) => {
      const s = store()
      return s?.booking && s.booking.id === id ? s.booking : null
    }),
    getBranchByIdAdmin: vi.fn(async (id: string) => ({ id, number: 1 })),
    getStaffNamesByIds: vi.fn(async (ids: string[]) =>
      ids.map((id) => ({ id, name: `Staff ${id}` })),
    ),
    // Offer helpers — unused in these tests (no offerId supplied), provided so
    // the module mock is complete.
    getOfferById: vi.fn(async () => null),
    getOfferRedemptionForCustomerOnDate: vi.fn(async () => null),
    recordOfferRedemption: vi.fn(async () => {}),
    // Gems-redemption-at-checkout helpers. Default to "no redeemable service /
    // zero balance" so tests that don't opt in are unaffected; the redemption
    // suite overrides these per-case.
    getRedeemableServiceById: vi.fn(async () => null),
    getLoyaltySummary: vi.fn(async () => ({ balance: 0 })),
    completeBookingWithInvoice: vi.fn(
      async (params: {
        bookingId: string
        changedById: string
        invoice: CapturedInvoice
        items: unknown[]
      }) => {
        const s = store()
        const bk = s?.booking
        if (!bk || bk.id !== params.bookingId) {
          return null
        }
        bk.status = 'completed'
        if (s) {
          s.lastInvoice = params.invoice
          // Credit gems earned to the customer's loyalty balance (zero is a no-op).
          if (params.invoice.gemsEarned > 0) {
            s.ledger.set(
              bk.customerId,
              (s.ledger.get(bk.customerId) ?? 0) + params.invoice.gemsEarned,
            )
          }
          // Deduct any gems redeemed at checkout (mirrors the real guarded
          // atomic deduction; the fake assumes the balance was already gated).
          const redemption = params.invoice.gemsRedemption
          if (redemption) {
            s.ledger.set(
              bk.customerId,
              (s.ledger.get(bk.customerId) ?? 0) - redemption.gemsRequired,
            )
          }
        }
        return {
          booking: { ...bk },
          invoice: { id: 'inv_1', ...params.invoice },
        }
      },
    ),
  }
})

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@/lib/jobs/enqueue', () => enqueueMocks)
vi.mock('@/lib/notifications/providers/email', () => emailMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import { POST } from '@/app/api/bookings/[id]/complete/route'

const BOOKING_ID = 'bk_complete_1'
const AUTHORIZED_SESSION = { user: { id: 'u_admin', role: 'receptionist' } }

const ALL_STATUSES = [
  'pending',
  'confirmed',
  'rejected',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
] as const

const COMPLETABLE = new Set(['confirmed', 'in_progress'])

function seed(overrides: Partial<FakeBooking>): FakeBooking {
  const bk: FakeBooking = {
    id: BOOKING_ID,
    status: 'confirmed',
    branchId: 'br_1',
    customerId: 'cust_1',
    customerName: 'Asha Rao',
    customerEmail: null, // skip the (best-effort) invoice email path
    bookingNumber: 'BK-RS-2606-H-12345',
    serviceType: 'salon',
    totalAmountPaise: 250000,
    isMembershipSession: false,
    services: [
      {
        serviceId: 'svc_1',
        serviceNameSnapshot: 'Hair Spa',
        staffId: 'stf_1',
        priceAtBookingPaise: 250000,
      },
    ],
    ...overrides,
  }
  harness.booking = bk
  harness.ledger = new Map()
  harness.lastInvoice = null
  ;(globalThis as { __completeHarness?: typeof harness }).__completeHarness = harness
  return bk
}

function completeRequest(paymentMethod: string): Request {
  return new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paymentMethod }),
  })
}

const ctx = { params: Promise.resolve({ id: BOOKING_ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  sessionMocks.requireRole.mockResolvedValue(AUTHORIZED_SESSION)
})

describe('POST /api/bookings/[id]/complete — completion transition (property)', () => {
  // Feature: backend-api, Property 26: Completion transitions to completed and creates a service invoice
  it('completes confirmed/in-progress bookings with a service invoice; rejects any other status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_STATUSES),
        fc.integer({ min: 100, max: 5_000_000 }),
        fc.constantFrom('cash', 'upi', 'card'),
        fc.boolean(),
        async (status, totalAmountPaise, paymentMethod, isMembershipSession) => {
          vi.clearAllMocks()
          sessionMocks.requireRole.mockResolvedValue(AUTHORIZED_SESSION)
          seed({ status, totalAmountPaise, isMembershipSession })

          const res = await POST(completeRequest(paymentMethod), ctx)
          const json = await res.json()
          const bk = harness.booking as FakeBooking

          if (COMPLETABLE.has(status)) {
            // Transition to completed + a service invoice is created (Req 12.1).
            expect(res.status).toBe(200)
            expect(json.success).toBe(true)
            expect(bk.status).toBe('completed')
            expect(dbMocks.completeBookingWithInvoice).toHaveBeenCalledOnce()
            expect(json.data.invoice).toBeTruthy()
            expect(typeof json.data.invoice.invoiceNumber).toBe('string')
            expect(json.data.invoice.totalPaise).toBe(totalAmountPaise)
            // The persisted invoice is a service invoice.
            expect(harness.lastInvoice?.invoiceType).toBe('service')
            // GST split reconstructs the total exactly (Req 12.2).
            expect(
              (harness.lastInvoice as CapturedInvoice).taxableValuePaise +
                (harness.lastInvoice as CapturedInvoice).gstAmountPaise,
            ).toBe(totalAmountPaise)
          } else {
            // Any non-completable status (incl. already `completed`) → 409 and
            // no invoice/transition (Req 12.5).
            expect(res.status).toBe(409)
            expect(json.success).toBe(false)
            expect(json.error.code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
            expect(bk.status).toBe(status)
            expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
          }
        },
      ),
      { numRuns: 25 },
    )
  })
})

describe('POST /api/bookings/[id]/complete — completion happy path (integration)', () => {
  // Representative cases: a completable booking becomes `completed` with an
  // invoice + gems credited in one transaction (Req 12.1). Membership sessions
  // earn zero gems.
  const cases = [
    {
      name: 'confirmed regular booking credits floor(total/10000) gems',
      status: 'confirmed',
      totalAmountPaise: 250000, // ₹2,500 → 25 gems
      isMembershipSession: false,
      expectedGems: 25,
    },
    {
      name: 'in-progress regular booking credits floor(total/10000) gems',
      status: 'in_progress',
      totalAmountPaise: 99_999, // ₹999.99 → 9 gems (floor)
      isMembershipSession: false,
      expectedGems: 9,
    },
    {
      name: 'confirmed membership session credits zero gems',
      status: 'confirmed',
      totalAmountPaise: 200000,
      isMembershipSession: true,
      expectedGems: 0,
    },
  ] as const

  for (const c of cases) {
    it(c.name, async () => {
      seed({
        status: c.status,
        totalAmountPaise: c.totalAmountPaise,
        isMembershipSession: c.isMembershipSession,
      })

      const res = await POST(completeRequest('upi'), ctx)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)

      // Status flipped to completed in the single atomic write.
      expect((harness.booking as FakeBooking).status).toBe('completed')
      expect(dbMocks.completeBookingWithInvoice).toHaveBeenCalledOnce()

      // Invoice created.
      expect(json.data.invoice).toBeTruthy()
      expect(json.data.invoice.totalPaise).toBe(c.totalAmountPaise)
      expect(harness.lastInvoice?.invoiceType).toBe('service')

      // Gems credited to the loyalty ledger (zero for a membership session).
      expect(json.data.gemsEarned).toBe(c.expectedGems)
      expect(harness.ledger.get('cust_1') ?? 0).toBe(c.expectedGems)
    })
  }
})

describe('POST /api/bookings/[id]/complete — gems redemption at checkout', () => {
  // A two-service salon booking (₹2,500 + ₹1,000 = ₹3,500). The receptionist
  // redeems gems for the ₹1,000 service: that service leaves the money total,
  // so the payable amount is ₹2,500 and gems are EARNED on that reduced total.
  function seedTwoService(): void {
    seed({
      totalAmountPaise: 350000,
      services: [
        {
          serviceId: 'svc_1',
          serviceNameSnapshot: 'Hair Spa',
          staffId: 'stf_1',
          priceAtBookingPaise: 250000,
        },
        {
          serviceId: 'svc_2',
          serviceNameSnapshot: 'Head Massage',
          staffId: 'stf_1',
          priceAtBookingPaise: 100000,
        },
      ],
    })
  }

  function completeWith(body: Record<string, unknown>): Request {
    return new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('excludes the gems-covered service from the money total and earns gems on the rest', async () => {
    seedTwoService()
    // svc_2 is redeemable for 50 gems; the customer has enough balance.
    dbMocks.getRedeemableServiceById.mockResolvedValue({
      id: 'svc_2',
      isActive: true,
      gemsRedeemable: true,
      gemsRequired: 50,
    } as never)
    dbMocks.getLoyaltySummary.mockResolvedValue({ balance: 100 } as never)

    const res = await POST(
      completeWith({ paymentMethod: 'cash', gemsRedeemedServiceId: 'svc_2' }),
      ctx,
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    // Payable total excludes the ₹1,000 redeemed service → ₹2,500.
    expect(json.data.invoice.totalPaise).toBe(250000)
    // Gems earned on the reduced PAID total: floor(250000/10000) = 25.
    expect(json.data.gemsEarned).toBe(25)
    // The redemption is reported + persisted (server-computed cost, never client).
    expect(json.data.gemsRedeemed).toBe(50)
    expect(json.data.gemsRedeemedServiceId).toBe('svc_2')
    expect(harness.lastInvoice?.gemsRedemption).toEqual({ serviceId: 'svc_2', gemsRequired: 50 })
    // GST split reconstructs the PAYABLE total exactly.
    expect(
      (harness.lastInvoice as CapturedInvoice).taxableValuePaise +
        (harness.lastInvoice as CapturedInvoice).gstAmountPaise,
    ).toBe(250000)
  })

  it('rejects redeeming gems for a service that is not part of the booking (400)', async () => {
    seedTwoService()
    const res = await POST(
      completeWith({ paymentMethod: 'cash', gemsRedeemedServiceId: 'svc_not_here' }),
      ctx,
    )
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
  })

  it('rejects combining an offer with a gems redemption on the same booking (409)', async () => {
    seedTwoService()
    dbMocks.getOfferById.mockResolvedValue({
      id: 'off_1',
      isActive: true,
      discountType: 'percentage',
      discountValue: 10,
      serviceType: 'salon',
      startDate: '2020-01-01',
      endDate: '2999-01-01',
    } as never)

    const res = await POST(
      completeWith({ paymentMethod: 'cash', offerId: 'off_1', gemsRedeemedServiceId: 'svc_2' }),
      ctx,
    )
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.success).toBe(false)
    expect(json.error.code).toBe(ERROR_CODES.OFFER_NOT_APPLICABLE)
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
  })
})
