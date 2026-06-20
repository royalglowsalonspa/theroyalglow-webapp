// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : routes.test
 * Scope        : Unit tests for migrated admin API routes
 *
 * Description  : Vitest unit tests for a representative subset of the migrated
 *                admin API route handlers (GET /api/bookings, GET /api/customers,
 *                GET /api/membership-tiers, POST /api/leads, PATCH /api/leave/[id]).
 *                Asserts three things per the task:
 *                  1. Response envelope — success `{ success, data, meta? }` and
 *                     error `{ success:false, error:{ code, message, statusCode,
 *                     requestId } }`.
 *                  2. Auth guard — requireRole enforcement maps a thrown
 *                     UNAUTHENTICATED → 401 and FORBIDDEN → 403, each with the
 *                     error envelope.
 *                  3. HTTP method presence — the documented handlers are
 *                     exported (and undocumented ones are not).
 *
 * Approach     : `@/lib/api/session` (requireRole/requireSession) and
 *                `@rgss/db/queries` are mocked so no real session or DB is hit.
 *                `@rgss/business` stays REAL (pure functions). The route's
 *                exported handler is invoked directly with a constructed Request
 *                and the JSON envelope + status are asserted.
 *
 * Layer        : Testing
 *
 * Notes        : Runs in the `node` environment (server route handlers).
 *                Validates: Requirements 3.1, 3.2, 3.3, 2.6
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock seams. The session guard and the data-access layer are mocked so the
// handlers run without a real session lookup or a live Neon connection.
// `@rgss/business` is intentionally NOT mocked — its functions are pure.
// ---------------------------------------------------------------------------
const sessionMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  // bookings
  getAllBookings: vi.fn(),
  // customers
  getCustomers: vi.fn(),
  // membership-tiers
  getMembershipTiers: vi.fn(),
  // leads
  createLead: vi.fn(),
  getLeadsForPipeline: vi.fn(),
  // leave/[id]
  getLeaveById: vi.fn(),
  updateLeaveStatus: vi.fn(),
  createNotification: vi.fn(),
  getConfirmedBookingsForStaffOnDate: vi.fn(),
}))

const dispatchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/notifications/dispatch', () => ({ dispatchNotification: dispatchMock }))

// Route handlers under test (imported after the mocks are registered; vi.mock
// is hoisted above these imports automatically).
import * as bookingsRoute from '@/app/api/bookings/route'
import * as customersRoute from '@/app/api/customers/route'
import * as leadsRoute from '@/app/api/leads/route'
import * as leaveIdRoute from '@/app/api/leave/[id]/route'
import * as tiersRoute from '@/app/api/membership-tiers/route'

// Convenience handles.
const bookingsGET = bookingsRoute.GET
const customersGET = customersRoute.GET
const tiersGET = tiersRoute.GET
const leadsGET = leadsRoute.GET
const leadsPOST = leadsRoute.POST
const leavePATCH = leaveIdRoute.PATCH

const AUTHORIZED_SESSION = { user: { id: 'u_admin', role: 'receptionist' } }

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

const unauthenticated = () =>
  new AppError({
    code: ERROR_CODES.UNAUTHENTICATED,
    message: 'You must be signed in.',
    statusCode: 401,
  })

const forbidden = () =>
  new AppError({
    code: ERROR_CODES.FORBIDDEN,
    message: 'You do not have permission to perform this action.',
    statusCode: 403,
  })

beforeEach(() => {
  vi.clearAllMocks()
  // Default: every guard authorizes a receptionist.
  sessionMocks.requireRole.mockResolvedValue(AUTHORIZED_SESSION)
  sessionMocks.requireSession.mockResolvedValue(AUTHORIZED_SESSION)
})

