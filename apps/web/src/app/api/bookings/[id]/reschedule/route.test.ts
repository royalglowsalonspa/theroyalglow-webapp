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
 *                status-log entry (Property 19). The branch's current rules
 *                decide (R6.3): its reschedules per booking and cut-off, and
 *                its hours, lead time and booking window for the new slot; the
 *                move records the settings revision.
 *
 * Layer        : Testing
 *
 * Notes        : Node environment (server route handler). `@/lib/api/session`
 *                and `@rgss/db/queries` are mocked with in-memory fakes; no live
 *                session or DB. `@rgss/business` (slot/grid + time math),
 *                `@rgss/types` (Zod) and `@rgss/errors` stay REAL. Date is
 *                faked to Monday 01/06/2026, 10:00 IST.
 ************************************************************/

import { addMinutesToTime } from '@rgss/business'
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
  getBranchPolicy: vi.fn(),
  getClosureOn: vi.fn(async (): Promise<{ name: string; allBranches: boolean } | null> => null),
  getBookingById: vi.fn(),
  cancelBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
}))

vi.mock('@/lib/api/session', () => sessionMocks)
vi.mock('@rgss/db/queries', () => dbMocks)

import * as rescheduleRoute from '@/app/api/bookings/[id]/reschedule/route'

// Monday 01/06/2026, 10:00 IST.
const NOW = new Date('2026-06-01T04:30:00.000Z')

const POLICY = {
  branchId: 'br_1',
  branchName: 'Rayasandra',
  revision: 4,
  businessHours: DEFAULT_BUSINESS_HOURS,
  bookingRules: DEFAULT_BOOKING_RULES,
}

