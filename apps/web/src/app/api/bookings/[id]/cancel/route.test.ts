// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : bookings/[id]/cancel route.test
 * Scope        : Property-based tests — POST /api/bookings/[id]/cancel
 *
 * Description  : Verifies cancellation of a customer's own booking:
 *                - active bookings (pending/confirmed) transition to cancelled,
 *                  record a timestamp + optional reason, and log the transition
 *                  (Property 17);
 *                - the transition guards reject invalid states with the right
 *                  409 codes (Property 18).
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handler). `@/lib/api/session`
 *                and `@rgss/db/queries` are mocked with in-memory fakes; no live
 *                session or DB. `@rgss/types` (Zod) and `@rgss/errors` stay REAL.
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

import * as cancelRoute from '@/app/api/bookings/[id]/cancel/route'

const postReq = (id: string, body: unknown) =>
  new Request(`https://theroyalglow.in/api/bookings/${id}/cancel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

// Build an in-memory booking store with cancel semantics matching the real
// query layer (set status/reason/timestamp + append a status-log entry).
function makeStore(booking: {
  id: string
  customerId: string
  status: string
  rescheduleCount?: number
}) {
  const record = {
    ...booking,
    cancellationReason: null as string | null,
    cancelledAt: null as Date | null,
    statusLogs: [] as Array<{
      fromStatus: string
      toStatus: string
      changedById: string
      notes: string
    }>,
  }

  dbMocks.getBookingByIdForCustomer.mockImplementation(async (id: string, customerId: string) => {
    if (id === record.id && customerId === record.customerId) {
      return { ...record, services: [] }
    }
    return null
  })

  dbMocks.cancelBooking.mockImplementation(
    async (id: string, changedById: string, reason: string | null) => {
      if (id !== record.id) return null
      const priorStatus = record.status
      record.status = 'cancelled'
      record.cancellationReason = reason
      record.cancelledAt = new Date()
      record.statusLogs.push({
        fromStatus: priorStatus,
        toStatus: 'cancelled',
        changedById,
        notes: reason ? `Cancelled: ${reason}` : 'Cancelled',
      })
      return { ...record }
    },
  )

  return record
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/bookings/[id]/cancel — active transition', () => {
  // Feature: backend-api, Property 17: Cancelling an active booking transitions to cancelled and logs it
  it('Property 17: cancelling a pending/confirmed booking → cancelled, timestamped, logged, reason stored when supplied', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('pending', 'confirmed'),
        fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
        async (ownerId, bookingId, status, reason) => {
          const store = makeStore({ id: bookingId, customerId: ownerId, status })
          sessionMocks.requireSession.mockResolvedValue({ user: { id: ownerId } })

          const payload = reason === undefined ? {} : { reason }
          const res = await cancelRoute.POST(postReq(bookingId, payload), {
            params: Promise.resolve({ id: bookingId }),
          })
          const body = await res.json()

          expect(res.status).toBe(200)
          expect(body.success).toBe(true)
          // Status transitioned to cancelled and a cancellation timestamp was recorded.
          expect(body.data.status).toBe('cancelled')
          expect(body.data.cancelledAt).toBeTruthy()

          // The reason is stored exactly when supplied (else null).
          const expectedReason = reason === undefined ? null : reason
          expect(store.cancellationReason).toBe(expectedReason)

          // Exactly one status-log entry capturing prior → cancelled with the actor.
          expect(store.statusLogs).toHaveLength(1)
          expect(store.statusLogs[0]).toMatchObject({
            fromStatus: status,
            toStatus: 'cancelled',
            changedById: ownerId,
          })
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('POST /api/bookings/[id]/cancel — transition guards', () => {
  // Feature: backend-api, Property 18: Cancellation transition guards reject invalid states
  it('Property 18: already-cancelled → 409 ALREADY_CANCELLED; completed/in_progress/no_show → 409 INVALID_STATUS_TRANSITION', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('cancelled', 'completed', 'in_progress', 'no_show'),
        fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
        async (ownerId, bookingId, status, reason) => {
          makeStore({ id: bookingId, customerId: ownerId, status })
          sessionMocks.requireSession.mockResolvedValue({ user: { id: ownerId } })

          const payload = reason === undefined ? {} : { reason }
          const res = await cancelRoute.POST(postReq(bookingId, payload), {
            params: Promise.resolve({ id: bookingId }),
          })
          const body = await res.json()

          const expectedCode =
            status === 'cancelled'
              ? 'BOOKING_ALREADY_CANCELLED'
              : 'BOOKING_INVALID_STATUS_TRANSITION'

          expect(res.status).toBe(409)
          expect(body.success).toBe(false)
          expect(body.error).toMatchObject({ code: expectedCode, statusCode: 409 })
          // The guard fires before any mutation — cancelBooking is never reached.
          expect(dbMocks.cancelBooking).not.toHaveBeenCalled()
        },
      ),
      { numRuns: 100 },
    )
  })
})
