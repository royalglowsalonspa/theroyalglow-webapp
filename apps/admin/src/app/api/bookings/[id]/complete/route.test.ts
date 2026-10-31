// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : bookings/[id]/complete/route.test
 * Scope        : Property + integration tests — POST /api/bookings/[id]/complete
 *
 * Description  : Verifies that completing a booking transitions it to
 *                `completed` and issues a service invoice for any
 *                confirmed/in-progress booking, and returns
 *                BOOKING_INVALID_STATUS_TRANSITION (409) otherwise. Further
 *                blocks cover gems at checkout, the active branch, and the
 *                invoice's tax (multi-branch R6.1, R6.4): each line at the
 *                branch's rate in force for its SAC code, a discount shared
 *                across the lines, totals summed from the lines, no fallback
 *                rate, and the live-invoicing checks (TX-08, TX-10).
 *
 * Approach     : requireBranchRole, `@/lib/jobs/enqueue`,
 *                `@/lib/notifications/providers/email`, and `@rgss/db/queries`
 *                are mocked with an in-memory fake store + loyalty ledger that
 *                mirrors the real completeBookingWithInvoice atomic write.
 *                `@rgss/business` (tax, gems, offers) stays REAL. No DB, no
 *                network.
 *
 * Layer        : Testing (node environment — server route handler)
 *
 * Notes        : fast-check + Vitest.
 *                Validates: Requirements 12.1, 12.5; multi-branch R6.1, R6.4
 ************************************************************/

import { financialYearIST } from '@rgss/business'
import { AppError, ERROR_CODES } from '@rgss/errors'
import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

// ---------------------------------------------------------------------------
// In-memory fakes for the admin completion query layer. completeBookingWithInvoice
// mirrors the real atomic writer: it flips the booking to `completed`, records
// the supplied invoice and lines (every amount computed by the route), numbers
// the invoice as the database would, and credits the gems to a per-customer
// loyalty ledger. The route guards the transition (confirmed/in_progress only)
// and the tax configuration before calling it, so otherwise it is never invoked.
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
  /** Booked with gems on the website: takes no offer at checkout. */
  isGemsRedemption?: boolean
  services: FakeService[]
}
type FakeVersion = {
  id: string
  branchId: string
  sacCode: string
  rateBps: number
  pricesIncludeTax: boolean
  effectiveFrom: Date
  reviewStatus: 'provisional' | 'reviewed'
}
type FakeBranch = {
  id: string
  number: number
  name: string
  legalName: string | null
  gstin: string | null
}
type CapturedInvoice = {
  branchId: string
  customerId: string
  invoiceType: string
  paymentMethod: string
  subtotalPaise: number
  discountAmountPaise: number
  taxableValuePaise: number
  gstAmountPaise: number
  cgstPaise: number
  sgstPaise: number
  totalAmountPaise: number
  gemsEarned: number
  gemsRedemption?: { serviceId: string; gemsRequired: number } | null
  taxPointAt: Date
  financialYear: string
  taxReviewStatus: 'provisional' | 'reviewed'
  // The offer applied, its rule snapshot and the IST day it uses up.
  offer?: { id: string; name: string; type: string; value: number; redeemedOn: string } | null
}
type CapturedItem = {
  serviceId: string
  serviceNameSnapshot: string
  staffNameSnapshot: string
  unitPricePaise: number
  totalPricePaise: number
  sacCode: string
  taxVersionId: string
  rateBps: number
  discountPaise: number
  taxableValuePaise: number
  taxPaise: number
  cgstPaise: number
  sgstPaise: number
}
// What the route hands completeMembershipSession: the ₹0 invoice's tax facts
// per line, the lines' snapshots and the settlement share.
type CapturedSession = {
  bookingId: string
  branchId: string
  changedById: string
  invoice: {
    taxPointAt: Date
    financialYear: string
    taxReviewStatus: 'provisional' | 'reviewed'
    lineTax: { sacCode: string; taxVersionId: string; rateBps: number }[]
  }
  lines: { serviceId: string; serviceNameSnapshot: string; staffNameSnapshot: string | null }[]
  settlement: { shareBps: number; gemValuePaise: number }
}

const harness = vi.hoisted(() => ({
  booking: null as unknown,
  ledger: new Map<string, number>(),
  lastInvoice: null as unknown,
  lastItems: [] as unknown[],
  versions: [] as unknown[],
  sacCodes: new Map<string, string>(),
  live: false,
  branch: null as unknown,
  lastSession: null as unknown,
})) as {
  booking: FakeBooking | null
  ledger: Map<string, number>
  lastInvoice: CapturedInvoice | null
  lastItems: CapturedItem[]
  versions: FakeVersion[]
  sacCodes: Map<string, string>
  live: boolean
  branch: FakeBranch | null
  lastSession: CapturedSession | null
}

const mocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))
const enqueueMocks = vi.hoisted(() => ({ enqueueJob: vi.fn(async () => {}) }))
const emailMocks = vi.hoisted(() => ({ sendEmail: vi.fn(async () => {}) }))

