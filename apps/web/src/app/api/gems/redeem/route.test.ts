// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-08-2026 & Updated - 04-08-2026
 *
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : gems/redeem/route.test
 * Scope        : Route tests — POST /api/gems/redeem (Gems Redemption)
 *
 * Feature      : gems-redemption
 * Task         : 7.3 — Route tests with an in-memory fake data layer
 *
 * Description  : Vitest tests for the customer gems-redemption route
 *                (apps/web/src/app/api/gems/redeem/route.ts). `@/lib/api/session`
 *                and `@rgss/db/queries` are replaced with in-memory fakes — NO
 *                real DB, no network. `@rgss/business` stays REAL, so the actual
 *                `assertRedeemable`, `isBookableSlotStart`, `addMinutesToTime`
 *                and `generateBookingNumber` run.
 *
 *                The `redeemServiceWithGems` fake reproduces the query-layer
 *                semantics exactly (see packages/db/src/queries/redemptions.ts):
 *                  known redemption_key          → replay resolved FIRST, ahead
 *                                                  of the balance guard
 *                  balance < cost                → GEMS_INSUFFICIENT_BALANCE,
 *                                                  nothing persisted
 *                  otherwise                     → all four writes together
 *
 *                The `findBookingByRedemptionKey` fake mirrors the real query's
 *                ownership scoping: a key resolves only for the customer who owns
 *                the booking it created.
 *
 * Cases covered :
 * - insufficient balance → 409, balance unchanged, nothing persisted
 * - success → 201, isGemsRedemption/gemsRedeemed/₹0/offerId=null, linked txn
 * - concurrency / double-spend → at most the feasible subset succeeds
 * - idempotency → the same key twice deducts once
 * - idempotency → a replay whose REMAINING balance is below the cost still
 *   returns the existing booking (200), never 409
 * - idempotency → an unseen key with a short balance still 409s (gate intact)
 * - idempotency → another customer's key never resolves as this customer's replay
 * - ordering → no replay lookup before authentication or Zod validation
 * - auth → no session ⇒ 401 and no write
 * - re-validation → live inactive/non-redeemable service ⇒ rejected
 * - client gems amount ignored → the SERVER cost is charged
 * - not found → unknown serviceId ⇒ 404
 * - no loyalty account ⇒ balance 0 ⇒ non-zero cost rejects as insufficient
 *
 * Validates: Requirements 3.2, 4.1, 4.2, 4.3, 5.2, 5.3, 5.4, 6.1, 7.1, 7.2,
 *            7.3, 8.1, 8.2, 8.3, 9.1, 10.1, 10.2, 11.1, 11.2, 11.3
 *
 * Tech Stack   : Vitest (node environment)
 * Layer        : Testing (API)
 *
 * Notes        : Money stays integer paise; gems stay whole integers. The slot
 *                10:00 with a 30-minute service is on the 30-minute grid inside
 *                opening hours, so the real slot rule always admits it.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock seams. Only the session guard and the data-access layer are faked.
// ---------------------------------------------------------------------------
const sessionMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
}))

