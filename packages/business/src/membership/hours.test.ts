/************************************************************
 * Module Name  : membership/hours.test
 * Scope        : Business Logic — Membership minutes
 *
 * Description  : Free minutes are purchased less consumed less held; the
 *                session guard refuses an inactive, expired or not-yet-started
 *                membership, and a request for more minutes than are free,
 *                counting the minutes other sessions hold. Validity is
 *                inclusive at both ends, as the database checks it
 *                (membership-scheduling.md, MS-05).
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  assertSessionBookable,
  assertSessionRecordable,
  membershipUnusableAt,
  remainingMinutes,
} from './hours'

const NOW = new Date('2026-10-31T06:00:00.000Z')
// 00:00 IST on 01/10/2026 and 23:59:59.999 IST on 31/12/2026.
const STARTS = new Date('2026-09-30T18:30:00.000Z')
const LATER = new Date('2026-12-31T18:29:59.999Z')

function membership(overrides: Partial<Parameters<typeof assertSessionRecordable>[0]> = {}) {
  return {
    status: 'active',
    startsAt: STARTS,
    expiresAt: LATER,
    totalHoursMinutes: 600,
    usedHoursMinutes: 0,
    reservedMinutes: 0,
    ...overrides,
  }
}

function codeOf(fn: () => void): string | null {
  try {
    fn()
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown'
  }
}

function messageOf(fn: () => void): string | null {
  try {
    fn()
    return null
  } catch (error) {
    return (error as Error).message
  }
}

describe('remainingMinutes', () => {
  it('takes held minutes off as well as consumed ones', () => {
    expect(remainingMinutes(600, 120)).toBe(480)
    expect(remainingMinutes(600, 120, 60)).toBe(420)
  })

  it('never counts a minute twice: free + consumed + held = purchased', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30_000 }), fc.nat(), fc.nat(), (total, a, b) => {
        const used = a % (total + 1)
        const reserved = b % (total - used + 1)
        expect(remainingMinutes(total, used, reserved) + used + reserved).toBe(total)
      }),
    )
  })
})

describe('membershipUnusableAt (MS-05)', () => {
  const m = { status: 'active', startsAt: STARTS, expiresAt: LATER }

  it('takes a session exactly at the start and exactly at the expiry', () => {
    expect(membershipUnusableAt(m, STARTS)).toBeNull()
    expect(membershipUnusableAt(m, LATER)).toBeNull()
    expect(membershipUnusableAt(m, NOW)).toBeNull()
  })

  it('refuses one millisecond either side', () => {
    expect(membershipUnusableAt(m, new Date(STARTS.getTime() - 1))).toBe('not_started')
    expect(membershipUnusableAt(m, new Date(LATER.getTime() + 1))).toBe('expired')
  })

  it('names a cancelled or expired membership whatever the instant', () => {
    expect(membershipUnusableAt({ ...m, status: 'cancelled' }, NOW)).toBe('cancelled')
    expect(membershipUnusableAt({ ...m, status: 'expired' }, NOW)).toBe('expired')
  })

  it('agrees with the interval for every instant (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: STARTS.getTime() - 1e10, max: LATER.getTime() + 1e10 }),
        (ms) => {
          const at = new Date(ms)
          const inside = ms >= STARTS.getTime() && ms <= LATER.getTime()
          expect(membershipUnusableAt(m, at) === null).toBe(inside)
        },
      ),
    )
  })
})

describe('assertSessionRecordable', () => {
  it('accepts a session that fits the free minutes exactly', () => {
    expect(
      codeOf(() =>
        assertSessionRecordable(
          membership({ usedHoursMinutes: 480, reservedMinutes: 60 }),
          60,
          NOW,
        ),
      ),
    ).toBeNull()
  })

  it('counts the minutes other sessions hold', () => {
    expect(
      codeOf(() =>
        assertSessionRecordable(
          membership({ usedHoursMinutes: 480, reservedMinutes: 90 }),
          60,
          NOW,
        ),
      ),
    ).toBe(ERROR_CODES.MEMBERSHIP_INSUFFICIENT_HOURS)
  })

  it('treats a row without held minutes as holding none', () => {
    const { reservedMinutes: _held, ...older } = membership({ usedHoursMinutes: 540 })
    expect(codeOf(() => assertSessionRecordable(older, 60, NOW))).toBeNull()
    expect(codeOf(() => assertSessionRecordable(older, 61, NOW))).toBe(
      ERROR_CODES.MEMBERSHIP_INSUFFICIENT_HOURS,
    )
  })

  it.each([
    ['expired', membership({ status: 'expired' })],
    ['cancelled', membership({ status: 'cancelled' })],
    ['past its expiry', membership({ expiresAt: new Date(NOW.getTime() - 1) })],
  ])('refuses a membership that is %s', (_label, m) => {
    expect(codeOf(() => assertSessionRecordable(m, 60, NOW))).toBe(ERROR_CODES.MEMBERSHIP_EXPIRED)
  })

  it('accepts a session at the stored expiry instant', () => {
    expect(
      codeOf(() => assertSessionRecordable(membership({ expiresAt: NOW }), 60, NOW)),
    ).toBeNull()
  })

  it('refuses a membership sold to start later, naming its start date in IST', () => {
    // 00:00 IST on 05/11/2026.
    const later = membership({ startsAt: new Date('2026-11-04T18:30:00.000Z') })

    expect(codeOf(() => assertSessionRecordable(later, 60, NOW))).toBe(
      ERROR_CODES.MEMBERSHIP_NOT_STARTED,
    )
    expect(messageOf(() => assertSessionRecordable(later, 60, NOW))).toBe(
      'This membership starts on 05/11/2026. Sessions can be recorded from then.',
    )
  })

  it('accepts a session at the start instant, and skips the check without a start', () => {
    expect(codeOf(() => assertSessionRecordable(membership({ startsAt: NOW }), 60, NOW))).toBeNull()
    const { startsAt: _start, ...noStart } = membership()
    expect(
      codeOf(() => assertSessionRecordable(noStart, 60, new Date(STARTS.getTime() - 1))),
    ).toBeNull()
  })
})

describe('assertSessionBookable (a session booked ahead)', () => {
  // 16:00 IST on 07/11/2026.
  const PLANNED = new Date('2026-11-07T10:30:00.000Z')

  it('books within validity when the minutes are free now', () => {
    expect(
      codeOf(() =>
        assertSessionBookable(
          membership({ usedHoursMinutes: 480, reservedMinutes: 60 }),
          60,
          PLANNED,
        ),
      ),
    ).toBeNull()
    expect(
      codeOf(() =>
        assertSessionBookable(
          membership({ usedHoursMinutes: 480, reservedMinutes: 90 }),
          60,
          PLANNED,
        ),
      ),
    ).toBe(ERROR_CODES.MEMBERSHIP_INSUFFICIENT_HOURS)
  })

  it('books for after a later start, from the start instant', () => {
    const later = membership({ startsAt: PLANNED })

    expect(codeOf(() => assertSessionBookable(later, 60, PLANNED))).toBeNull()
    expect(messageOf(() => assertSessionBookable(later, 60, new Date(PLANNED.getTime() - 1)))).toBe(
      'This membership starts on 07/11/2026. Choose a time from then.',
    )
    expect(codeOf(() => assertSessionBookable(later, 60, new Date(PLANNED.getTime() - 1)))).toBe(
      ERROR_CODES.MEMBERSHIP_NOT_STARTED,
    )
  })

  it('refuses a time past the expiry, saying until when it can book', () => {
    const ending = membership({ expiresAt: PLANNED })

    expect(codeOf(() => assertSessionBookable(ending, 60, PLANNED))).toBeNull()
    const after = new Date(PLANNED.getTime() + 1)
    expect(codeOf(() => assertSessionBookable(ending, 60, after))).toBe(
      ERROR_CODES.MEMBERSHIP_EXPIRED,
    )
    expect(messageOf(() => assertSessionBookable(ending, 60, after))).toBe(
      'This membership expires on 07/11/2026. Choose a time before then.',
    )
  })

  it.each([
    ['cancelled', 'This membership was cancelled.'],
    ['expired', 'This membership is not active or has expired'],
  ])('refuses a %s membership at any time', (status, message) => {
    const m = membership({ status })

    expect(codeOf(() => assertSessionBookable(m, 60, PLANNED))).toBe(ERROR_CODES.MEMBERSHIP_EXPIRED)
    expect(messageOf(() => assertSessionBookable(m, 60, PLANNED))).toBe(message)
  })
})
