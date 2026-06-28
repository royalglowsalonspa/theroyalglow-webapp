// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : customer-routes.preservation.test
 * Scope        : Preservation property tests for the customer route handlers
 *
 * Description  : Property 2 (Preservation) of the web-admin-separation-cleanup
 *                bugfix. Captures a BEHAVIOURAL BASELINE for every customer-
 *                facing route handler that does NOT satisfy the bug condition
 *                (¬isBugCondition(X)), so any regression introduced while the
 *                background-jobs surface is relocated/de-duplicated is caught.
 *
 *                Observation-first: these assertions encode the response
 *                envelope the UNFIXED tree produces today; they MUST PASS on the
 *                unfixed tree and continue to pass after the fix (the only
 *                permitted change to a customer route is the internal QStash
 *                destination origin inside the best-effort booking enqueue,
 *                which is NOT observable in the route's response).
 *
 *                Routes covered (random valid inputs):
 *                  - POST  /api/leads          → Req 3.1
 *                  - GET   /api/membership     → Req 3.2
 *                  - GET   /api/offers         → Req 3.3
 *                  - GET   /api/notifications  → Req 3.4
 *                  - PATCH /api/notifications  → Req 3.4
 *                  - POST  /api/bookings       → Req 3.5
 *                Plus static preservation: the kept customer files still exist.
 *
 * Approach     : `@/lib/api/session`, `@rgss/db/queries`, `@/lib/jobs/enqueue`,
 *                `@/lib/meta/capi`, `@/lib/api/rate-limit` and
 *                `@/lib/realtime/publish` are mocked — NO real DB, network or
 *                QStash. `@rgss/business` (phone normalisation, pricing, slot
 *                rules, booking-number) and `@rgss/types` (Zod schemas) stay
 *                REAL. Handlers are invoked directly and their JSON envelope +
 *                status are asserted byte-for-byte.
 *
 * Layer        : Testing (property-based, observation-first baseline)
 *
 * Notes        : Runs in the `node` environment (server route handlers).
 *                Property tests run a minimum of 100 iterations.
 *                Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 ************************************************************/

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normaliseIndianPhone } from '@rgss/business'
import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock seams. Session, the data-access layer, the best-effort job enqueue, the
// CAPI client, the per-IP rate limiter and the realtime publisher are mocked so
// the handlers run without a real session, a live Neon connection, a QStash
// publish, a Meta Graph API call or an Ably publish. `@rgss/business` and
// `@rgss/types` are intentionally NOT mocked — their functions are pure.
// ---------------------------------------------------------------------------
const sessionMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
  requireRole: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  // leads
  createLead: vi.fn(),
  // membership
  getCustomerMembership: vi.fn(),
  getMembershipSessions: vi.fn(),
  // offers
  getActiveOffers: vi.fn(),
  // notifications
  getNotificationsForUser: vi.fn(),
  getUnreadCount: vi.fn(),
  markNotificationsRead: vi.fn(),
  // bookings
  getBranchById: vi.fn(),
  getServicesByIds: vi.fn(),
  getDefaultStaffForService: vi.fn(),
  createBookingWithServices: vi.fn(),
  getBookingsByCustomer: vi.fn(),
}))

const enqueueMock = vi.hoisted(() => vi.fn())
const capiMock = vi.hoisted(() => vi.fn())
const publishMock = vi.hoisted(() => vi.fn())
const rateLimitMocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  getClientIp: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: enqueueMock }))
vi.mock('@/lib/meta/capi', () => ({ sendLeadCapiEvent: capiMock }))
vi.mock('@/lib/realtime/publish', () => ({ publishBookingEvent: publishMock }))
vi.mock('@/lib/api/rate-limit', () => rateLimitMocks)

// Route handlers under test (imported after the mocks are registered).
import { POST as bookingsPOST } from '@/app/api/bookings/route'
import { POST as leadsPOST } from '@/app/api/leads/route'
import { GET as membershipGET } from '@/app/api/membership/route'
import { GET as notificationsGET, PATCH as notificationsPATCH } from '@/app/api/notifications/route'
import { GET as offersGET } from '@/app/api/offers/route'