const dbMocks = vi.hoisted(() => ({
  getBookingForAdmin: vi.fn(async (id: string, branchId: string) => {
    const bk = harness.booking
    return bk && bk.id === id && bk.branchId === branchId ? bk : null
  }),
  getBranchByIdAdmin: vi.fn(async (id: string) =>
    harness.branch ? { ...harness.branch, id } : null,
  ),
  getStaffNamesByIds: vi.fn(async (ids: string[]) =>
    ids.map((id) => ({ id, name: `Staff ${id}` })),
  ),
  // The tax configuration the route reads through lib/api/invoice-tax.
  getBranchTaxVersions: vi.fn(async (branchId: string) =>
    harness.versions.filter((v) => v.branchId === branchId),
  ),
  getInvoicingSetting: vi.fn(async () => ({ live: harness.live })),
  // The Developer's settlement settings (R10), stored on gems entries.
  getSettlementSetting: vi.fn(async () => ({ shareBps: 10_000, gemValuePaise: 100 })),
  getServiceSacCodes: vi.fn(async (ids: string[]) => {
    const codes = new Map<string, string>()
    for (const id of ids) {
      const code = harness.sacCodes.get(id)
      if (code) {
        codes.set(id, code)
      }
    }
    return codes
  }),
  // Offer helpers — no offer unless a test supplies one.
  getOfferById: vi.fn(async () => null),
  getOfferRedemptionForCustomerOnDate: vi.fn(async (): Promise<{ id: string } | null> => null),
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
      items: CapturedItem[]
    }) => {
      const bk = harness.booking
      if (!bk || bk.id !== params.bookingId) {
        return null
      }
      bk.status = 'completed'
      harness.lastInvoice = params.invoice
      harness.lastItems = params.items
      // Credit gems earned to the customer's loyalty balance (zero is a no-op).
      if (params.invoice.gemsEarned > 0) {
        harness.ledger.set(
          bk.customerId,
          (harness.ledger.get(bk.customerId) ?? 0) + params.invoice.gemsEarned,
        )
      }
      // Deduct any gems redeemed at checkout (mirrors the real guarded atomic
      // deduction; the fake assumes the balance was already gated).
      const redemption = params.invoice.gemsRedemption
      if (redemption) {
        harness.ledger.set(
          bk.customerId,
          (harness.ledger.get(bk.customerId) ?? 0) - redemption.gemsRequired,
        )
      }
      // The database numbers the invoice from the branch's counter.
      return {
        booking: { ...bk },
        invoice: { id: 'inv_1', invoiceNumber: 'RS/2627/000001', ...params.invoice },
      }
    },
  ),
  // Mirrors the real guarded write: it completes only an in-progress
  // membership session of the branch, consuming its held minutes, and issues
  // the ₹0 session invoice; otherwise nothing changes.
  completeMembershipSession: vi.fn(async (params: CapturedSession) => {
    const bk = harness.booking
    if (
      !bk ||
      bk.id !== params.bookingId ||
      bk.branchId !== params.branchId ||
      !bk.isMembershipSession ||
      bk.status !== 'in_progress'
    ) {
      return { ok: false, reason: 'not_in_progress' }
    }
    bk.status = 'completed'
    harness.lastSession = params
    return {
      ok: true,
      booking: { ...bk },
      invoice: { id: 'inv_s1', invoiceNumber: 'RS/2627/000002' },
      remainingMinutes: 480,
    }
  }),
}))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: mocks.requireBranchRole }
})
vi.mock('@/lib/jobs/enqueue', () => enqueueMocks)
vi.mock('@/lib/notifications/providers/email', () => emailMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import { POST } from '@/app/api/bookings/[id]/complete/route'

const BOOKING_ID = 'bk_complete_1'
const DAY_MS = 24 * 60 * 60 * 1000
// The seeded provisional rates' start (0018): 22 September 2025, 00:00 IST.
const SINCE = new Date('2025-09-22T00:00:00+05:30')

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

/** A version of the active branch, provisional and in force since SINCE unless overridden. */
function version(
  sacCode: string,
  rateBps: number,
  overrides: Partial<FakeVersion> = {},
): FakeVersion {
  return {
    id: `tax_${TEST_BRANCH.id}_${sacCode}`,
    branchId: TEST_BRANCH.id,
    sacCode,
    rateBps,
    pricesIncludeTax: true,
    effectiveFrom: SINCE,
    reviewStatus: 'provisional',
    ...overrides,
  }
}

function service(id: string, name: string, pricePaise: number, staffId = 'stf_1'): FakeService {
  return { serviceId: id, serviceNameSnapshot: name, staffId, priceAtBookingPaise: pricePaise }
}

// One booking with one service by default. Giving only `totalAmountPaise`
// prices that service at it, so the booking and its lines agree.
function seed(overrides: Partial<FakeBooking>): FakeBooking {
  const total = overrides.totalAmountPaise ?? 250000
  const bk: FakeBooking = {
    id: BOOKING_ID,
    status: 'confirmed',
    branchId: TEST_BRANCH.id,
    customerId: 'cust_1',
    customerName: 'Asha Rao',
    customerEmail: null, // skip the (best-effort) invoice email path
    bookingNumber: 'BK-RS-2606-H-12345',
    serviceType: 'salon',
    totalAmountPaise: total,
    isMembershipSession: false,
    services: [service('svc_1', 'Hair Spa', total)],
    ...overrides,
  }
  harness.booking = bk
  harness.ledger = new Map()
  harness.lastInvoice = null
  harness.lastItems = []
  harness.lastSession = null
  return bk
}

// A SPA membership session: ₹0, paid for with the membership's minutes.
function seedSession(overrides: Partial<FakeBooking> = {}): FakeBooking {
  harness.sacCodes = new Map([
    ['svc_aroma', '999723'],
    ['svc_scrub', '999723'],
  ])
  return seed({
    status: 'in_progress',
    serviceType: 'spa',
    bookingNumber: 'BK-RS-2610-S-12345-M',
    totalAmountPaise: 0,
    isMembershipSession: true,
    services: [service('svc_aroma', 'Aroma 60', 0), service('svc_scrub', 'Scrub 30', 0, 'stf_2')],
    ...overrides,
  })
}

function completeRequest(paymentMethod: string, branchId: string = TEST_BRANCH.id): Request {
  return new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ branchId, paymentMethod }),
  })
}

