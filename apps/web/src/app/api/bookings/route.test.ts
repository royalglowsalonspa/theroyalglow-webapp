// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : bookings/route.test
 * Scope        : Unit + property tests for GET|POST /api/bookings (customer)
 *
 * Description  : Vitest unit tests and `fast-check` property-based tests for the
 *                customer booking COLLECTION route (apps/web/src/app/api/bookings/
 *                route.ts). Covers:
 *                  - 1.9   Unauthenticated gate (GET + POST → UNAUTHENTICATED 401)
 *                  - 13.5  Property 11 — each selected service is snapshotted
 *                  - 13.6  Property 12 — mixed service types are rejected (400)
 *                  - 13.7  Property 13 — walk-in bookings start confirmed
 *                  - 13.9  Edge guards: empty serviceIds → 400, forced
 *                          unavailable slot → BOOKING_SLOT_UNAVAILABLE 409
 *
 * Approach     : `@/lib/api/session` (requireSession) and `@rgss/db/queries`
 *                (getServicesByIds, getBranchById, getDefaultStaffForService,
 *                createBookingWithServices, getBookingsByCustomer) are mocked
 *                with in-memory fakes — NO real DB or network. `@/lib/jobs/enqueue`
 *                is mocked to a no-op so best-effort job enqueues never run.
 *                `@rgss/business` stays REAL (pure functions). The route's
 *                exported handler is invoked directly with a constructed Request
 *                and the JSON envelope + status are asserted.
 *
 * Layer        : Testing
 *
 * Notes        : Runs in the `node` environment (server route handlers).
 *                Property tests run a minimum of 100 iterations.
 *                Validates: Requirements 5.1, 5.3, 5.4, 5.7, 5.8, 5.9, 6.1
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock seams. The session guard, the data-access layer, and the best-effort job
// enqueue are mocked so the handlers run without a real session, a live Neon
// connection, or a QStash publish. `@rgss/business` is intentionally NOT
// mocked — its functions (pricing, slot rules, booking-number) are pure.
// ---------------------------------------------------------------------------
const sessionMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getServicesByIds: vi.fn(),
  getBranchById: vi.fn(),
  getDefaultStaffForService: vi.fn(),
  createBookingWithServices: vi.fn(),
  getBookingsByCustomer: vi.fn(),
}))

const enqueueMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: enqueueMock }))

// Route handlers under test (imported after the mocks are registered).
import { GET, POST } from './route'

// ---------------------------------------------------------------------------
// Shared types + helpers
// ---------------------------------------------------------------------------
type ServiceType = 'salon' | 'spa'

type FakeService = {
  id: string
  name: string
  pricePaise: number
  durationMinutes: number
  serviceType: ServiceType
  isActive: boolean
}

const CUSTOMER_SESSION = { user: { id: 'cust_1', role: 'customer' } }

// In-memory catalogue + branch backing the query-layer fakes.
let fakeServices: Map<string, FakeService>
let fakeBranch: { id: string; code: string; status: string } | null

function setServices(services: FakeService[]): void {
  fakeServices = new Map(services.map((s) => [s.id, s]))
}