// This factory is EXHAUSTIVE: `vi.mock` replaces the whole `@rgss/db/queries`
// module, so any query the route calls that is missing here is `undefined` at
// test time and every route test throws. Add an entry whenever the route reaches
// for a new query.
const dbMocks = vi.hoisted(() => ({
  findBookingByRedemptionKey: vi.fn(),
  getBranchById: vi.fn(),
  getDefaultStaffForService: vi.fn(),
  getLoyaltySummary: vi.fn(),
  getOrCreateLoyaltyAccount: vi.fn(),
  getRedeemableServiceById: vi.fn(),
  redeemServiceWithGems: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

// Route handler under test (imported after the mocks are registered).
import { POST } from './route'

// ---------------------------------------------------------------------------
// In-memory data layer
// ---------------------------------------------------------------------------
type FakeService = {
  id: string
  name: string
  serviceType: 'salon' | 'spa'
  durationMinutes: number
  pricePaise: number
  isActive: boolean
  gemsRedeemable: boolean
  gemsRequired: number | null
}

type FakeBooking = {
  id: string
  bookingNumber: string
  customerId: string
  status: string
  totalAmountPaise: number
  isGemsRedemption: boolean
  gemsRedeemed: number
  offerId: string | null
  redemptionKey: string
  serviceId: string
  priceAtBookingPaise: number
}

type FakeTransaction = {
  loyaltyAccountId: string
  type: 'redeemed'
  gemsAmount: number
  bookingId: string
}

type FakeStore = {
  account: {
    id: string
    customerId: string
    gemsBalance: number
    totalGemsEarned: number
    totalGemsRedeemed: number
  }
  /** null models a customer with no loyalty account row yet (Req 11.3). */
  summaryVisible: boolean
  services: Map<string, FakeService>
  branch: { id: string; code: string; status: string } | null
  staffId: string | null
  bookings: FakeBooking[]
  transactions: FakeTransaction[]
}

let store: FakeStore
let bookingSeq = 0

const CUSTOMER_SESSION = { user: { id: 'cust_1', role: 'customer' } }

function redeemableService(overrides: Partial<FakeService> = {}): FakeService {
  return {
    id: 'svc_facial',
    name: 'Signature Facial',
    serviceType: 'salon',
    durationMinutes: 30,
    pricePaise: 250_000,
    isActive: true,
    gemsRedeemable: true,
    gemsRequired: 500,
    ...overrides,
  }
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    serviceId: 'svc_facial',
    branchId: 'br_1',
    bookingDate: '2026-06-10',
    startTime: '10:00',
    idempotencyKey: 'idem-key-0001',
    ...overrides,
  }
}

function postRequest(payload: unknown): Request {
  return new Request('https://theroyalglow.in/api/gems/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// withErrorHandler types handlers as (req, ctx); this route has no dynamic params.
const ROUTE_CTX = { params: Promise.resolve({}) } as never

/**
 * The customer-scoped replay lookup, faithful to the real query: a redemption_key
 * resolves ONLY for the customer who owns the booking. The key is client-supplied,
 * so an unscoped lookup would let one customer resolve another's booking.
 */
function fakeFindBookingByRedemptionKey(redemptionKey: string, customerId: string) {
  const found = store.bookings.find(
    (b) => b.redemptionKey === redemptionKey && b.customerId === customerId,
  )
  return found ? { id: found.id, bookingNumber: found.bookingNumber } : null
}

/**
 * The guarded write, faithful to the real query function:
 *  1. the pre-write `redemption_key` lookup — an already-honoured key resolves to
 *     its booking BEFORE, and so independently of, the balance guard
 *  2. `UPDATE … WHERE gems_balance >= req` — 0 rows ⇒ nothing persists at all
 *  3. otherwise the balance, the totals, the booking, the booking_service and
 *     the `redeemed` transaction all commit together
 */
function fakeRedeem(input: {
  accountId: string
  customerId: string
  bookingNumber: string
  gemsRequired: number
  serviceId: string
  idempotencyKey: string
}) {
  const existing = fakeFindBookingByRedemptionKey(input.idempotencyKey, input.customerId)
  if (existing) {
    return {
      duplicate: true as const,
      bookingId: existing.id,
      bookingNumber: existing.bookingNumber,
    }
  }

  if (store.account.gemsBalance < input.gemsRequired) {
    throw new AppError({
      code: ERROR_CODES.GEMS_INSUFFICIENT_BALANCE,
      message: 'You do not have enough gems to redeem this service.',
      statusCode: 409,
    })
  }

  bookingSeq += 1
  const bookingId = `bk_${bookingSeq}`
  store.account.gemsBalance -= input.gemsRequired
  store.account.totalGemsRedeemed += input.gemsRequired
  store.bookings.push({
    id: bookingId,
    bookingNumber: input.bookingNumber,
    customerId: input.customerId,
    status: 'pending',
    totalAmountPaise: 0,
    isGemsRedemption: true,
    gemsRedeemed: input.gemsRequired,
    offerId: null,
    redemptionKey: input.idempotencyKey,
    serviceId: input.serviceId,
    priceAtBookingPaise: 0,
  })
  store.transactions.push({
    loyaltyAccountId: input.accountId,
    type: 'redeemed',
    gemsAmount: input.gemsRequired,
    bookingId,
  })

  return {
    bookingId,
    bookingNumber: input.bookingNumber,
    gemsSpent: input.gemsRequired,
    newBalance: store.account.gemsBalance,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  bookingSeq = 0

  store = {
    account: {
      id: 'la_1',
      customerId: 'cust_1',
      gemsBalance: 1000,
      totalGemsEarned: 1000,
      totalGemsRedeemed: 0,
    },
    summaryVisible: true,
    services: new Map([['svc_facial', redeemableService()]]),
    branch: { id: 'br_1', code: 'RS', status: 'operational' },
    staffId: 'staff_1',
    bookings: [],
    transactions: [],
  }

  sessionMocks.requireSession.mockResolvedValue(CUSTOMER_SESSION)

  dbMocks.getOrCreateLoyaltyAccount.mockImplementation(async () => store.account)
  dbMocks.getLoyaltySummary.mockImplementation(async () =>
    store.summaryVisible
      ? {
          balance: store.account.gemsBalance,
          totalEarned: store.account.totalGemsEarned,
          totalRedeemed: store.account.totalGemsRedeemed,
        }
      : null,
  )
  dbMocks.getBranchById.mockImplementation(async (id: string) =>
    store.branch && store.branch.id === id ? store.branch : null,
  )
  dbMocks.getRedeemableServiceById.mockImplementation(
    async (id: string) => store.services.get(id) ?? null,
  )
  dbMocks.getDefaultStaffForService.mockImplementation(async () => store.staffId)
  dbMocks.findBookingByRedemptionKey.mockImplementation(
    async (redemptionKey: string, customerId: string) =>
      fakeFindBookingByRedemptionKey(redemptionKey, customerId),
  )
  dbMocks.redeemServiceWithGems.mockImplementation(
    async (input: Parameters<typeof fakeRedeem>[0]) => fakeRedeem(input),
  )
})

const unauthenticated = () =>
  new AppError({
    code: ERROR_CODES.UNAUTHENTICATED,
    message: 'You must be signed in.',
    statusCode: 401,
  })

// ===========================================================================
describe('POST /api/gems/redeem — authentication and self-scoping', () => {
  it('no session ⇒ 401 UNAUTHENTICATED and nothing is written (Req 8.3)', async () => {
    sessionMocks.requireSession.mockRejectedValue(unauthenticated())

    const res = await POST(postRequest(body()), ROUTE_CTX)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toMatchObject({
      code: ERROR_CODES.UNAUTHENTICATED,
      statusCode: 401,
      requestId: expect.any(String),
    })
    expect(dbMocks.redeemServiceWithGems).not.toHaveBeenCalled()
    // Ordering: the replay lookup sits AFTER the session guard, so an
    // unauthenticated request never reaches the database at all.
    expect(dbMocks.findBookingByRedemptionKey).not.toHaveBeenCalled()
    expect(store.account.gemsBalance).toBe(1000)
    expect(store.bookings).toHaveLength(0)
  })

  it('resolves the loyalty account from the session, never from client ids (Req 8.1, 8.2)', async () => {
    // A hostile body naming someone else's account/customer must be ignored.
    const res = await POST(
      postRequest(body({ accountId: 'la_victim', customerId: 'cust_victim' })),
      ROUTE_CTX,
    )

    expect(res.status).toBe(201)
    expect(dbMocks.getOrCreateLoyaltyAccount).toHaveBeenCalledWith('cust_1')
    const write = dbMocks.redeemServiceWithGems.mock.calls[0]?.[0] as {
      accountId: string
      customerId: string
    }
    expect(write.accountId).toBe('la_1')
    expect(write.customerId).toBe('cust_1')
  })
})

// ===========================================================================
describe('POST /api/gems/redeem — successful redemption', () => {
  it('201 with a ₹0 gems booking, one linked redeemed txn, and the deducted balance', async () => {
    const res = await POST(postRequest(body()), ROUTE_CTX)
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data.gemsSpent).toBe(500)
    // newBalance = balance - cost (Req 4.1)
    expect(json.data.newBalance).toBe(500)
    expect(json.data.bookingNumber).toBe(json.data.reference)
    // BK-{code}-{YYMM}-{H|S}-{5 random} for a salon service.
    expect(json.data.bookingNumber).toMatch(/^BK-RS-\d{4}-H-\d{5}$/)

    // The persisted booking (Req 9.1, 10.1, 10.2)
    expect(store.bookings).toHaveLength(1)
    const booking = store.bookings[0] as FakeBooking
    expect(booking.isGemsRedemption).toBe(true)
    expect(booking.gemsRedeemed).toBe(500)
    expect(booking.totalAmountPaise).toBe(0)
    expect(booking.priceAtBookingPaise).toBe(0)
    expect(booking.offerId).toBeNull()
    expect(booking.status).toBe('pending')
    expect(booking.customerId).toBe('cust_1')

    // Exactly one `redeemed` transaction, stored positive and linked (Req 4.2, 4.5)
    expect(store.transactions).toEqual([
      { loyaltyAccountId: 'la_1', type: 'redeemed', gemsAmount: 500, bookingId: booking.id },
    ])

    // Balance + lifetime total moved by exactly the cost (Req 4.1, 4.3)
    expect(store.account.gemsBalance).toBe(500)
    expect(store.account.totalGemsRedeemed).toBe(500)
  })

  it('passes the end time derived from the live service duration', async () => {
    store.services.set('svc_facial', redeemableService({ durationMinutes: 90 }))

    await POST(postRequest(body()), ROUTE_CTX)

    const write = dbMocks.redeemServiceWithGems.mock.calls[0]?.[0] as {
      startTime: string
      endTime: string
      durationMinutes: number
      serviceName: string
    }
    expect(write.startTime).toBe('10:00')
    expect(write.endTime).toBe('11:30')
    expect(write.durationMinutes).toBe(90)
    expect(write.serviceName).toBe('Signature Facial')
  })
})

// ===========================================================================
describe('POST /api/gems/redeem — insufficient balance', () => {
  it('409 GEMS_INSUFFICIENT_BALANCE with the balance unchanged and nothing persisted (Req 3.2, 11.1)', async () => {
    store.account.gemsBalance = 499

    const res = await POST(postRequest(body()), ROUTE_CTX)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.success).toBe(false)
    expect(json.error.code).toBe(ERROR_CODES.GEMS_INSUFFICIENT_BALANCE)
    // Distinct from the ineligible-service code (Req 11.1).
    expect(json.error.code).not.toBe(ERROR_CODES.GEMS_SERVICE_NOT_REDEEMABLE)

    expect(store.account.gemsBalance).toBe(499)
    expect(store.account.totalGemsRedeemed).toBe(0)
    expect(store.bookings).toHaveLength(0)
    expect(store.transactions).toHaveLength(0)
    expect(dbMocks.redeemServiceWithGems).not.toHaveBeenCalled()
  })

  it('no loyalty account ⇒ balance 0 ⇒ any positive cost rejects as insufficient (Req 11.3)', async () => {
    store.summaryVisible = false

    const res = await POST(postRequest(body()), ROUTE_CTX)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.GEMS_INSUFFICIENT_BALANCE)
    expect(store.bookings).toHaveLength(0)
  })

  it('a guard failure inside the write persists nothing and never 500s (Req 5.2)', async () => {
    // The pre-check passes but the balance drops before the write executes —
    // exactly the race the in-write guard exists for.
    dbMocks.redeemServiceWithGems.mockImplementation(
      async (input: Parameters<typeof fakeRedeem>[0]) => {
        store.account.gemsBalance = input.gemsRequired - 1
        return fakeRedeem(input)
      },
    )

    const res = await POST(postRequest(body()), ROUTE_CTX)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.GEMS_INSUFFICIENT_BALANCE)
    expect(store.bookings).toHaveLength(0)
    expect(store.transactions).toHaveLength(0)
  })
})

