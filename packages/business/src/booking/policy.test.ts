/************************************************************
 * Module Name  : booking/policy.test
 * Scope        : Unit tests — a branch's booking policy (multi-branch R6.3, TX-09)
 *
 * Description  : The pure resolver every booking action uses:
 *                - slots: past dates, the booking window and lead time for
 *                  customers only, closed weekdays, the half-hour grid and the
 *                  branch's opening hours, with a reason for each refusal;
 *                - days: the same day-level reasons, for availability;
 *                - the terms a customer's booking page shows;
 *                - the per-branch limit of upcoming bookings;
 *                - late cancellations within the cut-off (allowed, recorded);
 *                - reschedules: status, the branch's limit and its cut-off;
 *                - one branch's edited rules change its next decision only.
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import {
  type BookingRules,
  type BusinessHours,
  DEFAULT_BOOKING_RULES,
  DEFAULT_BUSINESS_HOURS,
} from '@rgss/types'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  appointmentStartsAt,
  assertBookingCap,
  assertReschedulable,
  assertSlotBookable,
  type BranchPolicy,
  bookingTerms,
  cancellationTerms,
  dayRefusal,
  durationText,
  isCustomerCancellable,
  lastBookableDate,
  openWindowOn,
  rescheduleTerms,
  type SlotRequest,
  slotRefusal,
  weekdayOf,
} from './policy'

// Friday 30/10/2026, 11:00 IST.
const NOW = new Date('2026-10-30T05:30:00.000Z')

function policy(
  rules: Partial<BookingRules> = {},
  hours: Partial<BusinessHours> = {},
  revision = 1,
): BranchPolicy {
  return {
    revision,
    businessHours: { ...DEFAULT_BUSINESS_HOURS, ...hours },
    bookingRules: { ...DEFAULT_BOOKING_RULES, ...rules },
  }
}

function request(overrides: Partial<SlotRequest> = {}): SlotRequest {
  return {
    date: '2026-11-02',
    startTime: '11:00',
    durationMinutes: 60,
    now: NOW,
    actor: 'customer',
    branchName: 'Rayasandra',
    ...overrides,
  }
}

describe('calendar helpers', () => {
  it('reads the weekday of a calendar date', () => {
    expect(weekdayOf('2026-10-30')).toBe('fri')
    expect(weekdayOf('2026-11-01')).toBe('sun')
    expect(weekdayOf('2026-11-02')).toBe('mon')
  })

  it('gives the day’s opening window, or null when closed', () => {
    expect(openWindowOn(DEFAULT_BUSINESS_HOURS, '2026-10-31')).toEqual({
      openMinutes: 600,
      closeMinutes: 1320,
    })
    const closedMonday = {
      ...DEFAULT_BUSINESS_HOURS,
      mon: { open: null, close: null, closed: true },
    }
    expect(openWindowOn(closedMonday, '2026-11-02')).toBeNull()
  })

  it('starts an appointment on the IST clock', () => {
    expect(appointmentStartsAt('2026-11-02', '11:00').toISOString()).toBe(
      '2026-11-02T05:30:00.000Z',
    )
    expect(appointmentStartsAt('2026-11-02', '11:00:00').toISOString()).toBe(
      '2026-11-02T05:30:00.000Z',
    )
  })

  it('counts the booking window from today in IST', () => {
    expect(lastBookableDate(DEFAULT_BOOKING_RULES, NOW)).toBe('2026-11-29')
    // 23:59 IST on 31/10 is still the 31st in India, the 31st in UTC too.
    expect(
      lastBookableDate(
        { ...DEFAULT_BOOKING_RULES, maxAdvanceBookingDays: 1 },
        new Date('2026-10-31T18:29:00.000Z'),
      ),
    ).toBe('2026-11-01')
    // 00:30 IST on 1/11 is the 1st in India, still the 31st in UTC.
    expect(
      lastBookableDate(
        { ...DEFAULT_BOOKING_RULES, maxAdvanceBookingDays: 1 },
        new Date('2026-10-31T19:00:00.000Z'),
      ),
    ).toBe('2026-11-02')
  })

  it.each([
    [60, '1 hour'],
    [90, '90 minutes'],
    [120, '2 hours'],
    [1, '1 minute'],
    [1440, '1 day'],
    [43_200, '30 days'],
  ])('writes %i minutes as "%s"', (minutes, text) => {
    expect(durationText(minutes)).toBe(text)
  })
})

describe('slotRefusal — what the branch takes', () => {
  it('accepts a slot inside the hours, window and lead time', () => {
    expect(slotRefusal(policy(), request())).toBeNull()
    // The last slot that finishes at closing on a Saturday (22:00).
    expect(
      slotRefusal(
        policy(),
        request({ date: '2026-10-31', startTime: '21:00', durationMinutes: 60 }),
      ),
    ).toBeNull()
  })

  it.each([
    ['a past date', { date: '2026-10-29' }, 'That date has passed. Choose today or a later date.'],
    ['a malformed date', { date: '2026-02-30' }, 'Choose a valid date and time.'],
    ['a malformed time', { startTime: '25:00' }, 'Choose a valid date and time.'],
    ['no duration', { durationMinutes: 0 }, 'Choose a valid date and time.'],
    [
      'a time off the half hour',
      { startTime: '11:15' },
      'Choose a time on the hour or the half hour.',
    ],
    [
      'a start before opening',
      { startTime: '09:30' },
      'Rayasandra is open 10:00–21:00 on Mondays, and the booking must finish by 21:00.',
    ],
    [
      'a finish after closing',
      { startTime: '20:30', durationMinutes: 60 },
      'Rayasandra is open 10:00–21:00 on Mondays, and the booking must finish by 21:00.',
    ],
    [
      'a date past the booking window',
      { date: '2026-11-30' },
      'Rayasandra takes bookings up to 30 days ahead.',
    ],
    [
      'a time that has passed today',
      { date: '2026-10-30', startTime: '10:30' },
      'That time has passed. Choose a later time.',
    ],
    [
      'a time inside the lead time',
      { date: '2026-10-30', startTime: '11:30' },
      'Book at least 1 hour ahead.',
    ],
  ])('refuses %s', (_label, overrides, reason) => {
    expect(slotRefusal(policy(), request(overrides))).toBe(reason)
  })

  it('refuses a weekday the branch is closed', () => {
    const closedMondays = policy({}, { mon: { open: null, close: null, closed: true } })
    expect(slotRefusal(closedMondays, request())).toBe('Rayasandra is closed on Mondays.')
    // Staff can't book it either.
    expect(slotRefusal(closedMondays, request({ actor: 'staff' }))).toBe(
      'Rayasandra is closed on Mondays.',
    )
  })

  it('holds staff at the counter to the hours, not the lead time or window', () => {
    // A walk-in starting now, and one booked beyond the customer window.
    expect(
      slotRefusal(policy(), request({ actor: 'staff', date: '2026-10-30', startTime: '11:00' })),
    ).toBeNull()
    expect(slotRefusal(policy(), request({ actor: 'staff', date: '2027-01-04' }))).toBeNull()
    // Still not outside the hours or on a past date.
    expect(slotRefusal(policy(), request({ actor: 'staff', startTime: '21:00' }))).toMatch(
      /must finish by 21:00/,
    )
    expect(slotRefusal(policy(), request({ actor: 'staff', date: '2026-10-29' }))).toMatch(
      /has passed/,
    )
  })

  it('accepts exactly at the lead time and the last day of the window', () => {
    expect(slotRefusal(policy(), request({ date: '2026-10-30', startTime: '12:00' }))).toBeNull()
    expect(slotRefusal(policy(), request({ date: '2026-11-29' }))).toBeNull()
  })

  it('throws 409 BOOKING_SLOT_UNAVAILABLE with the reason', () => {
    expect(() => assertSlotBookable(policy(), request({ startTime: '11:15' }))).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
        statusCode: 409,
        message: 'Choose a time on the hour or the half hour.',
      }),
    )
  })

  it('never accepts a slot that ends after closing (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 47 }),
        fc.integer({ min: 15, max: 300 }),
        fc.constantFrom<'customer' | 'staff'>('customer', 'staff'),
        (halfHour, durationMinutes, actor) => {
          const start = halfHour * 30
          const startTime = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`
          const refusal = slotRefusal(policy(), request({ startTime, durationMinutes, actor }))
          const fits = start >= 600 && start + durationMinutes <= 1260
          expect(refusal === null).toBe(fits)
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('assertBookingCap — upcoming bookings at the branch', () => {
  it('allows bookings under the branch’s limit', () => {
    expect(() =>
      assertBookingCap({
        rules: DEFAULT_BOOKING_RULES,
        upcomingAtBranch: 2,
        branchName: 'Rayasandra',
      }),
    ).not.toThrow()
  })

  it('refuses at the limit with 409 BOOKING_LIMIT_REACHED', () => {
    expect(() =>
      assertBookingCap({
        rules: DEFAULT_BOOKING_RULES,
        upcomingAtBranch: 3,
        branchName: 'Rayasandra',
      }),
    ).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.BOOKING_LIMIT_REACHED,
        statusCode: 409,
        message:
          'You already have 3 upcoming bookings at Rayasandra, the most it takes at once. Cancel one, or book again after your visit.',
      }),
    )
    expect(() =>
      assertBookingCap({
        rules: { ...DEFAULT_BOOKING_RULES, maxActiveBookingsPerCustomer: 1 },
        upcomingAtBranch: 1,
        branchName: 'Marathahalli',
      }),
    ).toThrow(/You already have 1 upcoming booking at Marathahalli/)
  })
})

describe('cancellationTerms — late within the cut-off', () => {
  const startsAt = appointmentStartsAt('2026-10-30', '15:00')

  it('is late within the cut-off and not at or before it', () => {
    // 4 hours before 15:00 is 11:00, which is now.
    expect(cancellationTerms({ rules: DEFAULT_BOOKING_RULES, startsAt, now: NOW })).toEqual({
      late: false,
      cutoffHours: 4,
    })
    expect(
      cancellationTerms({
        rules: DEFAULT_BOOKING_RULES,
        startsAt,
        now: new Date(NOW.getTime() + 60_000),
      }),
    ).toEqual({ late: true, cutoffHours: 4 })
  })

  it('is never late with no cut-off, until the appointment starts', () => {
    const rules = { ...DEFAULT_BOOKING_RULES, cancellationCutoffHours: 0 }
    expect(cancellationTerms({ rules, startsAt, now: startsAt }).late).toBe(false)
    expect(cancellationTerms({ rules, startsAt, now: new Date(startsAt.getTime() + 1) }).late).toBe(
      true,
    )
  })
})

describe('rescheduleTerms — the branch’s limit and cut-off', () => {
  const startsAt = appointmentStartsAt('2026-10-30', '15:00')
  const base = {
    rules: DEFAULT_BOOKING_RULES,
    status: 'confirmed',
    rescheduleCount: 0,
    startsAt,
    now: NOW,
  }

  it('allows a reschedule in time, saying how many remain', () => {
    expect(rescheduleTerms(base)).toEqual({ allowed: true, remaining: 2, cutoffHours: 1 })
    expect(rescheduleTerms({ ...base, rescheduleCount: 1 })).toMatchObject({
      allowed: true,
      remaining: 1,
    })
  })

  it('refuses after the branch’s number of reschedules', () => {
    expect(rescheduleTerms({ ...base, rescheduleCount: 2 })).toEqual({
      allowed: false,
      code: 'MAX_RESCHEDULES',
      message: 'This booking has already been rescheduled 2 times. Please cancel and book again.',
    })
    expect(
      rescheduleTerms({
        ...base,
        rules: { ...DEFAULT_BOOKING_RULES, maxReschedulesPerBooking: 1 },
        rescheduleCount: 1,
      }),
    ).toMatchObject({
      message: 'This booking has already been rescheduled 1 time. Please cancel and book again.',
    })
    expect(
      rescheduleTerms({
        ...base,
        rules: { ...DEFAULT_BOOKING_RULES, maxReschedulesPerBooking: 0 },
      }),
    ).toMatchObject({
      allowed: false,
      code: 'MAX_RESCHEDULES',
      message: expect.stringMatching(/can’t be rescheduled online/),
    })
  })

  it('refuses inside the reschedule cut-off', () => {
    const soon = appointmentStartsAt('2026-10-30', '11:30')
    expect(rescheduleTerms({ ...base, startsAt: soon })).toEqual({
      allowed: false,
      code: 'WINDOW_PASSED',
      message: 'Reschedule at least 1 hour before the appointment. You can still cancel it.',
    })
  })

  it('refuses a booking that is not pending or confirmed', () => {
    expect(rescheduleTerms({ ...base, status: 'completed' })).toMatchObject({
      allowed: false,
      code: 'NOT_RESCHEDULABLE',
    })
  })

  it('maps each refusal to its 409 code', () => {
    const soon = appointmentStartsAt('2026-10-30', '11:30')
    expect(() => assertReschedulable({ ...base, startsAt: soon })).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.BOOKING_RESCHEDULE_WINDOW_PASSED,
        statusCode: 409,
      }),
    )
    expect(() => assertReschedulable({ ...base, rescheduleCount: 2 })).toThrow(
      expect.objectContaining({ code: ERROR_CODES.BOOKING_MAX_RESCHEDULES }),
    )
    expect(() => assertReschedulable({ ...base, status: 'cancelled' })).toThrow(
      expect.objectContaining({ code: ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION }),
    )
    expect(() => assertReschedulable(base)).not.toThrow()
  })
})

describe('dayRefusal — whether the branch takes bookings that day', () => {
  const day = { date: '2026-11-02', now: NOW, actor: 'customer' as const, branchName: 'Rayasandra' }

  it('takes a future weekday inside the window', () => {
    expect(dayRefusal(policy(), day)).toBeNull()
    expect(dayRefusal(policy(), { ...day, date: '2026-10-30' })).toBeNull()
  })

  it('says why a day has no bookings, in the slot refusal’s words', () => {
    const closedMondays = policy({}, { mon: { open: null, close: null, closed: true } })
    expect(dayRefusal(closedMondays, day)).toBe('Rayasandra is closed on Mondays.')
    expect(dayRefusal(policy(), { ...day, date: '2026-11-30' })).toBe(
      'Rayasandra takes bookings up to 30 days ahead.',
    )
    expect(dayRefusal(policy(), { ...day, date: '2026-10-29' })).toBe(
      'That date has passed. Choose today or a later date.',
    )
    expect(dayRefusal(policy(), { ...day, date: '2026-02-30' })).toBe(
      'Choose a valid date and time.',
    )
  })

  it('lets staff book beyond the customer window, but not a closed weekday', () => {
    const closedMondays = policy({}, { mon: { open: null, close: null, closed: true } })
    expect(dayRefusal(policy(), { ...day, actor: 'staff', date: '2027-01-05' })).toBeNull()
    expect(dayRefusal(closedMondays, { ...day, actor: 'staff' })).toBe(
      'Rayasandra is closed on Mondays.',
    )
  })

  it('agrees with slotRefusal on every day-level refusal (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -3, max: 40 }),
        fc.constantFrom<'customer' | 'staff'>('customer', 'staff'),
        fc.boolean(),
        (offset, actor, closedMondays) => {
          const date = new Date(Date.UTC(2026, 9, 30 + offset)).toISOString().slice(0, 10)
          const branch = closedMondays
            ? policy({}, { mon: { open: null, close: null, closed: true } })
            : policy()
          const reason = dayRefusal(branch, { date, now: NOW, actor, branchName: 'Rayasandra' })
          if (reason !== null) {
            expect(slotRefusal(branch, request({ date, actor, startTime: '14:00' }))).toBe(reason)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})

describe('bookingTerms — what the customer may do now', () => {
  const startsAt = appointmentStartsAt('2026-10-30', '14:00')
  const base = { rules: DEFAULT_BOOKING_RULES, rescheduleCount: 0, startsAt, now: NOW }

  it('offers cancelling for pending and confirmed bookings only', () => {
    expect(isCustomerCancellable('pending')).toBe(true)
    expect(isCustomerCancellable('confirmed')).toBe(true)
    for (const status of ['in_progress', 'completed', 'cancelled', 'rejected', 'no_show']) {
      expect(isCustomerCancellable(status)).toBe(false)
    }
  })

  it('says a cancellation now is late, and a reschedule still allowed', () => {
    // 14:00 is three hours away: inside the four-hour cut-off.
    expect(bookingTerms({ ...base, status: 'confirmed' })).toEqual({
      cancel: { late: true, cutoffHours: 4 },
      reschedule: { allowed: true, remaining: 2, cutoffHours: 1 },
    })
  })

  it('has no cancellation for a finished booking, and says why it can’t move', () => {
    expect(bookingTerms({ ...base, status: 'completed' })).toEqual({
      cancel: null,
      reschedule: expect.objectContaining({ allowed: false, code: 'NOT_RESCHEDULABLE' }),
    })
  })
})

describe('an edited policy decides only the next action at its branch (TX-09)', () => {
  it('gives each branch’s revision its own answer for the same request', () => {
    const rayasandra = policy({}, {}, 4)
    // Marathahalli opens later and asks for two hours' notice.
    const marathahalli = policy(
      { minAdvanceLeadTimeMinutes: 120 },
      { fri: { open: '12:00', close: '20:00', closed: false } },
      2,
    )
    const atRayasandra = request({ date: '2026-10-30', startTime: '12:30' })
    const atMarathahalli = { ...atRayasandra, branchName: 'Marathahalli' }

    expect(slotRefusal(rayasandra, atRayasandra)).toBeNull()
    expect(slotRefusal(marathahalli, atMarathahalli)).toBe('Book at least 2 hours ahead.')
    expect(slotRefusal(marathahalli, { ...atMarathahalli, startTime: '13:00' })).toBeNull()
    expect(slotRefusal(marathahalli, { ...atMarathahalli, startTime: '19:30' })).toBe(
      'Marathahalli is open 12:00–20:00 on Fridays, and the booking must finish by 20:00.',
    )
  })
})