function postRequest(body: unknown): Request {
  return new Request('https://theroyalglow.in/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest(query = ''): Request {
  return new Request(`https://theroyalglow.in/api/bookings${query}`)
}

// The collection route has no dynamic params, but its handlers are typed
// `(req, ctx) => Promise<Response>` via withErrorHandler. Pass an empty params
// context to satisfy the signature without affecting behaviour.
const ROUTE_CTX = { params: Promise.resolve({}) } as never

const unauthenticated = () =>
  new AppError({
    code: ERROR_CODES.UNAUTHENTICATED,
    message: 'You must be signed in.',
    statusCode: 401,
  })

beforeEach(() => {
  vi.clearAllMocks()

  // Default: an authenticated customer.
  sessionMocks.requireSession.mockResolvedValue(CUSTOMER_SESSION)

  // Default operational branch.
  fakeBranch = { id: 'br_1', code: 'RS', status: 'operational' }
  fakeServices = new Map()

  // Query-layer fakes wired to the in-memory store.
  dbMocks.getBranchById.mockImplementation(async (id: string) =>
    fakeBranch && fakeBranch.id === id ? fakeBranch : null,
  )
  dbMocks.getServicesByIds.mockImplementation(async (ids: string[]) =>
    ids.map((id) => fakeServices.get(id)).filter((s): s is FakeService => Boolean(s)),
  )
  dbMocks.getDefaultStaffForService.mockResolvedValue('staff_1')
  // Echo the booking's generated number + status back so callers can assert them.
  dbMocks.createBookingWithServices.mockImplementation(
    async (booking: { bookingNumber: string; status: string }) => ({
      id: 'bk_generated_1',
      bookingNumber: booking.bookingNumber,
      status: booking.status,
    }),
  )
  dbMocks.getBookingsByCustomer.mockResolvedValue([])

  // enqueueJob is best-effort and mocked to a no-op.
  enqueueMock.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

// A single service. ids are assigned by the caller to guarantee uniqueness.
const serviceArb = (type?: ServiceType) =>
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 24 }),
    pricePaise: fc.integer({ min: 1, max: 1_000_000 }),
    // Bounded so the total duration of up to 5 services starting at 10:00
    // always finishes before the 21:00 close (5 * 120 = 600 min ≤ 660).
    durationMinutes: fc.integer({ min: 15, max: 120 }),
    serviceType: type ? fc.constant(type) : fc.constantFrom<ServiceType>('salon', 'spa'),
  })

// A set of 1–5 services all sharing one (randomly chosen) service type, with
// unique ids assigned by index.
const uniformServicesArb = fc
  .tuple(
    fc.constantFrom<ServiceType>('salon', 'spa'),
    fc.array(serviceArb(), { minLength: 1, maxLength: 5 }),
  )
  .map(([type, specs]) =>
    specs.map(
      (s, i): FakeService => ({
        ...s,
        id: `svc_${i}`,
        serviceType: type,
        isActive: true,
      }),
    ),
  )

// A set of 1–5 services with independently-random types (may be mixed), unique
// ids assigned by index.
const possiblyMixedServicesArb = fc
  .array(serviceArb(), { minLength: 1, maxLength: 5 })
  .map((specs) =>
    specs.map(
      (s, i): FakeService => ({
        ...s,
        id: `svc_${i}`,
        isActive: true,
      }),
    ),
  )

// ===========================================================================
// 1.9 Unauthenticated gate — GET + POST → UNAUTHENTICATED 401
//     Validates: Requirements 5.1, 6.1
// ===========================================================================
describe('Unauthenticated gate (Task 1.9)', () => {
  it('GET /api/bookings → 401 UNAUTHENTICATED with no session', async () => {
    sessionMocks.requireSession.mockRejectedValue(unauthenticated())

    const res = await GET(getRequest(), ROUTE_CTX)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: ERROR_CODES.UNAUTHENTICATED,
      statusCode: 401,
      requestId: expect.any(String),
    })
    // The guard short-circuits before any data access.
    expect(dbMocks.getBookingsByCustomer).not.toHaveBeenCalled()
  })

  it('POST /api/bookings → 401 UNAUTHENTICATED with no session', async () => {
    sessionMocks.requireSession.mockRejectedValue(unauthenticated())

    const res = await POST(
      postRequest({
        branchId: 'br_1',
        serviceType: 'salon',
        bookingDate: '2026-06-10',
        startTime: '10:00',
        serviceIds: ['svc_0'],
      }),
      ROUTE_CTX,
    )
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: ERROR_CODES.UNAUTHENTICATED,
      statusCode: 401,
      requestId: expect.any(String),
    })
    // No booking is created when unauthenticated.
    expect(dbMocks.createBookingWithServices).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// 13.5 — Property 11: Each selected service is snapshotted
