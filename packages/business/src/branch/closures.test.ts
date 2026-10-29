import { AppError, ERROR_CODES } from '@rgss/errors'
import { CLOSURE_MAX_DAYS } from '@rgss/types'
import { describe, expect, it } from 'vitest'
import {
  assertBranchOpenOn,
  assertCanManageClosure,
  canManageClosure,
  closedDayMessage,
  closureDates,
} from './closures'

const TODAY = '2026-10-29'

function errorOf(fn: () => unknown): AppError {
  try {
    fn()
  } catch (error) {
    if (error instanceof AppError) {
      return error
    }
    throw error
  }
  throw new Error('expected an AppError')
}

describe('closureDates', () => {
  it('closes one day, or every day of an inclusive range', () => {
    expect(closureDates({ date: '2026-11-01', today: TODAY })).toEqual(['2026-11-01'])
    expect(closureDates({ date: '2026-12-30', endDate: '2027-01-02', today: TODAY })).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
  })

  it('allows today but not the past', () => {
    expect(closureDates({ date: TODAY, today: TODAY })).toEqual([TODAY])
    expect(errorOf(() => closureDates({ date: '2026-10-28', today: TODAY })).statusCode).toBe(400)
  })

  it('refuses a range that ends before it starts', () => {
    const error = errorOf(() =>
      closureDates({ date: '2026-11-05', endDate: '2026-11-04', today: TODAY }),
    )
    expect(error.statusCode).toBe(400)
    expect(error.message).toBe('The closure ends before it starts.')
  })

  it(`allows at most ${CLOSURE_MAX_DAYS} days`, () => {
    // 1 to 31 December: 31 days.
    expect(closureDates({ date: '2026-12-01', endDate: '2026-12-31', today: TODAY })).toHaveLength(
      CLOSURE_MAX_DAYS,
    )
    expect(
      errorOf(() => closureDates({ date: '2026-12-01', endDate: '2027-01-01', today: TODAY }))
        .statusCode,
    ).toBe(400)
  })

  it('crosses a leap day correctly', () => {
    expect(closureDates({ date: '2028-02-28', endDate: '2028-03-01', today: TODAY })).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ])
  })
})

describe('canManageClosure', () => {
  it("lets the branch's Manager, Owner and the Developer change its closures", () => {
    expect(canManageClosure('manager', false)).toBe(true)
    expect(canManageClosure('owner', false)).toBe(true)
    expect(canManageClosure('developer', false)).toBe(true)
    expect(canManageClosure('receptionist', false)).toBe(false)
    expect(canManageClosure('staff', false)).toBe(false)
  })

  it('lets only the Developer close every branch', () => {
    expect(canManageClosure('developer', true)).toBe(true)
    expect(canManageClosure('owner', true)).toBe(false)
    expect(canManageClosure('manager', true)).toBe(false)
  })

  it('assertCanManageClosure answers 403 with the reason', () => {
    expect(errorOf(() => assertCanManageClosure('owner', true))).toMatchObject({
      statusCode: 403,
      message: 'Only the Developer can close every branch.',
    })
    expect(() => assertCanManageClosure('manager', false)).not.toThrow()
  })
})

describe('closedDayMessage / assertBranchOpenOn', () => {
  it('says nothing when the branch is open', () => {
    expect(closedDayMessage(null, 'Rayasandra', '2026-11-01')).toBeNull()
    expect(() => assertBranchOpenOn(null, 'Rayasandra', '2026-11-01')).not.toThrow()
  })

  it('names the branch, the date and the closure', () => {
    expect(
      closedDayMessage({ name: 'Diwali', allBranches: true }, 'Rayasandra', '2026-11-08'),
    ).toBe('Rayasandra is closed on 08/11/2026 (Diwali).')
  })

  it('refuses a booking with 409 BOOKING_SLOT_UNAVAILABLE and the staff hint', () => {
    const error = errorOf(() =>
      assertBranchOpenOn(
        { name: 'Renovation', allBranches: false },
        'Marathahalli',
        '2026-11-03',
        'Ask the branch Manager to remove the closure if the branch is open.',
      ),
    )
    expect(error.statusCode).toBe(409)
    expect(error.code).toBe(ERROR_CODES.BOOKING_SLOT_UNAVAILABLE)
    expect(error.message).toBe(
      'Marathahalli is closed on 03/11/2026 (Renovation). Ask the branch Manager to remove the closure if the branch is open.',
    )
  })
})