// ===========================================================================
describe('POST /api/gems/redeem — execution-time re-validation (Req 7)', () => {
  it('rejects a service that went inactive between browse and redeem (Req 7.1, 7.2)', async () => {
    store.services.set('svc_facial', redeemableService({ isActive: false }))

    const res = await POST(postRequest(body()), ROUTE_CTX)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.code).toBe(ERROR_CODES.GEMS_SERVICE_NOT_REDEEMABLE)
    expect(dbMocks.redeemServiceWithGems).not.toHaveBeenCalled()
    expect(store.account.gemsBalance).toBe(1000)
  })

  it('rejects a service whose gemsRedeemable flag was turned off (Req 7.2)', async () => {
    store.services.set('svc_facial', redeemableService({ gemsRedeemable: false }))

    const res = await POST(postRequest(body()), ROUTE_CTX)

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe(ERROR_CODES.GEMS_SERVICE_NOT_REDEEMABLE)
    expect(store.bookings).toHaveLength(0)
  })

  it('rejects a service whose gemsRequired is null (Req 3.5)', async () => {
    store.services.set('svc_facial', redeemableService({ gemsRequired: null }))

    const res = await POST(postRequest(body()), ROUTE_CTX)

    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe(ERROR_CODES.GEMS_SERVICE_NOT_REDEEMABLE)
    expect(store.bookings).toHaveLength(0)
  })

  it('charges the SERVER-side gemsRequired and ignores any client-sent amount (Req 7.3)', async () => {
    store.services.set('svc_facial', redeemableService({ gemsRequired: 750 }))

    const res = await POST(
      // A client trying to pay 1 gem for a 750-gem service.
      postRequest(body({ gemsRequired: 1, gemsSpent: 1, cost: 1 })),
      ROUTE_CTX,
    )
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.data.gemsSpent).toBe(750)
    expect(json.data.newBalance).toBe(250)
    const write = dbMocks.redeemServiceWithGems.mock.calls[0]?.[0] as { gemsRequired: number }
    expect(write.gemsRequired).toBe(750)
    expect(store.account.gemsBalance).toBe(250)
  })

  it('unknown serviceId ⇒ 404 NOT_FOUND with the balance untouched (Req 11.2)', async () => {
    const res = await POST(postRequest(body({ serviceId: 'svc_missing' })), ROUTE_CTX)
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error.code).toBe(ERROR_CODES.NOT_FOUND)
    expect(store.account.gemsBalance).toBe(1000)
    expect(dbMocks.redeemServiceWithGems).not.toHaveBeenCalled()
  })
})

