// @vitest-environment node
/************************************************************
 * Module Name  : bookings/[id]/reschedule route.test (admin)
 * Scope        : API — Admin Booking (membership-scheduling.md slice 3)
 *
 * Description  : POST /api/bookings/[id]/reschedule: the salon moves a
 *                pending or confirmed booking at the active branch to another
 *                date and start time, keeping its length:
 *                - the move is made by the person acting, records the branch
 *                  settings revision that allowed it, and doesn't count
 *                  against the customer's reschedule limit;
 *                - the answer says whether the booking now needs someone
 *                  else (its person couldn't take the new time), but not for
 *                  a booking only held up;
 *                - a closed day, a time outside the branch's hours or off
 *                  the half-hour grid, and a time already passed are 409,
 *                  writing nothing; the customer's booking window and lead
 *                  time don't apply;
 *                - a booking under way or ended is 409, one at another
 *                  branch 404, a page rendered for another branch 409.
 *
 * Approach     : requireBranchRole, @rgss/db/queries and the realtime
 *                publisher are mocked; assertRenderedBranch, @rgss/business,
 *                @rgss/errors and @rgss/types stay REAL. The clock is fixed.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import { DEFAULT_BOOKING_RULES, DEFAULT_BUSINESS_HOURS } from '@rgss/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { branchContext, OTHER_BRANCH, TEST_BRANCH } from '@/test/branch-context'

const branchMocks = vi.hoisted(() => ({ requireBranchRole: vi.fn() }))
const dbMocks = vi.hoisted(() => ({
  getBookingForAdmin: vi.fn(),
  getBranchPolicy: vi.fn(),
  getClosureOn: vi.fn(async (): Promise<{ name: string; allBranches: boolean } | null> => null),
  getOpenReassignmentsFor: vi.fn(),
  rescheduleBooking: vi.fn(),
}))
const publishMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/api/branch-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/branch-context')>()
  return { ...actual, requireBranchRole: branchMocks.requireBranchRole }
})
vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/realtime/publish', () => ({ publishBookingEvent: publishMock }))

import { POST } from './route'

const BOOKING_ID = 'bk_move_1'

// Monday 02/11/2026, 12:10 IST.
const NOW = new Date('2026-11-02T06:40:00.000Z')

// The active branch's current settings: the defaults (10:00–21:00 on
// weekdays, 30 days ahead for customers) at revision 7.
const POLICY = {
  branchId: TEST_BRANCH.id,
  branchName: TEST_BRANCH.name,
  revision: 7,
  businessHours: DEFAULT_BUSINESS_HOURS,
  bookingRules: DEFAULT_BOOKING_RULES,
}

function move(body: Record<string, unknown>) {
  return POST(
    new Request(`https://admin.theroyalglow.in/api/bookings/${BOOKING_ID}/reschedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ branchId: TEST_BRANCH.id, ...body }),
    }),
    { params: Promise.resolve({ id: BOOKING_ID }) },
  )
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string } }).error
}

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  branchMocks.requireBranchRole.mockResolvedValue(branchContext({ userId: 'u_rec' }))
  dbMocks.getBookingForAdmin.mockResolvedValue({
    id: BOOKING_ID,
    status: 'confirmed',
    customerId: 'cust_1',
    totalDurationMinutes: 90,
  })
  dbMocks.getBranchPolicy.mockResolvedValue(POLICY)
  dbMocks.getClosureOn.mockResolvedValue(null)
  dbMocks.getOpenReassignmentsFor.mockResolvedValue(new Map())
  dbMocks.rescheduleBooking.mockImplementation(async (id: string) => ({
    id,
    status: 'confirmed',
    startTime: '11:00:00',
  }))
})

describe('POST /api/bookings/[id]/reschedule (admin)', () => {
  it('moves a confirmed booking, keeping its length, outside the customer’s limit', async () => {
    const res = await move({ bookingDate: '2026-11-03', startTime: '11:00' })

    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({
      booking: { id: BOOKING_ID, status: 'confirmed', startTime: '11:00:00' },
      needsStaff: false,
    })
    expect(branchMocks.requireBranchRole).toHaveBeenCalledWith('receptionist')
    expect(dbMocks.getBookingForAdmin).toHaveBeenCalledWith(BOOKING_ID, TEST_BRANCH.id)
    expect(dbMocks.getClosureOn).toHaveBeenCalledWith(TEST_BRANCH.id, '2026-11-03')
    expect(dbMocks.rescheduleBooking).toHaveBeenCalledWith(BOOKING_ID, 'u_rec', {
      bookingDate: new Date('2026-11-03T00:00:00.000Z'),
      startTime: '11:00',
      endTime: '12:30',
      settingsRevision: 7,
      countsTowardLimit: false,
    })
    expect(publishMock).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      branchId: TEST_BRANCH.id,
      customerId: 'cust_1',
      event: 'status_changed',
      data: { status: 'confirmed' },
    })
  })

  it('moves a pending booking too', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue({
      id: BOOKING_ID,
      status: 'pending',
      customerId: 'cust_1',
      totalDurationMinutes: 60,
    })

    const res = await move({ bookingDate: '2026-11-03', startTime: '15:30' })

    expect(res.status).toBe(200)
    expect(dbMocks.rescheduleBooking).toHaveBeenCalledWith(
      BOOKING_ID,
      'u_rec',
      expect.objectContaining({ startTime: '15:30', endTime: '16:30', countsTowardLimit: false }),
    )
  })

  it('says when the move took its person off it, so it needs someone else', async () => {
    dbMocks.getOpenReassignmentsFor.mockResolvedValue(
      new Map([[BOOKING_ID, { reason: 'off_schedule', heldUp: false }]]),
    )

    const res = await move({ bookingDate: '2026-11-03', startTime: '11:00' })

    expect(res.status).toBe(200)
    expect((await res.json()).data.needsStaff).toBe(true)
    expect(dbMocks.getOpenReassignmentsFor).toHaveBeenCalledWith([BOOKING_ID])
  })

  it('doesn’t ask for someone else for a booking only held up', async () => {
    dbMocks.getOpenReassignmentsFor.mockResolvedValue(
      new Map([[BOOKING_ID, { reason: 'overrun', heldUp: true }]]),
    )

    const res = await move({ bookingDate: '2026-11-03', startTime: '11:00' })

    expect((await res.json()).data.needsStaff).toBe(false)
  })

  it('moves beyond the customer’s booking window and inside their lead time', async () => {
    // 60 days ahead, and 50 minutes from now: both refused to a customer.
    expect((await move({ bookingDate: '2027-01-01', startTime: '11:00' })).status).toBe(200)
    expect((await move({ bookingDate: '2026-11-02', startTime: '13:00' })).status).toBe(200)
  })

  it('refuses a day the branch is closed, saying so, and moves nothing', async () => {
    dbMocks.getClosureOn.mockResolvedValue({ name: 'Diwali', allBranches: false })

    const res = await move({ bookingDate: '2026-11-08', startTime: '11:00' })
    const error = await errorOf(res)

    expect(res.status).toBe(409)
    expect(error.code).toBe(ERROR_CODES.BOOKING_SLOT_UNAVAILABLE)
    expect(error.message).toContain('Rayasandra is closed on 08/11/2026 (Diwali).')
    expect(dbMocks.rescheduleBooking).not.toHaveBeenCalled()
  })

  it.each([
    ['outside the branch’s hours', '2026-11-03', '20:00', 'is open 10:00–21:00 on Tuesdays'],
    ['off the half-hour grid', '2026-11-03', '11:15', 'on the hour or the half hour'],
    ['on a date already passed', '2026-11-01', '11:00', 'That date has passed'],
    ['at a time already passed today', '2026-11-02', '11:30', 'That time has passed'],
  ])('refuses a time %s and moves nothing', async (_case, bookingDate, startTime, says) => {
    const res = await move({ bookingDate, startTime })
    const error = await errorOf(res)

    expect(res.status).toBe(409)
    expect(error.code).toBe(ERROR_CODES.BOOKING_SLOT_UNAVAILABLE)
    expect(error.message).toContain(says)
    expect(dbMocks.rescheduleBooking).not.toHaveBeenCalled()
  })

  it('refuses a booking under way, saying why', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue({
      id: BOOKING_ID,
      status: 'in_progress',
      customerId: 'cust_1',
      totalDurationMinutes: 60,
    })

    const res = await move({ bookingDate: '2026-11-03', startTime: '11:00' })
    const error = await errorOf(res)

    expect(res.status).toBe(409)
    expect(error.code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
    expect(error.message).toBe('This booking is under way, so it can’t be moved.')
    expect(dbMocks.rescheduleBooking).not.toHaveBeenCalled()
  })

  it.each(['completed', 'cancelled', 'rejected', 'no_show'])(
    'refuses a %s booking with 409, moving nothing',
    async (status) => {
      dbMocks.getBookingForAdmin.mockResolvedValue({
        id: BOOKING_ID,
        status,
        customerId: 'cust_1',
        totalDurationMinutes: 60,
      })

      const res = await move({ bookingDate: '2026-11-03', startTime: '11:00' })

      expect(res.status).toBe(409)
      expect((await errorOf(res)).code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
      expect(dbMocks.rescheduleBooking).not.toHaveBeenCalled()
    },
  )

  it('treats a booking at another branch as not found', async () => {
    dbMocks.getBookingForAdmin.mockResolvedValue(null)

    const res = await move({ bookingDate: '2026-11-03', startTime: '11:00' })

    expect(res.status).toBe(404)
    expect(dbMocks.rescheduleBooking).not.toHaveBeenCalled()
  })

  it('refuses a page rendered for another branch, reading nothing', async () => {
    const res = await move({
      branchId: OTHER_BRANCH.id,
      bookingDate: '2026-11-03',
      startTime: '11:00',
    })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.BRANCH_CONTEXT_CHANGED)
    expect(dbMocks.getBookingForAdmin).not.toHaveBeenCalled()
  })

  it.each([
    ['a malformed date', { bookingDate: '3/11/2026', startTime: '11:00' }],
    ['a malformed time', { bookingDate: '2026-11-03', startTime: '11am' }],
    ['no time', { bookingDate: '2026-11-03' }],
  ])('answers 400 for %s', async (_case, body) => {
    const res = await move(body)

    expect(res.status).toBe(400)
    expect(dbMocks.getBookingForAdmin).not.toHaveBeenCalled()
  })

  it('answers a move that found the booking changed meanwhile with the error it raised', async () => {
    dbMocks.rescheduleBooking.mockRejectedValue(
      conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        'This booking changed while you were rescheduling it. Reload it to see where it stands.',
      ),
    )

    const res = await move({ bookingDate: '2026-11-03', startTime: '11:00' })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe(ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION)
    expect(publishMock).not.toHaveBeenCalled()
  })
})