const postReq = (id: string, body: unknown) =>
  new Request(`https://theroyalglow.in/api/bookings/${id}/reschedule`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

// IST (UTC+5:30) calendar date `days` ahead of now, as YYYY-MM-DD. Using
// days >= 1 keeps the slot strictly in the future and past the lead time.
function istDatePlus(days: number): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

const pad = (n: number) => String(n).padStart(2, '0')
const minutesToTime = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`

// Slot grid within every day's hours: open 10:00 (600), close 21:00 (1260),
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
  bookingDate?: string
  startTime?: string
}) {
  const record = {
    branchId: 'br_1',
    ...booking,
    // By default the appointment is well ahead: past any reschedule cut-off.
    bookingDate: new Date(`${booking.bookingDate ?? '2026-06-20'}T00:00:00.000Z`),
    startTime: booking.startTime ?? '15:00:00',
    endTime: '16:00:00',
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
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  dbMocks.getBranchPolicy.mockResolvedValue(POLICY)
})

afterEach(() => {
  vi.useRealTimers()
})

async function reschedule(bookingDate: string, startTime: string) {
  const res = await rescheduleRoute.POST(postReq('bk_1', { bookingDate, startTime }), {
    params: Promise.resolve({ id: 'bk_1' }),
  })
  return { status: res.status, body: await res.json() }
}

describe('POST /api/bookings/[id]/reschedule — slot move', () => {
  // Feature: backend-api, Property 19: Rescheduling updates the slot, increments the count, and logs it
  it('Property 19: rescheduling moves the slot, recomputes end time, increments count by one, and logs it', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('pending', 'confirmed'),
        fc.integer({ min: 0, max: 1 }), // prior reschedule count (< the branch's 2)
        fc.integer({ min: 1, max: 29 }), // days ahead (strictly future, inside the window)
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

  it('records the settings revision that accepted the new slot', async () => {
    makeStore({
      id: 'bk_1',
      customerId: 'cust_1',
      status: 'confirmed',
      rescheduleCount: 0,
      totalDurationMinutes: 60,
    })
    sessionMocks.requireSession.mockResolvedValue({ user: { id: 'cust_1' } })

    const { status } = await reschedule('2026-06-05', '12:00')

    expect(status).toBe(200)
    expect(dbMocks.getBranchPolicy).toHaveBeenCalledWith('br_1')
    expect(dbMocks.rescheduleBooking).toHaveBeenCalledWith('bk_1', 'cust_1', {
      bookingDate: new Date('2026-06-05T00:00:00.000Z'),
      startTime: '12:00',
      endTime: '13:00',
      settingsRevision: 4,
    })
  })
})

describe('POST /api/bookings/[id]/reschedule — closed days (R1.8, R5.7)', () => {
  it("refuses a day the booking's branch is closed, naming it, and moves nothing", async () => {
    const store = makeStore({
      id: 'bk_1',
      customerId: 'cust_1',
      status: 'confirmed',
      rescheduleCount: 0,
      totalDurationMinutes: 60,
    })
    Object.assign(store, { branchId: 'br_mh' })
    sessionMocks.requireSession.mockResolvedValue({ user: { id: 'cust_1' } })
    dbMocks.getBranchPolicy.mockResolvedValue({
      ...POLICY,
      branchId: 'br_mh',
      branchName: 'Marathahalli',
    })
    dbMocks.getClosureOn.mockResolvedValueOnce({ name: 'Renovation', allBranches: false })
    const bookingDate = istDatePlus(3)
    const [y, m, d] = bookingDate.split('-')

    const { status, body } = await reschedule(bookingDate, '11:00')

    expect(status).toBe(409)
    expect(body.error).toMatchObject({
      code: 'BOOKING_SLOT_UNAVAILABLE',
      message: `Marathahalli is closed on ${d}/${m}/${y} (Renovation).`,
    })
    expect(dbMocks.getClosureOn).toHaveBeenCalledWith('br_mh', bookingDate)
    expect(dbMocks.rescheduleBooking).not.toHaveBeenCalled()
    expect(store.rescheduleCount).toBe(0)
  })
})

describe("POST /api/bookings/[id]/reschedule — the branch's rules (R6.3)", () => {
  beforeEach(() => {
    sessionMocks.requireSession.mockResolvedValue({ user: { id: 'cust_1' } })
  })

  it('refuses inside the reschedule cut-off, leaving cancelling open', async () => {
    // The appointment is at 10:30 today: half an hour away, the cut-off is an hour.
    makeStore({
      id: 'bk_1',
      customerId: 'cust_1',
      status: 'confirmed',
      rescheduleCount: 0,
      totalDurationMinutes: 60,
      bookingDate: '2026-06-01',
      startTime: '10:30:00',
    })

    const { status, body } = await reschedule('2026-06-05', '12:00')

    expect(status).toBe(409)
    expect(body.error).toMatchObject({
      code: ERROR_CODES.BOOKING_RESCHEDULE_WINDOW_PASSED,
      message: 'Reschedule at least 1 hour before the appointment. You can still cancel it.',
    })
    expect(dbMocks.rescheduleBooking).not.toHaveBeenCalled()
  })

  it("stops at this branch's number of reschedules", async () => {
    dbMocks.getBranchPolicy.mockResolvedValue({
      ...POLICY,
      bookingRules: { ...DEFAULT_BOOKING_RULES, maxReschedulesPerBooking: 1 },
    })
    makeStore({
      id: 'bk_1',
      customerId: 'cust_1',
      status: 'pending',
      rescheduleCount: 1,
      totalDurationMinutes: 60,
    })

    const { status, body } = await reschedule('2026-06-05', '12:00')

    expect(status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.BOOKING_MAX_RESCHEDULES)
    expect(dbMocks.rescheduleBooking).not.toHaveBeenCalled()
  })

  it("refuses a new slot outside the branch's hours, a past date or beyond the window", async () => {
    dbMocks.getBranchPolicy.mockResolvedValue({
      ...POLICY,
      businessHours: {
        ...DEFAULT_BUSINESS_HOURS,
        fri: { open: '12:00', close: '18:00', closed: false },
      },
    })
    makeStore({
      id: 'bk_1',
      customerId: 'cust_1',
      status: 'confirmed',
      rescheduleCount: 0,
      totalDurationMinutes: 60,
    })

    const hours = await reschedule('2026-06-05', '17:30')
    expect(hours.body.error).toMatchObject({
      code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
      message: 'Rayasandra is open 12:00–18:00 on Fridays, and the booking must finish by 18:00.',
    })
    const past = await reschedule('2026-05-30', '12:00')
    expect(past.body.error.message).toBe('That date has passed. Choose today or a later date.')
    const far = await reschedule('2026-07-20', '12:00')
    expect(far.body.error.message).toBe('Rayasandra takes bookings up to 30 days ahead.')
    expect(dbMocks.rescheduleBooking).not.toHaveBeenCalled()
  })

  it('answers 409 when the branch has no readable settings', async () => {
    dbMocks.getBranchPolicy.mockRejectedValue(
      conflict(ERROR_CODES.BRANCH_SETTINGS_INCOMPLETE, 'Rayasandra has no valid booking settings.'),
    )
    makeStore({
      id: 'bk_1',
      customerId: 'cust_1',
      status: 'confirmed',
      rescheduleCount: 0,
      totalDurationMinutes: 60,
    })

    const { status, body } = await reschedule('2026-06-05', '12:00')

    expect(status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.BRANCH_SETTINGS_INCOMPLETE)
    expect(dbMocks.rescheduleBooking).not.toHaveBeenCalled()
  })
})