// ===========================================================================
// 1. Response envelope — success path
//    Validates: Requirements 3.1, 3.2, 3.3
// ===========================================================================
describe('Response envelope — success path', () => {
  it('GET /api/bookings returns { success:true, data:{ bookings } }', async () => {
    dbMocks.getAllBookings.mockResolvedValue([{ id: 'bk1' }, { id: 'bk2' }])

    const res = await bookingsGET(new Request('https://admin.theroyalglow.in/api/bookings'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: { bookings: [{ id: 'bk1' }, { id: 'bk2' }] } })
    expect(dbMocks.getAllBookings).toHaveBeenCalledOnce()
  })

  it('GET /api/bookings forwards status/serviceType/date filters to the query', async () => {
    dbMocks.getAllBookings.mockResolvedValue([])

    const res = await bookingsGET(
      new Request(
        'https://admin.theroyalglow.in/api/bookings?status=pending&serviceType=spa&date=2026-06-04',
      ),
    )
    await res.json()

    expect(dbMocks.getAllBookings).toHaveBeenCalledWith({
      status: 'pending',
      serviceType: 'spa',
      date: '2026-06-04',
    })
  })

  it('GET /api/customers returns the envelope with pagination meta', async () => {
    dbMocks.getCustomers.mockResolvedValue({ rows: [{ id: 'c1' }], totalCount: 1 })

    const res = await customersGET(new Request('https://admin.theroyalglow.in/api/customers'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ customers: [{ id: 'c1' }] })
    // meta is present and well-formed for the paginated directory.
    expect(body.meta).toMatchObject({ page: expect.any(Number), totalPages: 1, totalCount: 1 })
  })

  it('GET /api/membership-tiers returns { success:true, data: tiers }', async () => {
    const tiers = [{ id: 'silver' }, { id: 'gold' }]
    dbMocks.getMembershipTiers.mockResolvedValue(tiers)

    const res = await tiersGET(new Request('https://admin.theroyalglow.in/api/membership-tiers'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: tiers })
  })

  it('POST /api/leads creates a lead and returns 201 with { leadId }', async () => {
    dbMocks.createLead.mockResolvedValue({ id: 'lead_1' })

    const res = await leadsPOST(
      jsonRequest('https://admin.theroyalglow.in/api/leads', 'POST', {
        name: 'Asha Rao',
        phone: '9876543210',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toEqual({ success: true, data: { leadId: 'lead_1' } })
    // Phone normalised to +91 form and source forced to 'manual'.
    expect(dbMocks.createLead).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+919876543210', source: 'manual' }),
    )
  })

  it('PATCH /api/leave/[id] approves a pending request and returns { leave, conflicts }', async () => {
    dbMocks.getLeaveById.mockResolvedValue({
      id: 'leave_1',
      approvalStatus: 'pending',
      staffId: 'staff_1',
      staffUserId: 'user_staff_1',
      date: '2026-06-10',
    })
    dbMocks.updateLeaveStatus.mockResolvedValue({ id: 'leave_1', approvalStatus: 'approved' })
    dbMocks.createNotification.mockResolvedValue({ id: 'notif_1', channel: 'push' })
    dbMocks.getConfirmedBookingsForStaffOnDate.mockResolvedValue([])

    const res = await leavePATCH(
      jsonRequest('https://admin.theroyalglow.in/api/leave/leave_1', 'PATCH', {
        action: 'approve',
      }),
      { params: Promise.resolve({ id: 'leave_1' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({
      leave: { id: 'leave_1', approvalStatus: 'approved' },
      conflicts: [],
    })
    expect(dbMocks.updateLeaveStatus).toHaveBeenCalledWith(
      'leave_1',
      'approved',
      'u_admin',
      undefined,
    )
  })
})

// ===========================================================================
// 2. Response envelope — error path (validation)
//    Validates: Requirements 3.3
// ===========================================================================
describe('Response envelope — error path', () => {
  it('POST /api/leads with an invalid body returns the 400 error envelope', async () => {
    const res = await leadsPOST(
      jsonRequest('https://admin.theroyalglow.in/api/leads', 'POST', { name: '', phone: 'nope' }),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode: 400,
      message: expect.any(String),
      requestId: expect.any(String),
    })
    // No lead is created when validation fails.
    expect(dbMocks.createLead).not.toHaveBeenCalled()
  })

  it('PATCH /api/leave/[id] returns the 404 error envelope when the leave is missing', async () => {
    dbMocks.getLeaveById.mockResolvedValue(null)

    const res = await leavePATCH(
      jsonRequest('https://admin.theroyalglow.in/api/leave/missing', 'PATCH', {
        action: 'approve',
      }),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({ code: ERROR_CODES.NOT_FOUND, statusCode: 404 })
    expect(dbMocks.updateLeaveStatus).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// 3. Auth guard — requireRole enforcement (401 unauthenticated / 403 forbidden)
//    Validates: Requirements 2.6, 3.3
// ===========================================================================
describe('Auth guard — requireRole enforcement', () => {
  type Handler = () => Promise<Response>
  const cases: Array<[string, Handler]> = [
    [
      'GET /api/bookings',
      () => bookingsGET(new Request('https://admin.theroyalglow.in/api/bookings')),
    ],
    [
      'GET /api/customers',
      () => customersGET(new Request('https://admin.theroyalglow.in/api/customers')),
    ],
    [
      'GET /api/membership-tiers',
      () => tiersGET(new Request('https://admin.theroyalglow.in/api/membership-tiers')),
    ],
    ['GET /api/leads', () => leadsGET(new Request('https://admin.theroyalglow.in/api/leads'))],
    [
      'POST /api/leads',
      () =>
        leadsPOST(
          jsonRequest('https://admin.theroyalglow.in/api/leads', 'POST', {
            name: 'Asha',
            phone: '9876543210',
          }),
        ),
    ],
    [
      'PATCH /api/leave/[id]',
      () =>
        leavePATCH(
          jsonRequest('https://admin.theroyalglow.in/api/leave/leave_1', 'PATCH', {
            action: 'approve',
          }),
          { params: Promise.resolve({ id: 'leave_1' }) },
        ),
    ],
  ]

  it.each(cases)('%s → 401 + error envelope when unauthenticated', async (_name, invoke) => {
    sessionMocks.requireRole.mockRejectedValue(unauthenticated())

    const res = await invoke()
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: ERROR_CODES.UNAUTHENTICATED,
      statusCode: 401,
      requestId: expect.any(String),
    })
    // The guard short-circuits before any data access.
    expect(dbMocks.getAllBookings).not.toHaveBeenCalled()
    expect(dbMocks.getCustomers).not.toHaveBeenCalled()
    expect(dbMocks.getMembershipTiers).not.toHaveBeenCalled()
    expect(dbMocks.createLead).not.toHaveBeenCalled()
    expect(dbMocks.getLeadsForPipeline).not.toHaveBeenCalled()
    expect(dbMocks.updateLeaveStatus).not.toHaveBeenCalled()
  })

  it.each(cases)('%s → 403 + error envelope when role is insufficient', async (_name, invoke) => {
    sessionMocks.requireRole.mockRejectedValue(forbidden())

    const res = await invoke()
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
      statusCode: 403,
      requestId: expect.any(String),
    })
  })
})

// ===========================================================================
// 4. HTTP method presence — documented handlers are exported
//    Validates: Requirements 3.2
// ===========================================================================
describe('HTTP method presence', () => {
  it('GET /api/bookings exports GET only', () => {
    expect(typeof bookingsRoute.GET).toBe('function')
    expect((bookingsRoute as Record<string, unknown>).POST).toBeUndefined()
    expect((bookingsRoute as Record<string, unknown>).PATCH).toBeUndefined()
    expect((bookingsRoute as Record<string, unknown>).DELETE).toBeUndefined()
  })

  it('GET /api/customers exports GET only', () => {
    expect(typeof customersRoute.GET).toBe('function')
    expect((customersRoute as Record<string, unknown>).POST).toBeUndefined()
  })

  it('GET /api/membership-tiers exports GET only', () => {
    expect(typeof tiersRoute.GET).toBe('function')
    expect((tiersRoute as Record<string, unknown>).POST).toBeUndefined()
  })

  it('/api/leads exports both GET and POST', () => {
    expect(typeof leadsRoute.GET).toBe('function')
    expect(typeof leadsRoute.POST).toBe('function')
  })

  it('/api/leave/[id] exports PATCH', () => {
    expect(typeof leaveIdRoute.PATCH).toBe('function')
  })
})