// ===========================================================================
describe('POST /api/gems/redeem — idempotency and double-spend', () => {
  it('the same idempotencyKey twice deducts once and returns the same reference (Req 6.1)', async () => {
    // The remaining balance still covers the cost here; the case where it does
    // NOT is the one below, and it is the one that used to fail.
    store.account.gemsBalance = 1200

    const first = await POST(postRequest(body({ idempotencyKey: 'retry-key-01' })), ROUTE_CTX)
    const firstJson = await first.json()
    const second = await POST(postRequest(body({ idempotencyKey: 'retry-key-01' })), ROUTE_CTX)
    const secondJson = await second.json()

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(secondJson.data.duplicate).toBe(true)
    expect(secondJson.data.reference).toBe(firstJson.data.reference)

    // Deducted exactly once.
    expect(store.account.gemsBalance).toBe(700)
    expect(store.account.totalGemsRedeemed).toBe(500)
    expect(store.bookings).toHaveLength(1)
    expect(store.transactions).toHaveLength(1)
  })

  it('a replay whose remaining balance is BELOW the cost returns the booking, not 409 (Req 6.1)', async () => {
    // The regression. A customer spends their WHOLE balance, then the request is
    // retried (network blip, double tap, client retry). The remaining balance no
    // longer satisfies `balance >= gemsRequired`, so the route's affordability
    // gate used to reject the retry with 409 GEMS_INSUFFICIENT_BALANCE — telling
    // a customer their already-successful booking failed for want of gems — and
    // the request never reached the query layer that would have resolved the key.
    // The replay lookup now runs BEFORE the gate.
    store.account.gemsBalance = 500 // exactly the cost: spends down to zero

    const first = await POST(postRequest(body({ idempotencyKey: 'spend-it-all' })), ROUTE_CTX)
    const firstJson = await first.json()
    expect(first.status).toBe(201)
    expect(store.account.gemsBalance).toBe(0)

    const retry = await POST(postRequest(body({ idempotencyKey: 'spend-it-all' })), ROUTE_CTX)
    const retryJson = await retry.json()

    expect(retry.status).toBe(200)
    expect(retryJson.success).toBe(true)
    expect(retryJson.data.duplicate).toBe(true)
    expect(retryJson.data.reference).toBe(firstJson.data.reference)
    expect(retryJson.data.bookingNumber).toBe(firstJson.data.bookingNumber)

    // Deducted exactly once, and the replay never reached the write.
    expect(store.account.gemsBalance).toBe(0)
    expect(store.account.totalGemsRedeemed).toBe(500)
    expect(store.bookings).toHaveLength(1)
    expect(store.transactions).toHaveLength(1)
    expect(dbMocks.redeemServiceWithGems).toHaveBeenCalledTimes(1)
  })

  it('a genuine FIRST attempt with insufficient balance still 409s (the gate is intact)', async () => {
    // The replay lookup must not become a way around the balance gate: an unseen
    // key with a short balance is a first attempt and must still be rejected.
    store.account.gemsBalance = 499

    const res = await POST(postRequest(body({ idempotencyKey: 'never-seen-key' })), ROUTE_CTX)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.GEMS_INSUFFICIENT_BALANCE)
    expect(dbMocks.findBookingByRedemptionKey).toHaveBeenCalledWith('never-seen-key', 'cust_1')
    expect(store.account.gemsBalance).toBe(499)
    expect(store.bookings).toHaveLength(0)
    expect(dbMocks.redeemServiceWithGems).not.toHaveBeenCalled()
  })

  it("a key belonging to another customer never resolves as this customer's replay (Req 8.2)", async () => {
    // Keys are client-supplied, so the replay lookup is scoped to the session
    // customer. Customer A guessing customer B's key must not be handed B's
    // booking; it is simply an unseen key for A.
    store.bookings.push({
      id: 'bk_victim',
      bookingNumber: 'BK-RS-2606-H-99999',
      customerId: 'cust_victim',
      status: 'pending',
      totalAmountPaise: 0,
      isGemsRedemption: true,
      gemsRedeemed: 500,
      offerId: null,
      redemptionKey: 'victim-key',
      serviceId: 'svc_facial',
      priceAtBookingPaise: 0,
    })

    const res = await POST(postRequest(body({ idempotencyKey: 'victim-key' })), ROUTE_CTX)
    const json = await res.json()

    expect(dbMocks.findBookingByRedemptionKey).toHaveBeenCalledWith('victim-key', 'cust_1')
    // Not a replay: a fresh redemption for cust_1, and NOT the victim's booking.
    expect(res.status).toBe(201)
    expect(json.data.duplicate).toBeUndefined()
    expect(json.data.bookingNumber).not.toBe('BK-RS-2606-H-99999')
    expect(store.bookings).toHaveLength(2)
    expect(store.bookings.at(-1)?.customerId).toBe('cust_1')
  })

  it('distinct keys create distinct redemptions', async () => {
    await POST(postRequest(body({ idempotencyKey: 'distinct-key-1' })), ROUTE_CTX)
    await POST(postRequest(body({ idempotencyKey: 'distinct-key-2' })), ROUTE_CTX)

    expect(store.bookings).toHaveLength(2)
    expect(store.account.gemsBalance).toBe(0)
    expect(store.account.totalGemsRedeemed).toBe(1000)
  })

  it('concurrent redemptions never overspend and never go negative (Req 5.3, 5.4)', async () => {
    // 3 × 500 gems against a 1000-gem balance: at most two can succeed.
    store.account.gemsBalance = 1000

    const responses = await Promise.all(
      ['concurrent-key-1', 'concurrent-key-2', 'concurrent-key-3'].map((key) =>
        POST(postRequest(body({ idempotencyKey: key })), ROUTE_CTX),
      ),
    )
    const statuses = responses.map((r) => r.status)

    expect(statuses.filter((s) => s === 201)).toHaveLength(2)
    expect(statuses.filter((s) => s === 409)).toHaveLength(1)
    expect(store.account.gemsBalance).toBe(0)
    expect(store.account.gemsBalance).toBeGreaterThanOrEqual(0)
    expect(store.bookings).toHaveLength(2)
    expect(store.transactions).toHaveLength(2)
    expect(store.account.totalGemsRedeemed).toBe(1000)
  })
})