// withErrorHandler-wrapped handlers are typed (req, ctx) => Promise<Response>;
// the collection routes have no dynamic params, so an empty params ctx suffices.
const ROUTE_CTX = { params: Promise.resolve({}) } as never

beforeEach(() => {
  vi.clearAllMocks()
  // Best-effort side-effects: no-ops by default.
  enqueueMock.mockResolvedValue(undefined)
  capiMock.mockResolvedValue(undefined)
  publishMock.mockResolvedValue(undefined)
  rateLimitMocks.enforceRateLimit.mockResolvedValue(undefined)
  rateLimitMocks.getClientIp.mockReturnValue('203.0.113.7')
})

// ===========================================================================
// fast-check arbitraries
// ===========================================================================

// A valid Indian mobile (10 digits, first digit 6–9), optionally carrying a
// +91 / 91 / 0 prefix and surrounding whitespace — every form the createLead
// schema accepts.
const tenDigitArb = fc
  .tuple(
    fc.integer({ min: 6, max: 9 }),
    fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 9 }),
  )
  .map(([first, rest]) => `${first}${rest.join('')}`)

const rawPhoneArb = fc
  .tuple(tenDigitArb, fc.constantFrom('', '+91', '91', '0'))
  .map(([digits, prefix]) => `${prefix}${digits}`)

// A name that is non-empty after trimming and ≤120 chars (schema: trim→min(1)→max(120)).
const nameArb = fc
  .string({ minLength: 1, maxLength: 120 })
  .map((s) => s.trim())
  .filter((s) => s.length >= 1 && s.length <= 120)

// A conservatively-valid email constrained to the input space that Zod's
// `.email()` accepts (alnum local + domain), so the generator never strays
// outside the schema's accepted inputs (fc.emailAddress emits RFC-valid forms
// Zod's stricter validator rejects, e.g. "!.a@a.aa").
const alnumArb = fc.string({ minLength: 1, maxLength: 12 }).map((s) => s.replace(/[^a-z0-9]/gi, ''))
const safeEmailArb = fc
  .tuple(alnumArb, alnumArb)
  .filter(([local, domain]) => local.length > 0 && domain.length > 0)
  .map(([local, domain]) => `${local}@${domain}.com`)

const leadBodyArb = fc.record(
  {
    name: nameArb,
    phone: rawPhoneArb,
    email: fc.option(safeEmailArb, { nil: undefined }),
    source: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined }),
    utmSource: fc.option(fc.string({ minLength: 1, maxLength: 120 }), { nil: undefined }),
    utmCampaign: fc.option(fc.string({ minLength: 1, maxLength: 120 }), { nil: undefined }),
  },
  { requiredKeys: ['name', 'phone'] },
)

// JSON-safe membership-ish records (only values that survive Response.json).
const membershipRecordArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 16 }),
  tier: fc.constantFrom('silver', 'gold', 'platinum'),
  hoursRemaining: fc.integer({ min: 0, max: 100 }),
})

const sessionRecordArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 16 }),
  hoursUsed: fc.integer({ min: 0, max: 10 }),
})

const offerRecordArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 16 }),
  title: fc.string({ maxLength: 40 }),
  serviceNames: fc.array(fc.string({ maxLength: 24 }), { maxLength: 5 }),
})

const userIdArb = fc.string({ minLength: 1, maxLength: 24 })

// Mirror of the handler's query-param parser so the test computes the same
// page / pageSize / offset the route derives.
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback
  }
  return max ? Math.min(parsed, max) : parsed
}

// Uniform service set (1–5 services, single random type, bounded duration so the
// total always fits the open day) — reused for the booking-create baseline.
type ServiceType = 'salon' | 'spa'
type FakeService = {
  id: string
  name: string
  pricePaise: number
  durationMinutes: number
  serviceType: ServiceType
  isActive: boolean
}
const uniformServicesArb = fc
  .tuple(
    fc.constantFrom<ServiceType>('salon', 'spa'),
    fc.array(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 24 }),
        pricePaise: fc.integer({ min: 1, max: 1_000_000 }),
        durationMinutes: fc.integer({ min: 15, max: 120 }),
      }),
      { minLength: 1, maxLength: 5 },
    ),
  )
  .map(([type, specs]) =>
    specs.map((s, i): FakeService => ({ ...s, id: `svc_${i}`, serviceType: type, isActive: true })),
  )

