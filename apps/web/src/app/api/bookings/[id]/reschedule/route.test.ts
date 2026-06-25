// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : bookings/[id]/reschedule route.test
 * Scope        : Property-based tests — POST /api/bookings/[id]/reschedule
 *
 * Description  : Verifies that rescheduling an owned, reschedulable booking to a
 *                valid new date and grid-aligned start time updates the slot,
 *                recomputes the end time from the frozen total duration,
 *                increments the reschedule count by exactly one, and records a
 *                status-log entry (Property 19).
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handler). `@/lib/api/session`
 *                and `@rgss/db/queries` are mocked with in-memory fakes; no live
 *                session or DB. `@rgss/business` (slot/grid + time math),
 *                `@rgss/types` (Zod) and `@rgss/errors` stay REAL.
 ************************************************************/

import { addMinutesToTime } from '@rgss/business'
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

import * as rescheduleRoute from '@/app/api/bookings/[id]/reschedule/route'

const postReq = (id: string, body: unknown) =>
  new Request(`https://theroyalglow.in/api/bookings/${id}/reschedule`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

// IST (UTC+5:30) calendar date `days` ahead of now, as YYYY-MM-DD. Mirrors the
// route's todayInIST(); using days >= 1 keeps the slot strictly in the future
// and avoids any midnight-boundary flake.
function istDatePlus(days: number): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

const pad = (n: number) => String(n).padStart(2, '0')
const minutesToTime = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`

// Slot grid mirrors the business layer: open 10:00 (600), close 21:00 (1260),
// 30-min grid. Generate a duration (multiple of 30) and a grid-aligned start so
// the full service finishes by close — i.e. an always-bookable slot.
const SLOT_OPEN = 600
const SLOT_CLOSE = 1260
const slotArb = fc.integer({ min: 1, max: 6 }).chain((units) => {
  const duration = units * 30
  const maxK = Math.floor((SLOT_CLOSE - duration - SLOT_OPEN) / 30)
  return fc.record({
    duration: fc.constant(duration),
    startMin: fc.integer({ min: 0, max: maxK }).map((k) => SLOT_OPEN + 30 * k),
  })
})

// Build an in-memory booking store with reschedule semantics matching the real
// query layer (move slot, increment count, append a status-log entry).
function makeStore(booking: {
  id: string
  customerId: string
  status: string
  rescheduleCount: number
  totalDurationMinutes: number
}) {
  const record = {
    ...booking,
    bookingDate: new Date('2026-01-01T00:00:00.000Z'),
    startTime: '10:00',
    endTime: '11:00',
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

  dbMocks.rescheduleBooking.mockImplementation(
    async (
      id: string,
      changedById: string,
      data: { bookingDate: Date; startTime: string; endTime: string },
    ) => {
      if (id !== record.id) return null
      const priorStatus = record.status
      record.bookingDate = data.bookingDate
      record.startTime = data.startTime
      record.endTime = data.endTime
      record.rescheduleCount += 1
      record.statusLogs.push({
        fromStatus: priorStatus,
        toStatus: priorStatus,
        changedById,
        notes: `Rescheduled to ${data.bookingDate.toISOString().slice(0, 10)} ${data.startTime}`,
      })
      return { ...record }
    },
  )

  return record
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/bookings/[id]/reschedule — slot move', () => {
  // Feature: backend-api, Property 19: Rescheduling updates the slot, increments the count, and logs it
  it('Property 19: rescheduling moves the slot, recomputes end time, increments count by one, and logs it', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('pending', 'confirmed'),
        fc.integer({ min: 0, max: 1 }), // prior reschedule count (< MAX_RESCHEDULES = 2)
        fc.integer({ min: 1, max: 60 }), // days ahead (strictly future)
        slotArb,
        async (ownerId, bookingId, status, priorCount, daysAhead, slot) => {
          const store = makeStore({
            id: bookingId,
            customerId: ownerId,
            status,
            rescheduleCount: priorCount,
            totalDurationMinutes: slot.duration,
          })
          sessionMocks.requireSession.mockResolvedValue({ user: { id: ownerId } })

          const bookingDate = istDatePlus(daysAhead)
          const startTime = minutesToTime(slot.startMin)
          const expectedEnd = addMinutesToTime(startTime, slot.duration)

          const res = await rescheduleRoute.POST(postReq(bookingId, { bookingDate, startTime }), {
            params: Promise.resolve({ id: bookingId }),
          })
          const body = await res.json()

          expect(res.status).toBe(200)
          expect(body.success).toBe(true)

          // Slot moved: date + start/end times reflect the request.
          expect(body.data.bookingDate).toBe(`${bookingDate}T00:00:00.000Z`)
          expect(body.data.startTime).toBe(startTime)
          expect(body.data.endTime).toBe(expectedEnd)

          // Reschedule count incremented by exactly one.
          expect(body.data.rescheduleCount).toBe(priorCount + 1)

          // Exactly one status-log entry capturing the reschedule with the actor.
          // (The store is fresh per iteration, so a single entry proves exactly
          // one reschedule occurred for this booking.)
          expect(store.statusLogs).toHaveLength(1)
          expect(store.statusLogs[0]).toMatchObject({
            fromStatus: status,
            toStatus: status,
            changedById: ownerId,
          })
        },
      ),
      { numRuns: 100 },
    )
  })
})
