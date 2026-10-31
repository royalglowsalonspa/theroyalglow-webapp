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
 *                  409 codes (Property 18);
 *                - within the branch's cut-off a cancellation is late: allowed,
 *                  never charged, recorded with the settings revision (R6.3);
 *                  unreadable settings never block a cancellation.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handler). `@/lib/api/session`
 *                and `@rgss/db/queries` are mocked with in-memory fakes; no live
 *                session or DB. `@rgss/types` (Zod), `@rgss/business` and
 *                `@rgss/errors` stay REAL. Date is faked to 10/06/2026, 10:00 IST.
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

import * as cancelRoute from '@/app/api/bookings/[id]/cancel/route'

// Wednesday 10/06/2026, 10:00 IST.
const NOW = new Date('2026-06-10T04:30:00.000Z')

const POLICY = {
  branchId: 'br_1',
  branchName: 'Rayasandra',
  revision: 4,
  businessHours: DEFAULT_BUSINESS_HOURS,
  bookingRules: DEFAULT_BOOKING_RULES,
}

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
  bookingDate?: string
  startTime?: string
}) {
  const record = {
    branchId: 'br_1',
    ...booking,
    bookingDate: new Date(`${booking.bookingDate ?? '2026-06-20'}T00:00:00.000Z`),
    startTime: booking.startTime ?? '15:00:00',
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
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  dbMocks.getBranchPolicy.mockResolvedValue(POLICY)
})

afterEach(() => {
  vi.useRealTimers()
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

describe("POST /api/bookings/[id]/cancel — the branch's cut-off (R6.3)", () => {
  async function cancel(booking: { bookingDate: string; startTime: string }) {
    makeStore({ id: 'bk_1', customerId: 'cust_1', status: 'confirmed', ...booking })
    sessionMocks.requireSession.mockResolvedValue({ user: { id: 'cust_1' } })
    const res = await cancelRoute.POST(postReq('bk_1', {}), {
      params: Promise.resolve({ id: 'bk_1' }),
    })
    return { status: res.status, body: await res.json() }
  }

  it('is late within the cut-off: still cancelled, recorded with the revision', async () => {
    // 13:00 today is three hours away; the branch's cut-off is four.
    const { status, body } = await cancel({ bookingDate: '2026-06-10', startTime: '13:00:00' })

    expect(status).toBe(200)
    expect(body.data).toMatchObject({ status: 'cancelled', late: true })
    expect(dbMocks.getBranchPolicy).toHaveBeenCalledWith('br_1')
    expect(dbMocks.cancelBooking).toHaveBeenCalledWith('bk_1', 'cust_1', null, {
      late: true,
      settingsRevision: 4,
    })
  })

  it('is not late before the cut-off', async () => {
    const { body } = await cancel({ bookingDate: '2026-06-10', startTime: '15:00:00' })

    expect(body.data.late).toBe(false)
    expect(dbMocks.cancelBooking).toHaveBeenCalledWith('bk_1', 'cust_1', null, {
      late: false,
      settingsRevision: 4,
    })
  })

  it("follows this branch's own cut-off", async () => {
    dbMocks.getBranchPolicy.mockResolvedValue({
      ...POLICY,
      revision: 7,
      bookingRules: { ...DEFAULT_BOOKING_RULES, cancellationCutoffHours: 2 },
    })

    const { body } = await cancel({ bookingDate: '2026-06-10', startTime: '13:00:00' })

    expect(body.data.late).toBe(false)
    expect(dbMocks.cancelBooking).toHaveBeenCalledWith('bk_1', 'cust_1', null, {
      late: false,
      settingsRevision: 7,
    })
  })

  it('never blocks a cancellation on unreadable settings: no lateness is decided', async () => {
    dbMocks.getBranchPolicy.mockRejectedValue(
      conflict(ERROR_CODES.BRANCH_SETTINGS_INCOMPLETE, 'Rayasandra has no valid booking settings.'),
    )

    const { status, body } = await cancel({ bookingDate: '2026-06-10', startTime: '11:00:00' })

    expect(status).toBe(200)
    expect(body.data).toMatchObject({ status: 'cancelled', late: false })
    expect(dbMocks.cancelBooking).toHaveBeenCalledWith('bk_1', 'cust_1', null, undefined)
  })

  it('still fails on any other error reading the settings', async () => {
    dbMocks.getBranchPolicy.mockRejectedValue(new Error('connection reset'))

    const { status } = await cancel({ bookingDate: '2026-06-10', startTime: '15:00:00' })

    expect(status).toBe(500)
    expect(dbMocks.cancelBooking).not.toHaveBeenCalled()
  })
})