// ===========================================================================
// POST /api/leads — preservation baseline (Req 3.1)
// ===========================================================================
describe('POST /api/leads preservation (Req 3.1)', () => {
  it('returns 201 + { leadId }, normalises phone, defaults source, fires CAPI best-effort', async () => {
    await fc.assert(
      fc.asyncProperty(leadBodyArb, async (body) => {
        vi.clearAllMocks()
        rateLimitMocks.enforceRateLimit.mockResolvedValue(undefined)
        rateLimitMocks.getClientIp.mockReturnValue('203.0.113.7')
        capiMock.mockResolvedValue(undefined)
        dbMocks.createLead.mockResolvedValue({ id: 'lead_generated_1' })

        const res = await leadsPOST(
          new Request('https://theroyalglow.in/api/leads', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
          ROUTE_CTX,
        )
        const json = await res.json()

        // Envelope is exactly { success, data: { leadId } } at 201.
        expect(res.status).toBe(201)
        expect(json).toEqual({ success: true, data: { leadId: 'lead_generated_1' } })

        // Persistence: phone normalised to +91 form, source defaulted to meta_ad.
        const expectedPhone = normaliseIndianPhone(body.phone.trim())
        const expectedSource = body.source ?? 'meta_ad'
        expect(dbMocks.createLead).toHaveBeenCalledOnce()
        expect(dbMocks.createLead).toHaveBeenCalledWith(
          expect.objectContaining({
            name: body.name,
            phone: expectedPhone,
            source: expectedSource,
          }),
        )

        // Best-effort CAPI event fired with the lead id as the dedup event_id.
        expect(capiMock).toHaveBeenCalledOnce()
        expect(capiMock).toHaveBeenCalledWith(
          expect.objectContaining({ eventId: 'lead_generated_1', phone: expectedPhone }),
        )
      }),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// GET /api/membership — preservation baseline (Req 3.2)
// ===========================================================================
describe('GET /api/membership preservation (Req 3.2)', () => {
  it('returns { active, past, sessions } scoped to the caller; sessions only for an active membership', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.option(membershipRecordArb, { nil: null }),
        fc.array(membershipRecordArb, { maxLength: 4 }),
        fc.array(sessionRecordArb, { maxLength: 6 }),
        async (userId, active, past, sessions) => {
          vi.clearAllMocks()
          sessionMocks.requireSession.mockResolvedValue({ user: { id: userId } })
          dbMocks.getCustomerMembership.mockResolvedValue({ active, past })
          dbMocks.getMembershipSessions.mockResolvedValue(sessions)

          const res = await membershipGET(
            new Request('https://theroyalglow.in/api/membership'),
            ROUTE_CTX,
          )
          const json = await res.json()

          const expectedSessions = active ? sessions : []
          expect(res.status).toBe(200)
          expect(json).toEqual({
            success: true,
            data: { active, past, sessions: expectedSessions },
          })

          // Strictly scoped to the authenticated customer.
          expect(dbMocks.getCustomerMembership).toHaveBeenCalledWith(userId)
          if (active) {
            expect(dbMocks.getMembershipSessions).toHaveBeenCalledWith(active.id)
          } else {
            expect(dbMocks.getMembershipSessions).not.toHaveBeenCalled()
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// GET /api/offers — preservation baseline (Req 3.3)
// ===========================================================================
describe('GET /api/offers preservation (Req 3.3)', () => {
  it('returns { offers } with applicable service names, regardless of query params', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(offerRecordArb, { maxLength: 6 }),
        fc.string({ maxLength: 40 }),
        async (offers, rawQuery) => {
          vi.clearAllMocks()
          dbMocks.getActiveOffers.mockResolvedValue(offers)

          const query = rawQuery.length > 0 ? `?${encodeURIComponent(rawQuery)}=1` : ''
          const res = await offersGET(
            new Request(`https://theroyalglow.in/api/offers${query}`),
            ROUTE_CTX,
          )
          const json = await res.json()

          expect(res.status).toBe(200)
          expect(json).toEqual({ success: true, data: { offers } })
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// GET /api/notifications — preservation baseline (Req 3.4)
// ===========================================================================
describe('GET /api/notifications preservation (Req 3.4)', () => {
  it('returns the caller-scoped feed + unread count with correct pagination meta', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.option(fc.integer({ min: -3, max: 8 }), { nil: undefined }),
        fc.option(fc.integer({ min: -3, max: 150 }), { nil: undefined }),
        fc.integer({ min: 0, max: 50 }),
        async (userId, pageParam, pageSizeParam, unreadCount) => {
          vi.clearAllMocks()
          sessionMocks.requireSession.mockResolvedValue({ user: { id: userId } })

          const expectedPage = parsePositiveInt(
            pageParam === undefined ? null : String(pageParam),
            DEFAULT_PAGE,
          )
          const expectedPageSize = parsePositiveInt(
            pageSizeParam === undefined ? null : String(pageSizeParam),
            DEFAULT_PAGE_SIZE,
            MAX_PAGE_SIZE,
          )
          const expectedOffset = (expectedPage - 1) * expectedPageSize

          // Length 0..pageSize so both hasMore branches are exercised.
          const len = unreadCount % (expectedPageSize + 1)
          const notifications = Array.from({ length: len }, (_, i) => ({
            id: `n_${i}`,
            isRead: false,
          }))
          dbMocks.getNotificationsForUser.mockResolvedValue(notifications)
          dbMocks.getUnreadCount.mockResolvedValue(unreadCount)

          const params = new URLSearchParams()
          if (pageParam !== undefined) params.set('page', String(pageParam))
          if (pageSizeParam !== undefined) params.set('pageSize', String(pageSizeParam))
          const qs = params.toString()
          const res = await notificationsGET(
            new Request(`https://theroyalglow.in/api/notifications${qs ? `?${qs}` : ''}`),
            ROUTE_CTX,
          )
          const json = await res.json()

          const hasMore = notifications.length === expectedPageSize
          const expectedTotalPages = hasMore ? expectedPage + 1 : expectedPage

          expect(res.status).toBe(200)
          expect(json).toEqual({
            success: true,
            data: { notifications, unreadCount },
            meta: { page: expectedPage, totalPages: expectedTotalPages },
          })

          // Strict caller scoping + correct pagination args into the query layer.
          expect(dbMocks.getNotificationsForUser).toHaveBeenCalledWith(
            userId,
            expectedPageSize,
            expectedOffset,
          )
          expect(dbMocks.getUnreadCount).toHaveBeenCalledWith(userId)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// PATCH /api/notifications — preservation baseline (Req 3.4)
// ===========================================================================
describe('PATCH /api/notifications preservation (Req 3.4)', () => {
  it('marks the caller-scoped notifications read and returns { ok: true }', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.option(fc.array(fc.string({ minLength: 1, maxLength: 16 }), { maxLength: 6 }), {
          nil: undefined,
        }),
        async (userId, ids) => {
          vi.clearAllMocks()
          sessionMocks.requireSession.mockResolvedValue({ user: { id: userId } })
          dbMocks.markNotificationsRead.mockResolvedValue(undefined)

          const body = ids === undefined ? {} : { ids }
          const res = await notificationsPATCH(
            new Request('https://theroyalglow.in/api/notifications', {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
            ROUTE_CTX,
          )
          const json = await res.json()

          expect(res.status).toBe(200)
          expect(json).toEqual({ success: true, data: { ok: true } })

          // Scoped to the caller; ids passed through (undefined ⇒ mark all read).
          expect(dbMocks.markNotificationsRead).toHaveBeenCalledWith(userId, ids)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// POST /api/bookings — preservation baseline (Req 3.5)
//   The response envelope is unchanged AND enqueueJob is still called with the
//   same path / body / delaySeconds. Only the internal base origin inside
//   enqueueJob may change after the fix — which is NOT observable here because
//   enqueueJob is mocked at the route boundary (the route passes only the path).
// ===========================================================================
describe('POST /api/bookings preservation (Req 3.5)', () => {
  it('returns the identical create envelope and enqueues the same triggered jobs', async () => {
    await fc.assert(
      fc.asyncProperty(uniformServicesArb, async (services) => {
        vi.clearAllMocks()
        sessionMocks.requireSession.mockResolvedValue({ user: { id: 'cust_1' } })
        publishMock.mockResolvedValue(undefined)
        enqueueMock.mockResolvedValue(undefined)

        const byId = new Map(services.map((s) => [s.id, s]))
        dbMocks.getBranchById.mockResolvedValue({ id: 'br_1', code: 'RS', status: 'operational' })
        dbMocks.getServicesByIds.mockImplementation(async (ids: string[]) =>
          ids.map((id) => byId.get(id)).filter((s): s is FakeService => Boolean(s)),
        )
        dbMocks.getDefaultStaffForService.mockResolvedValue('staff_1')
        dbMocks.createBookingWithServices.mockImplementation(
          async (booking: { bookingNumber: string; status: string }) => ({
            id: 'bk_generated_1',
            bookingNumber: booking.bookingNumber,
            status: booking.status,
          }),
        )

        // A far-future date guarantees the no-show enqueue delay is positive.
        const res = await bookingsPOST(
          new Request('https://theroyalglow.in/api/bookings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              branchId: 'br_1',
              serviceType: services[0]?.serviceType,
              bookingDate: '2099-06-10',
              startTime: '10:00',
              serviceIds: services.map((s) => s.id),
            }),
          }),
          ROUTE_CTX,
        )
        const json = await res.json()

        expect(res.status).toBe(201)
        expect(json.success).toBe(true)
        expect(json.data.id).toBe('bk_generated_1')
        expect(json.data.status).toBe('pending')
        expect(json.data.bookingNumber).toMatch(/^BK-RS-\d{4}-[HS]-\d{5}$/)

        // The stale-pending alert is always enqueued at the same path/body/delay.
        expect(enqueueMock).toHaveBeenCalledWith(
          '/api/jobs/stale-booking-alert',
          { bookingId: 'bk_generated_1' },
          2 * 60 * 60,
        )
        // The no-show check is enqueued (future appointment) at its path/body
        // with a positive delay.
        const noShowCall = enqueueMock.mock.calls.find((c) => c[0] === '/api/jobs/noshow-check')
        expect(noShowCall).toBeDefined()
        expect(noShowCall?.[1]).toEqual({ bookingId: 'bk_generated_1' })
        expect(typeof noShowCall?.[2]).toBe('number')
        expect(noShowCall?.[2] as number).toBeGreaterThan(0)
      }),
      { numRuns: 100 },
    )
  })
})

// ===========================================================================
// Static preservation — the kept customer files still exist
//   (¬isBugCondition: customer-facing code + customer-only libs stay in web.)
// ===========================================================================
describe('static preservation: kept customer files exist in apps/web', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const WEB_SRC = resolve(here, '..') // apps/web/src

  const KEPT_FILES = [
    // customer-only libs that stay in web
    join('lib', 'jobs', 'enqueue.ts'),
    join('lib', 'notifications', 'providers', 'email.ts'),
    join('lib', 'meta', 'capi.ts'),
    // the four customer split-route handlers
    join('app', 'api', 'leads', 'route.ts'),
    join('app', 'api', 'membership', 'route.ts'),
    join('app', 'api', 'offers', 'route.ts'),
    join('app', 'api', 'notifications', 'route.ts'),
  ]

  for (const rel of KEPT_FILES) {
    it(`retains ${rel.replace(/\\/g, '/')}`, () => {
      expect(existsSync(join(WEB_SRC, rel))).toBe(true)
    })
  }
})