// ===========================================================================
describe('POST /api/gems/redeem — request and slot validation', () => {
  it('a body without an idempotencyKey ⇒ 400 VALIDATION_ERROR, no write (Req 6.2, 11.4)', async () => {
    const { idempotencyKey: _omitted, ...withoutKey } = body()

    const res = await POST(postRequest(withoutKey), ROUTE_CTX)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(json.error.details).toBeDefined()
    expect(dbMocks.redeemServiceWithGems).not.toHaveBeenCalled()
    // Ordering: the replay lookup sits AFTER Zod, so a malformed body never
    // reaches the database either.
    expect(dbMocks.findBookingByRedemptionKey).not.toHaveBeenCalled()
  })

  it('a start time off the slot grid ⇒ 409 BOOKING_SLOT_UNAVAILABLE, no write', async () => {
    // 09:00 is before the 10:00 open.
    const res = await POST(postRequest(body({ startTime: '09:00' })), ROUTE_CTX)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe(ERROR_CODES.BOOKING_SLOT_UNAVAILABLE)
    expect(store.bookings).toHaveLength(0)
  })

  it('a missing or closed branch ⇒ 400 VALIDATION_ERROR, no write', async () => {
    const missing = await POST(postRequest(body({ branchId: 'br_nope' })), ROUTE_CTX)
    expect(missing.status).toBe(400)

    store.branch = { id: 'br_1', code: 'RS', status: 'temporarily_closed' }
    const closed = await POST(postRequest(body()), ROUTE_CTX)
    expect(closed.status).toBe(400)

    expect(store.bookings).toHaveLength(0)
    expect(dbMocks.redeemServiceWithGems).not.toHaveBeenCalled()
  })

  it('no staff available for the service ⇒ 400 VALIDATION_ERROR, no write', async () => {
    store.staffId = null

    const res = await POST(postRequest(body()), ROUTE_CTX)

    expect(res.status).toBe(400)
    expect(store.bookings).toHaveLength(0)
    expect(store.account.gemsBalance).toBe(1000)
  })
})
