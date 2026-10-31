// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : bookings/[id] route.test
 * Scope        : Property-based tests — GET /api/bookings/[id]
 *
 * Description  : Verifies the customer single-booking detail endpoint enforces
 *                ownership. A booking that is not owned by the caller is
 *                indistinguishable from a missing row and yields NOT_FOUND (404)
 *                — it never reveals which booking ids exist. The response
 *                carries the booking's terms under its branch's current rules
 *                (R6.3): whether cancelling now is late, and whether it can
 *                still be rescheduled.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handler). `@/lib/api/session`
 *                and `@rgss/db/queries` are mocked with in-memory fakes; no live
 *                session or DB. `@rgss/business` stays REAL. Date is faked to
 *                Wednesday 10/06/2026, 10:00 IST.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import { DEFAULT_BOOKING_RULES, DEFAULT_BUSINESS_HOURS } from '@rgss/types'
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
  requireRole: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getBookingByIdForCustomer: vi.fn(),
  getBookingById: vi.fn(),
  getBranchPolicy: vi.fn(),
  cancelBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import * as bookingIdRoute from '@/app/api/bookings/[id]/route'

// Wednesday 10/06/2026, 10:00 IST.
const NOW = new Date('2026-06-10T04:30:00.000Z')

const POLICY = {
  branchId: 'br_1',
  branchName: 'Rayasandra',
  revision: 4,
  businessHours: DEFAULT_BUSINESS_HOURS,
  bookingRules: DEFAULT_BOOKING_RULES,
}

const getReq = (id: string) => new Request(`https://theroyalglow.in/api/bookings/${id}`)

function ownedBooking(overrides: Record<string, unknown> = {}) {
  dbMocks.getBookingByIdForCustomer.mockImplementation(async (id: string, customerId: string) => ({
    id,
    customerId,
    branchId: 'br_1',
    status: 'confirmed',
    rescheduleCount: 0,
    bookingDate: new Date('2026-06-10T00:00:00.000Z'),
    startTime: '13:00:00',
    services: [{ id: 'bs1', bookingId: id }],
    ...overrides,
  }))
  sessionMocks.requireSession.mockResolvedValue({ user: { id: 'cust_1' } })
}

async function getBooking() {
  const res = await bookingIdRoute.GET(getReq('bk_1'), {
    params: Promise.resolve({ id: 'bk_1' }),
  })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  dbMocks.getBranchPolicy.mockResolvedValue(POLICY)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/bookings/[id] — ownership', () => {
  // Feature: backend-api, Property 16: Cross-customer booking access yields NOT_FOUND
  it('Property 16: a booking not owned by the caller yields NOT_FOUND 404', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // owner id
        fc.uuid(), // booking id
        fc.string({ maxLength: 200 }), // booking detail noise (only owner can read)
        async (ownerId, bookingId, noise) => {
          // A distinct caller who does NOT own the booking.
          const callerId = `caller-${ownerId}`

          // Fake mirrors the real query: ownership lives in the WHERE clause, so a
          // lookup by a non-owner returns null exactly as a missing row would.
          dbMocks.getBookingByIdForCustomer.mockImplementation(
            async (id: string, customerId: string) => {
              if (id === bookingId && customerId === ownerId) {
                return { id, customerId, status: 'confirmed', notes: noise, services: [] }
              }
              return null
            },
          )
          sessionMocks.requireSession.mockResolvedValue({ user: { id: callerId } })

          const res = await bookingIdRoute.GET(getReq(bookingId), {
            params: Promise.resolve({ id: bookingId }),
          })
          const body = await res.json()

          expect(res.status).toBe(404)
          expect(body.success).toBe(false)
          expect(body.error).toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
          // Nothing about the branch's rules is read for someone else's booking.
          expect(dbMocks.getBranchPolicy).not.toHaveBeenCalled()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns the owned booking with its services for the owner (sanity)', async () => {
    ownedBooking()

    const { status, body } = await getBooking()

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.booking).toMatchObject({ id: 'bk_1', customerId: 'cust_1' })
  })
})

describe("GET /api/bookings/[id] — the booking's terms (R6.3)", () => {
  it('says cancelling now is late and how many reschedules remain', async () => {
    // 13:00 today is three hours away: inside the four-hour cut-off.
    ownedBooking()

    const { body } = await getBooking()

    expect(dbMocks.getBranchPolicy).toHaveBeenCalledWith('br_1')
    expect(body.data.terms).toEqual({
      cancel: { late: true, cutoffHours: 4 },
      reschedule: { allowed: true, remaining: 2, cutoffHours: 1 },
    })
  })

  it("follows the branch's rules: no reschedules left, cancelling not late", async () => {
    dbMocks.getBranchPolicy.mockResolvedValue({
      ...POLICY,
      bookingRules: {
        ...DEFAULT_BOOKING_RULES,
        maxReschedulesPerBooking: 1,
        cancellationCutoffHours: 2,
      },
    })
    ownedBooking({ rescheduleCount: 1 })

    const { body } = await getBooking()

    expect(body.data.terms.cancel).toEqual({ late: false, cutoffHours: 2 })
    expect(body.data.terms.reschedule).toMatchObject({ allowed: false, code: 'MAX_RESCHEDULES' })
  })

  it('has no cancellation for a finished booking', async () => {
    ownedBooking({ status: 'completed' })

    const { body } = await getBooking()

    expect(body.data.terms.cancel).toBeNull()
    expect(body.data.terms.reschedule).toMatchObject({ allowed: false, code: 'NOT_RESCHEDULABLE' })
  })

  it('still shows the booking when the branch has no readable settings', async () => {
    dbMocks.getBranchPolicy.mockRejectedValue(
      conflict(ERROR_CODES.BRANCH_SETTINGS_INCOMPLETE, 'Rayasandra has no valid booking settings.'),
    )
    ownedBooking()

    const { status, body } = await getBooking()

    expect(status).toBe(200)
    expect(body.data.booking.id).toBe('bk_1')
    expect(body.data.terms).toBeNull()
  })

  it('fails on any other error reading the settings', async () => {
    dbMocks.getBranchPolicy.mockRejectedValue(new Error('connection reset'))
    ownedBooking()

    const { status } = await getBooking()

    expect(status).toBe(500)
  })
})
