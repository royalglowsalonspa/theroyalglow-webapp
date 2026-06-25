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
 *                — it never reveals which booking ids exist.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handler). `@/lib/api/session`
 *                and `@rgss/db/queries` are mocked with in-memory fakes; no live
 *                session or DB. `@rgss/business` stays REAL.
 ************************************************************/

import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getOptionalSession: vi.fn(),
  requireRole: vi.fn(),
}))

const dbMocks = vi.hoisted(() => ({
  getBookingByIdForCustomer: vi.fn(),
  getBookingById: vi.fn(),
  cancelBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import * as bookingIdRoute from '@/app/api/bookings/[id]/route'

const getReq = (id: string) => new Request(`https://theroyalglow.in/api/bookings/${id}`)

beforeEach(() => {
  vi.clearAllMocks()
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
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns the owned booking with its services for the owner (sanity)', async () => {
    dbMocks.getBookingByIdForCustomer.mockImplementation(
      async (id: string, customerId: string) => ({
        id,
        customerId,
        status: 'confirmed',
        services: [{ id: 'bs1', bookingId: id }],
      }),
    )
    sessionMocks.requireSession.mockResolvedValue({ user: { id: 'cust_1' } })

    const res = await bookingIdRoute.GET(getReq('bk_1'), {
      params: Promise.resolve({ id: 'bk_1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.booking).toMatchObject({ id: 'bk_1', customerId: 'cust_1' })
  })
})