function completeWith(body: Record<string, unknown>): Request {
  return new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ branchId: TEST_BRANCH.id, ...body }),
  })
}

const ctx = { params: Promise.resolve({ id: BOOKING_ID }) }

function resetTaxConfiguration(): void {
  harness.versions = [version('999721', 500), version('999722', 500), version('999723', 500)]
  harness.sacCodes = new Map([
    ['svc_1', '999721'],
    ['svc_2', '999721'],
  ])
  harness.live = false
  harness.branch = {
    id: TEST_BRANCH.id,
    number: 1,
    name: TEST_BRANCH.name,
    legalName: null,
    gstin: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_admin' }))
  resetTaxConfiguration()
})

describe('POST /api/bookings/[id]/complete — completion transition (property)', () => {
  // Feature: backend-api, Property 26: Completion transitions to completed and creates a service invoice
  it('completes confirmed/in-progress bookings with a service invoice; rejects any other status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_STATUSES),
        fc.integer({ min: 100, max: 5_000_000 }),
        fc.integer({ min: 0, max: 2800 }),
        fc.constantFrom('cash', 'upi', 'card'),
        async (status, totalAmountPaise, rateBps, paymentMethod) => {
          vi.clearAllMocks()
          mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_admin' }))
          resetTaxConfiguration()
          harness.versions = [version('999721', rateBps)]
          seed({ status, totalAmountPaise })

          const res = await POST(completeRequest(paymentMethod), ctx)
          const json = await res.json()
          const bk = harness.booking as FakeBooking

          if (COMPLETABLE.has(status)) {
            // Transition to completed + a service invoice is created (Req 12.1).
            expect(res.status).toBe(200)
            expect(json.success).toBe(true)
            expect(bk.status).toBe('completed')
            expect(dbMocks.completeBookingWithInvoice).toHaveBeenCalledOnce()
            expect(json.data.invoice.invoiceNumber).toBe('RS/2627/000001')
            expect(json.data.invoice.totalPaise).toBe(totalAmountPaise)
            const inv = harness.lastInvoice as CapturedInvoice
            const [line] = harness.lastItems
            // The persisted invoice is a service invoice.
            expect(inv.invoiceType).toBe('service')
            // The line carries the rate it was taxed at; its taxable value and
            // tax add up to what it costs, and the header is the line's sums.
            expect(line?.rateBps).toBe(rateBps)
            expect((line?.taxableValuePaise ?? 0) + (line?.taxPaise ?? 0)).toBe(totalAmountPaise)
            expect(inv.taxableValuePaise).toBe(line?.taxableValuePaise)
            expect(inv.gstAmountPaise).toBe(line?.taxPaise)
            expect(inv.taxableValuePaise + inv.gstAmountPaise).toBe(totalAmountPaise)
            // Intra-state split: CGST is half rounded down, SGST the rest.
            expect(inv.cgstPaise).toBe(Math.floor(inv.gstAmountPaise / 2))
            expect(inv.cgstPaise + inv.sgstPaise).toBe(inv.gstAmountPaise)
          } else {
            // Any non-completable status (incl. already `completed`) → 409 and
            // no invoice/transition (Req 12.5).
            expect(res.status).toBe(409)
            expect(json.success).toBe(false)
            expect(json.error.code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
            expect(bk.status).toBe(status)
            expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
          }
          // An ordinary booking never takes the session path.
          expect(dbMocks.completeMembershipSession).not.toHaveBeenCalled()
        },
      ),
      { numRuns: 40 },
    )
  })

  it('completes a membership session only once it is in progress, with or without a payment method', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_STATUSES),
        fc.option(fc.constantFrom('cash', 'upi', 'card'), { nil: undefined }),
        async (status, paymentMethod) => {
          vi.clearAllMocks()
          mocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_admin' }))
          resetTaxConfiguration()
          seedSession({ status })

          const res = await POST(completeWith({ paymentMethod }), ctx)
          const json = await res.json()
          const bk = harness.booking as FakeBooking

          if (status === 'in_progress') {
            expect(res.status).toBe(200)
            expect(bk.status).toBe('completed')
            expect(dbMocks.completeMembershipSession).toHaveBeenCalledOnce()
            expect(json.data.invoice).toMatchObject({ totalPaise: 0, gstPaise: 0 })
          } else {
            // A confirmed session hasn't started: completing it would record
            // a session of no length.
            expect(res.status).toBe(409)
            expect(json.error.code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
            expect(json.error.message).toBe(
              status === 'confirmed'
                ? 'Start this session before you complete it.'
                : `Only a session in progress can be completed (current status: "${status}").`,
            )
            expect(bk.status).toBe(status)
            expect(dbMocks.completeMembershipSession).not.toHaveBeenCalled()
          }
          // A session is never billed as a service.
          expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
        },
      ),
      { numRuns: 40 },
    )
  })
})