//        Validates: Requirements 5.7
// ===========================================================================
describe('Property 11: each selected service is snapshotted (Task 13.5)', () => {
  // Feature: backend-api, Property 11: Each selected service is snapshotted
  it('POST writes one snapshot per service with matching name + price-paise', async () => {
    await fc.assert(
      fc.asyncProperty(uniformServicesArb, async (services) => {
        vi.clearAllMocks()
        sessionMocks.requireSession.mockResolvedValue(CUSTOMER_SESSION)
        setServices(services)
        dbMocks.getBranchById.mockResolvedValue(fakeBranch)
        dbMocks.getServicesByIds.mockImplementation(async (ids: string[]) =>
          ids.map((id) => fakeServices.get(id)).filter((s): s is FakeService => Boolean(s)),
        )
        dbMocks.getDefaultStaffForService.mockResolvedValue('staff_1')
        dbMocks.createBookingWithServices.mockImplementation(
          async (booking: { bookingNumber: string; status: string }) => ({
            id: 'bk_generated_1',
            bookingNumber: booking.bookingNumber,
            status: booking.status,
          }),
        )
        enqueueMock.mockResolvedValue(undefined)

        const res = await POST(
          postRequest({
            branchId: 'br_1',
            serviceType: services[0]?.serviceType,
            bookingDate: '2026-06-10',
            startTime: '10:00',
            serviceIds: services.map((s) => s.id),
          }),
          ROUTE_CTX,
        )

        expect(res.status).toBe(201)
        expect(dbMocks.createBookingWithServices).toHaveBeenCalledOnce()

        // Second positional arg is the snapshotted booking_service rows.
        const serviceRows = dbMocks.createBookingWithServices.mock.calls[0]?.[1] as Array<{
          serviceId: string
          serviceNameSnapshot: string
          priceAtBookingPaise: number
        }>

        // Exactly one snapshot row per selected service.
        expect(serviceRows).toHaveLength(services.length)

        // Each snapshot's name + price-paise match the source service.
        for (const row of serviceRows) {
          const source = fakeServices.get(row.serviceId)
          expect(source).toBeDefined()
          expect(row.serviceNameSnapshot).toBe(source?.name)
          expect(row.priceAtBookingPaise).toBe(source?.pricePaise)
        }
      }),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// 13.6 — Property 12: Mixed service types are rejected
//        Validates: Requirements 5.4
// ===========================================================================
describe('Property 12: mixed service types are rejected (Task 13.6)', () => {
  // Feature: backend-api, Property 12: Mixed service types are rejected
  it('POST → VALIDATION_ERROR 400 iff selected services span >1 service type', async () => {
    await fc.assert(
      fc.asyncProperty(possiblyMixedServicesArb, async (services) => {
        vi.clearAllMocks()
        sessionMocks.requireSession.mockResolvedValue(CUSTOMER_SESSION)
        setServices(services)
        dbMocks.getBranchById.mockResolvedValue(fakeBranch)
        dbMocks.getServicesByIds.mockImplementation(async (ids: string[]) =>
          ids.map((id) => fakeServices.get(id)).filter((s): s is FakeService => Boolean(s)),
        )
        dbMocks.getDefaultStaffForService.mockResolvedValue('staff_1')
        dbMocks.createBookingWithServices.mockImplementation(
          async (booking: { bookingNumber: string; status: string }) => ({
            id: 'bk_generated_1',
            bookingNumber: booking.bookingNumber,
            status: booking.status,
          }),
        )
        enqueueMock.mockResolvedValue(undefined)

        const distinctTypes = new Set(services.map((s) => s.serviceType))
        const isMixed = distinctTypes.size > 1

        // Request the type of the first service so a uniform set always matches
        // (isolating the mixed-type rejection as the only failure source).
        const res = await POST(
          postRequest({
            branchId: 'br_1',
            serviceType: services[0]?.serviceType,
            bookingDate: '2026-06-10',
            startTime: '10:00',
            serviceIds: services.map((s) => s.id),
          }),
          ROUTE_CTX,
        )
        const body = await res.json()

        if (isMixed) {
          expect(res.status).toBe(400)
          expect(body.success).toBe(false)
          expect(body.error).toMatchObject({
            code: ERROR_CODES.VALIDATION_ERROR,
            statusCode: 400,
          })
          expect(dbMocks.createBookingWithServices).not.toHaveBeenCalled()
        } else {
          expect(res.status).toBe(201)
          expect(body.success).toBe(true)
        }
      }),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// 13.7 — Property 13: Walk-in bookings start confirmed
//        Validates: Requirements 5.9
// ===========================================================================
describe('Property 13: walk-in bookings start confirmed (Task 13.7)', () => {
  // Feature: backend-api, Property 13: Walk-in bookings start confirmed
  it('created status is confirmed iff isWalkin else pending', async () => {
    await fc.assert(
      fc.asyncProperty(uniformServicesArb, fc.boolean(), async (services, isWalkin) => {
        vi.clearAllMocks()
        sessionMocks.requireSession.mockResolvedValue(CUSTOMER_SESSION)
        setServices(services)
        dbMocks.getBranchById.mockResolvedValue(fakeBranch)
        dbMocks.getServicesByIds.mockImplementation(async (ids: string[]) =>
          ids.map((id) => fakeServices.get(id)).filter((s): s is FakeService => Boolean(s)),
        )
        dbMocks.getDefaultStaffForService.mockResolvedValue('staff_1')
        dbMocks.createBookingWithServices.mockImplementation(
          async (booking: { bookingNumber: string; status: string }) => ({
            id: 'bk_generated_1',
            bookingNumber: booking.bookingNumber,
            status: booking.status,
          }),
        )
        enqueueMock.mockResolvedValue(undefined)

        const res = await POST(
          postRequest({
            branchId: 'br_1',
            serviceType: services[0]?.serviceType,
            bookingDate: '2026-06-10',
            startTime: '10:00',
            serviceIds: services.map((s) => s.id),
            isWalkin,
          }),
          ROUTE_CTX,
        )
        const body = await res.json()

        expect(res.status).toBe(201)
        expect(body.data.status).toBe(isWalkin ? 'confirmed' : 'pending')

        // The status persisted via the query layer matches the same rule.
        const persisted = dbMocks.createBookingWithServices.mock.calls[0]?.[0] as { status: string }
        expect(persisted.status).toBe(isWalkin ? 'confirmed' : 'pending')
      }),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// 13.9 — Edge guards on booking creation
//        Validates: Requirements 5.3, 5.8
// ===========================================================================
describe('Booking-create edge guards (Task 13.9)', () => {
  it('empty serviceIds → VALIDATION_ERROR 400 (Req 5.3)', async () => {
    setServices([
      {
        id: 'svc_0',
        name: 'Cut',
        pricePaise: 50000,
        durationMinutes: 30,
        serviceType: 'salon',
        isActive: true,
      },
    ])

    const res = await POST(
      postRequest({
        branchId: 'br_1',
        serviceType: 'salon',
        bookingDate: '2026-06-10',
        startTime: '10:00',
        serviceIds: [],
      }),
      ROUTE_CTX,
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode: 400,
    })
    expect(dbMocks.createBookingWithServices).not.toHaveBeenCalled()
  })

  it('forced unavailable slot → BOOKING_SLOT_UNAVAILABLE 409 (Req 5.8)', async () => {
    setServices([
      {
        id: 'svc_0',
        name: 'Cut',
        pricePaise: 50000,
        durationMinutes: 30,
        serviceType: 'salon',
        isActive: true,
      },
    ])

    // 09:00 is before the 10:00 open → not a bookable slot start.
    const res = await POST(
      postRequest({
        branchId: 'br_1',
        serviceType: 'salon',
        bookingDate: '2026-06-10',
        startTime: '09:00',
        serviceIds: ['svc_0'],
      }),
      ROUTE_CTX,
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
      statusCode: 409,
    })
    expect(dbMocks.createBookingWithServices).not.toHaveBeenCalled()
  })
})