describe('POST /api/bookings/[id]/complete — completion happy path (integration)', () => {
  // Representative cases: a completable booking becomes `completed` with an
  // invoice + gems credited in one transaction (Req 12.1). Membership sessions
  // have their own block below.
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
      expect(json.data.invoice.totalPaise).toBe(c.totalAmountPaise)
      expect(harness.lastInvoice?.invoiceType).toBe('service')

      // Gems credited to the loyalty ledger (zero for a membership session).
      expect(json.data.gemsEarned).toBe(c.expectedGems)
      expect(harness.ledger.get('cust_1') ?? 0).toBe(c.expectedGems)

      // The PDF job and the follow-up are queued for the issued invoice.
      expect(enqueueMocks.enqueueJob).toHaveBeenCalledWith(
        '/api/jobs/invoice-pdf',
        { invoiceId: 'inv_1' },
        0,
      )
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
      services: [service('svc_1', 'Hair Spa', 250000), service('svc_2', 'Head Massage', 100000)],
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
    // The tax reconstructs the PAYABLE total exactly.
    expect(
      (harness.lastInvoice as CapturedInvoice).taxableValuePaise +
        (harness.lastInvoice as CapturedInvoice).gstAmountPaise,
    ).toBe(250000)
    // The covered service stays on the invoice for the record, billed at 0.
    expect(harness.lastItems[1]).toMatchObject({
      serviceId: 'svc_2',
      unitPricePaise: 100000,
      totalPricePaise: 0,
      discountPaise: 0,
      taxableValuePaise: 0,
      taxPaise: 0,
    })
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
      offerType: 'percentage',
      discountPercentage: 10,
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

describe('POST /api/bookings/[id]/complete — the active branch only (R2.3, R2.4)', () => {
  it('needs a Receptionist or above, and bills from the booking’s branch', async () => {
    seed({ status: 'confirmed' })

    const res = await POST(completeRequest('cash'), ctx)

    expect(res.status).toBe(200)
    expect(mocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getBookingForAdmin).toHaveBeenCalledWith(BOOKING_ID, TEST_BRANCH.id)
    expect(dbMocks.getBranchByIdAdmin).toHaveBeenCalledWith(TEST_BRANCH.id)
    // The rates are the booking's branch's.
    expect(dbMocks.getBranchTaxVersions).toHaveBeenCalledWith(TEST_BRANCH.id)
    const [params] = dbMocks.completeBookingWithInvoice.mock.calls[0] ?? []
    expect(params?.invoice.branchId).toBe(TEST_BRANCH.id)
  })

  it('hands the settlement settings to the write, for gems another branch issued (R10)', async () => {
    seed({ status: 'confirmed' })
    dbMocks.getSettlementSetting.mockResolvedValueOnce({ shareBps: 7_500, gemValuePaise: 50 })

    const res = await POST(completeRequest('cash'), ctx)

    expect(res.status).toBe(200)
    const [params] = dbMocks.completeBookingWithInvoice.mock.calls[0] ?? []
    expect(params).toMatchObject({ settlement: { shareBps: 7_500, gemValuePaise: 50 } })
  })

  it("refuses checkout while the settlement settings can't be read, billing nothing (409)", async () => {
    seed({ status: 'confirmed' })
    dbMocks.getSettlementSetting.mockRejectedValueOnce(
      new AppError({
        code: ERROR_CODES.SETTLEMENT_SETTINGS_INVALID,
        message: "The settlement settings can't be read.",
        statusCode: 409,
      }),
    )

    const res = await POST(completeRequest('cash'), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.SETTLEMENT_SETTINGS_INVALID)
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
    expect((harness.booking as FakeBooking).status).toBe('confirmed')
  })

  it('treats a booking at another branch as not found and bills nothing', async () => {
    seed({ status: 'confirmed', branchId: OTHER_BRANCH.id })

    const res = await POST(completeRequest('cash'), ctx)

    expect(res.status).toBe(404)
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
    expect((harness.booking as FakeBooking).status).toBe('confirmed')
  })

  it('refuses a checkout rendered for another branch with 409', async () => {
    seed({ status: 'confirmed' })

    const res = await POST(completeRequest('cash', OTHER_BRANCH.id), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.getBookingForAdmin).not.toHaveBeenCalled()
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
  })

  it('refuses to complete a booking nobody is assigned to (R1.7)', async () => {
    // Its assignee left the branch; it waits for someone else.
    seed({
      status: 'confirmed',
      services: [{ ...service('svc_1', 'Hair Spa', 250000), staffId: null }],
    })

    const res = await POST(completeRequest('cash'), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.CONFLICT)
    expect(json.error.message).toMatch(/Nobody is assigned/)
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
    expect((harness.booking as FakeBooking).status).toBe('confirmed')
  })
})

describe('POST /api/bookings/[id]/complete — the invoice’s tax (R6.1, R6.4)', () => {
  // ₹2,500 haircut (SAC 999721) and ₹1,000 facial (SAC 999722).
  function seedHaircutAndFacial(): void {
    seed({
      totalAmountPaise: 350000,
      services: [service('svc_1', 'Haircut', 250000), service('svc_2', 'Facial', 100000, 'stf_2')],
    })
    harness.sacCodes = new Map([
      ['svc_1', '999721'],
      ['svc_2', '999722'],
    ])
  }

  it('taxes each line at its SAC code’s rate and makes the totals the lines’ sums', async () => {
    seedHaircutAndFacial()
    harness.versions = [version('999721', 500), version('999722', 1800)]

    const res = await POST(completeRequest('cash'), ctx)

    expect(res.status).toBe(200)
    const [haircut, facial] = harness.lastItems
    // 2,50,000 at 5%: taxable round(2,50,000 × 10,000 / 10,500) = 2,38,095.
    expect(haircut).toMatchObject({
      sacCode: '999721',
      taxVersionId: `tax_${TEST_BRANCH.id}_999721`,
      rateBps: 500,
      unitPricePaise: 250000,
      totalPricePaise: 250000,
      discountPaise: 0,
      taxableValuePaise: 238095,
      taxPaise: 11905,
      cgstPaise: 5952,
      sgstPaise: 5953,
      staffNameSnapshot: 'Staff stf_1',
    })
    // 1,00,000 at 18%: taxable round(1,00,000 × 10,000 / 11,800) = 84,746.
    expect(facial).toMatchObject({
      sacCode: '999722',
      taxVersionId: `tax_${TEST_BRANCH.id}_999722`,
      rateBps: 1800,
      taxableValuePaise: 84746,
      taxPaise: 15254,
      cgstPaise: 7627,
      sgstPaise: 7627,
      staffNameSnapshot: 'Staff stf_2',
    })
    expect(harness.lastInvoice).toMatchObject({
      subtotalPaise: 350000,
      discountAmountPaise: 0,
      taxableValuePaise: 238095 + 84746,
      gstAmountPaise: 11905 + 15254,
      cgstPaise: 5952 + 7627,
      sgstPaise: 5953 + 7627,
      totalAmountPaise: 350000,
    })
  })

  it('shares an offer discount across the lines by amount before taxing them', async () => {
    seedHaircutAndFacial()
    harness.versions = [version('999721', 500), version('999722', 1800)]
    // ₹100.01 off: 7,143.57 and 2,857.43 by proportion; the odd paisa goes to
    // the larger remainder, the haircut.
    // A legacy admin offer links no services, so it covers every line.
    dbMocks.getOfferById.mockResolvedValue({
      id: 'off_flat',
      name: '₹100.01 off',
      isActive: true,
      offerType: 'flat',
      discountPercentage: null,
      discountAmountPaise: 10001,
      comboPricePaise: null,
      startDate: '2020-01-01',
      endDate: '2999-12-31',
      services: [],
      serviceIds: [],
    } as never)

    const res = await POST(completeWith({ paymentMethod: 'upi', offerId: 'off_flat' }), ctx)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.discountPaise).toBe(10001)
    const [haircut, facial] = harness.lastItems
    expect(haircut).toMatchObject({
      totalPricePaise: 250000,
      discountPaise: 7144,
      taxableValuePaise: 231291,
      taxPaise: 11565,
      cgstPaise: 5782,
      sgstPaise: 5783,
    })
    expect(facial).toMatchObject({
      totalPricePaise: 100000,
      discountPaise: 2857,
      taxableValuePaise: 82325,
      taxPaise: 14818,
      cgstPaise: 7409,
      sgstPaise: 7409,
    })
    expect(harness.lastInvoice).toMatchObject({
      subtotalPaise: 350000,
      discountAmountPaise: 10001,
      taxableValuePaise: 313616,
      gstAmountPaise: 26383,
      cgstPaise: 13191,
      sgstPaise: 13192,
      totalAmountPaise: 339999,
    })
    expect(json.data.invoice.totalPaise).toBe(339999)
    // Gems on what was paid: floor(₹3,399.99) = 33.
    expect(json.data.gemsEarned).toBe(33)
    // The completion records the redemption in its own batch, with the rule
    // snapshot for the invoice and the IST day it uses up.
    expect(harness.lastInvoice?.offer).toEqual({
      id: 'off_flat',
      name: '₹100.01 off',
      type: 'flat',
      value: 10001,
      redeemedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    })
  })

  it('uses the version in force at completion, never a replaced or scheduled one', async () => {
    seed({ status: 'confirmed', totalAmountPaise: 118000 })
    harness.versions = [
      version('999721', 1200, {
        id: 'v_replaced',
        effectiveFrom: new Date('2024-04-01T00:00:00+05:30'),
      }),
      version('999721', 1800, { id: 'v_in_force' }),
      version('999721', 500, { id: 'v_scheduled', effectiveFrom: new Date(Date.now() + DAY_MS) }),
    ]

    const res = await POST(completeRequest('card'), ctx)

    expect(res.status).toBe(200)
    expect(harness.lastItems[0]).toMatchObject({
      taxVersionId: 'v_in_force',
      rateBps: 1800,
      taxableValuePaise: 100000,
      taxPaise: 18000,
    })
  })

  it('records the tax point, financial year and provisional status before live invoicing (TX-10)', async () => {
    seed({ status: 'confirmed' })
    const before = Date.now()

    const res = await POST(completeRequest('cash'), ctx)
    const json = await res.json()

    expect(res.status).toBe(200)
    const inv = harness.lastInvoice as CapturedInvoice
    expect(inv.taxPointAt).toBeInstanceOf(Date)
    expect(inv.taxPointAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(inv.taxPointAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect(inv.financialYear).toBe(financialYearIST(inv.taxPointAt))
    expect(inv.taxReviewStatus).toBe('provisional')
    expect(json.data.invoice).toMatchObject({
      invoiceNumber: 'RS/2627/000001',
      taxReviewStatus: 'provisional',
    })
  })

  it('refuses with 409 when a service has no SAC code, before writing anything', async () => {
    seedHaircutAndFacial()
    harness.sacCodes = new Map([['svc_1', '999721']])

    const res = await POST(completeRequest('cash'), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.TAX_CONFIGURATION_INCOMPLETE)
    expect(json.error.message).toBe(
      'Facial has no tax classification (SAC code). Set it on the service or its category in the CMS.',
    )
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
    expect((harness.booking as FakeBooking).status).toBe('confirmed')
  })

  it('refuses with 409 when the branch has no rate in force — there is no fallback rate', async () => {
    const cases: FakeVersion[][] = [
      [],
      // Only a scheduled rate.
      [version('999721', 500, { effectiveFrom: new Date(Date.now() + DAY_MS) })],
      // Another branch's rate.
      [version('999721', 500, { branchId: OTHER_BRANCH.id })],
      // A rate whose prices don't include tax can't price a tax-inclusive line.
      [version('999721', 500, { pricesIncludeTax: false })],
    ]
    for (const versions of cases) {
      vi.clearAllMocks()
      seed({ status: 'confirmed' })
      harness.versions = versions

      const res = await POST(completeRequest('cash'), ctx)
      const json = await res.json()

      expect(res.status).toBe(409)
      expect(json.error.code).toBe(ERROR_CODES.TAX_CONFIGURATION_INCOMPLETE)
      expect(json.error.message).toMatch(/^Rayasandra has no tax rate in force for SAC 999721\./)
      expect(json.error.details).toEqual({ sacCodes: ['999721'] })
      expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
    }
  })

  it('in live invoicing, needs the branch’s legal name, GSTIN and reviewed rates (TX-08)', async () => {
    seed({ status: 'confirmed' })
    harness.live = true

    const res = await POST(completeRequest('cash'), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.TAX_CONFIGURATION_INCOMPLETE)
    expect(json.error.message).toBe(
      "Rayasandra can't issue invoices yet: it needs its legal name, its GSTIN, reviewed tax rates.",
    )
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
  })

  it('in live invoicing with the issuer details and reviewed rates, the invoice records reviewed', async () => {
    seed({ status: 'confirmed' })
    harness.live = true
    harness.branch = {
      id: TEST_BRANCH.id,
      number: 1,
      name: TEST_BRANCH.name,
      legalName: 'Royal Glow Salon and Spa LLP',
      gstin: '29ABCDE1234F1Z5',
    }
    harness.versions = [version('999721', 500, { reviewStatus: 'reviewed' })]

    const res = await POST(completeRequest('cash'), ctx)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(harness.lastInvoice?.taxReviewStatus).toBe('reviewed')
    expect(json.data.invoice.taxReviewStatus).toBe('reviewed')
  })

  it('passes a stale or repeated completion’s 409 through and queues nothing', async () => {
    for (const error of [
      new AppError({
        code: ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        message: 'This booking is no longer confirmed or in progress.',
        statusCode: 409,
      }),
      new AppError({
        code: ERROR_CODES.CONFLICT,
        message: 'This booking already has an invoice.',
        statusCode: 409,
      }),
    ]) {
      vi.clearAllMocks()
      seed({ status: 'confirmed' })
      dbMocks.completeBookingWithInvoice.mockRejectedValueOnce(error)

      const res = await POST(completeRequest('cash'), ctx)
      const json = await res.json()

      expect(res.status).toBe(409)
      expect(json.error.code).toBe(error.code)
      expect(enqueueMocks.enqueueJob).not.toHaveBeenCalled()
    }
  })
})

describe('POST /api/bookings/[id]/complete — offers (multi-branch offers.md)', () => {
  // ₹2,500 haircut and ₹1,000 facial at 5%.
  function seedHaircutAndFacial(overrides: Partial<FakeBooking> = {}): void {
    seed({
      totalAmountPaise: 350000,
      services: [service('svc_1', 'Haircut', 250000), service('svc_2', 'Facial', 100000, 'stf_2')],
      ...overrides,
    })
  }

  function offerRow(over: Record<string, unknown> = {}) {
    return {
      id: 'cms_offer_7',
      name: '20% off facials',
      isActive: true,
      offerType: 'percentage',
      discountPercentage: 20,
      discountAmountPaise: null,
      comboPricePaise: null,
      startDate: '2020-01-01',
      endDate: '2999-12-31',
      services: [{ id: 'svc_2', name: 'Facial' }],
      serviceIds: ['svc_2'],
      ...over,
    }
  }

  it('takes the rule off the linked lines only and keeps its snapshot', async () => {
    seedHaircutAndFacial()
    dbMocks.getOfferById.mockResolvedValue(offerRow() as never)

    const res = await POST(completeWith({ paymentMethod: 'cash', offerId: 'cms_offer_7' }), ctx)
    const json = await res.json()

    expect(res.status).toBe(200)
    // 20% of the ₹1,000 facial; the haircut keeps its full price.
    expect(json.data.discountPaise).toBe(20000)
    const [haircut, facial] = harness.lastItems
    expect(haircut).toMatchObject({ discountPaise: 0, taxableValuePaise: 238095, taxPaise: 11905 })
    expect(facial).toMatchObject({ discountPaise: 20000, taxableValuePaise: 76190, taxPaise: 3810 })
    expect(harness.lastInvoice).toMatchObject({
      subtotalPaise: 350000,
      discountAmountPaise: 20000,
      totalAmountPaise: 330000,
    })
    expect(harness.lastInvoice?.offer).toMatchObject({
      id: 'cms_offer_7',
      name: '20% off facials',
      type: 'percentage',
      value: 20,
    })
  })

  it('prices a combo against its linked lines', async () => {
    seedHaircutAndFacial()
    dbMocks.getOfferById.mockResolvedValue(
      offerRow({
        name: 'Haircut + facial for ₹2,999',
        offerType: 'combo_price',
        discountPercentage: null,
        comboPricePaise: 299900,
        services: [
          { id: 'svc_1', name: 'Haircut' },
          { id: 'svc_2', name: 'Facial' },
        ],
        serviceIds: ['svc_1', 'svc_2'],
      }) as never,
    )

    const res = await POST(completeWith({ paymentMethod: 'upi', offerId: 'cms_offer_7' }), ctx)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.discountPaise).toBe(50100)
    expect(harness.lastInvoice?.totalAmountPaise).toBe(299900)
    expect(harness.lastInvoice?.offer).toMatchObject({ type: 'combo_price', value: 299900 })
  })

  it.each([
    [
      'covers no service on the booking',
      offerRow({ services: [{ id: 'svc_9', name: 'Pedicure' }], serviceIds: ['svc_9'] }),
      "This offer doesn't cover any service on this booking.",
    ],
    [
      'is a combo missing a service',
      offerRow({
        offerType: 'combo_price',
        discountPercentage: null,
        comboPricePaise: 99900,
        services: [
          { id: 'svc_1', name: 'Haircut' },
          { id: 'svc_9', name: 'Classic Pedicure' },
        ],
        serviceIds: ['svc_1', 'svc_9'],
      }),
      'This combo also needs Classic Pedicure on the booking.',
    ],
  ])('refuses an offer that %s (409) and writes nothing', async (_label, offer, message) => {
    seedHaircutAndFacial()
    dbMocks.getOfferById.mockResolvedValue(offer as never)

    const res = await POST(completeWith({ paymentMethod: 'cash', offerId: 'cms_offer_7' }), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.OFFER_NOT_APPLICABLE)
    expect(json.error.message).toBe(message)
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
  })

  it('refuses an offer on a booking made with gems (409)', async () => {
    seedHaircutAndFacial({ isGemsRedemption: true })
    dbMocks.getOfferById.mockResolvedValue(offerRow() as never)

    const res = await POST(completeWith({ paymentMethod: 'cash', offerId: 'cms_offer_7' }), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.message).toBe('An offer cannot be combined with gems on the same booking.')
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
  })

  it('refuses a second offer the same IST day before writing (409)', async () => {
    seedHaircutAndFacial()
    dbMocks.getOfferById.mockResolvedValue(offerRow() as never)
    // Once: clearAllMocks keeps implementations, so a lasting one would leak.
    dbMocks.getOfferRedemptionForCustomerOnDate.mockResolvedValueOnce({ id: 'red_1' })

    const res = await POST(completeWith({ paymentMethod: 'cash', offerId: 'cms_offer_7' }), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.message).toBe('This customer has already used an offer today.')
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
  })

  it('reads the offer’s last day on the IST calendar', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-30T18:45:00.000Z'), toFake: ['Date'] })
    try {
      // 00:15 IST on 01/12: the offer ended on 30/11, though UTC still says 30/11.
      seedHaircutAndFacial()
      dbMocks.getOfferById.mockResolvedValue(offerRow({ endDate: '2026-11-30' }) as never)

      const res = await POST(completeWith({ paymentMethod: 'cash', offerId: 'cms_offer_7' }), ctx)
      const json = await res.json()

      expect(res.status).toBe(409)
      expect(json.error.code).toBe(ERROR_CODES.OFFER_EXPIRED)
      expect(dbMocks.getOfferRedemptionForCustomerOnDate).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('passes the write’s offer refusals through and queues nothing', async () => {
    for (const error of [
      new AppError({
        code: ERROR_CODES.OFFER_EXPIRED,
        message:
          'This offer ended or was retired just now. Complete without it, or choose another.',
        statusCode: 409,
      }),
      new AppError({
        code: ERROR_CODES.OFFER_NOT_APPLICABLE,
        message: 'This customer has already used an offer today. Complete without it.',
        statusCode: 409,
      }),
    ]) {
      vi.clearAllMocks()
      seedHaircutAndFacial()
      dbMocks.getOfferById.mockResolvedValue(offerRow() as never)
      dbMocks.completeBookingWithInvoice.mockRejectedValueOnce(error)

      const res = await POST(completeWith({ paymentMethod: 'cash', offerId: 'cms_offer_7' }), ctx)
      const json = await res.json()

      expect(res.status).toBe(409)
      expect(json.error.message).toBe(error.message)
      expect(enqueueMocks.enqueueJob).not.toHaveBeenCalled()
    }
  })
})

describe('POST /api/bookings/[id]/complete — the payment method', () => {
  it('needs how the customer paid for an ordinary booking, billing nothing without it (400)', async () => {
    seed({ status: 'confirmed' })

    const res = await POST(completeWith({}), ctx)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.details).toEqual({ paymentMethod: ['Choose how the customer paid.'] })
    expect(dbMocks.completeBookingWithInvoice).not.toHaveBeenCalled()
    expect((harness.booking as FakeBooking).status).toBe('confirmed')
  })

  it('rejects a payment method it does not know (400)', async () => {
    seed({ status: 'confirmed' })

    const res = await POST(completeRequest('cheque'), ctx)

    expect(res.status).toBe(400)
    expect(dbMocks.getBookingForAdmin).not.toHaveBeenCalled()
  })
})

describe('POST /api/bookings/[id]/complete — membership sessions (membership-scheduling.md)', () => {
  it('consumes the held minutes with a ₹0 session invoice at the branch’s rates (TX-07)', async () => {
    seedSession()

    const res = await POST(completeWith({}), ctx)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toMatchObject({
      invoice: {
        invoiceNumber: 'RS/2627/000002',
        totalPaise: 0,
        gstPaise: 0,
        taxReviewStatus: 'provisional',
      },
      gemsEarned: 0,
      discountPaise: 0,
      gemsRedeemed: 0,
      gemsRedeemedServiceId: null,
      remainingMinutes: 480,
    })
    const session = harness.lastSession as CapturedSession
    expect(session).toMatchObject({
      bookingId: BOOKING_ID,
      branchId: TEST_BRANCH.id,
      changedById: 'u_admin',
      // The selling branch owes the delivering one this share of the value.
      settlement: { shareBps: 10_000, gemValuePaise: 100 },
      lines: [
        {
          serviceId: 'svc_aroma',
          serviceNameSnapshot: 'Aroma 60',
          staffNameSnapshot: 'Staff stf_1',
        },
        {
          serviceId: 'svc_scrub',
          serviceNameSnapshot: 'Scrub 30',
          staffNameSnapshot: 'Staff stf_2',
        },
      ],
    })
    // A zero value is not an exemption: each line records its SAC code and
    // the branch's rate in force for it.
    expect(session.invoice.lineTax).toEqual([
      { sacCode: '999723', taxVersionId: `tax_${TEST_BRANCH.id}_999723`, rateBps: 500 },
      { sacCode: '999723', taxVersionId: `tax_${TEST_BRANCH.id}_999723`, rateBps: 500 },
    ])
    expect(session.invoice.taxReviewStatus).toBe('provisional')
    expect(session.invoice.financialYear).toBe(financialYearIST(session.invoice.taxPointAt))
    expect(dbMocks.getBranchTaxVersions).toHaveBeenCalledWith(TEST_BRANCH.id)
  })

  it('emails no invoice and queues no follow-up for a ₹0 session', async () => {
    seedSession()

    const res = await POST(completeWith({}), ctx)

    expect(res.status).toBe(200)
    expect(enqueueMocks.enqueueJob).not.toHaveBeenCalled()
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
  })

  it('ignores a payment method: the membership already paid for the minutes', async () => {
    seedSession()

    const res = await POST(completeWith({ paymentMethod: 'cash' }), ctx)

    expect(res.status).toBe(200)
    expect(dbMocks.completeMembershipSession).toHaveBeenCalledOnce()
    expect(harness.lastSession).not.toHaveProperty('paymentMethod')
  })

  it.each([
    ['an offer', { offerId: 'off_1' }],
    ['gems for a service', { gemsRedeemedServiceId: 'svc_aroma' }],
    ['gems (legacy flag)', { redeemGems: true }],
  ])('refuses %s on a session, completing nothing (400)', async (_label, adjustment) => {
    seedSession()

    const res = await POST(completeWith(adjustment), ctx)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.message).toBe('A membership session takes no offer or gems.')
    expect(dbMocks.getOfferById).not.toHaveBeenCalled()
    expect(dbMocks.completeMembershipSession).not.toHaveBeenCalled()
    expect((harness.booking as FakeBooking).status).toBe('in_progress')
  })

  it('refuses a session nobody is assigned to (409)', async () => {
    seedSession({ services: [{ ...service('svc_aroma', 'Aroma 60', 0), staffId: null }] })

    const res = await POST(completeWith({}), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.message).toBe(
      'Nobody is assigned to this session. Assign who is doing it, then complete it.',
    )
    expect(dbMocks.completeMembershipSession).not.toHaveBeenCalled()
  })

  it('refuses a session whose service has no SAC code, completing nothing (409)', async () => {
    seedSession()
    harness.sacCodes = new Map([['svc_aroma', '999723']])

    const res = await POST(completeWith({}), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.TAX_CONFIGURATION_INCOMPLETE)
    expect(dbMocks.completeMembershipSession).not.toHaveBeenCalled()
    expect((harness.booking as FakeBooking).status).toBe('in_progress')
  })

  it("refuses while the settlement settings can't be read, completing nothing (409)", async () => {
    seedSession()
    dbMocks.getSettlementSetting.mockRejectedValueOnce(
      new AppError({
        code: ERROR_CODES.SETTLEMENT_SETTINGS_INVALID,
        message: "The settlement settings can't be read.",
        statusCode: 409,
      }),
    )

    const res = await POST(completeWith({}), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.SETTLEMENT_SETTINGS_INVALID)
    expect(dbMocks.completeMembershipSession).not.toHaveBeenCalled()
  })

  it('answers 409 when the session completed or changed meanwhile', async () => {
    seedSession()
    dbMocks.completeMembershipSession.mockResolvedValueOnce({
      ok: false,
      reason: 'not_in_progress',
    })

    const res = await POST(completeWith({}), ctx)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toMatchObject({
      code: ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
      message: 'This session was completed or changed meanwhile. Reload it to see where it stands.',
    })
  })

  it('treats a session at another branch as not found', async () => {
    seedSession({ branchId: OTHER_BRANCH.id })

    const res = await POST(completeWith({}), ctx)

    expect(res.status).toBe(404)
    expect(dbMocks.completeMembershipSession).not.toHaveBeenCalled()
  })
})
