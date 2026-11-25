import { describe, expect, it } from 'vitest'
import {
  daysUntilIST,
  isSameISTDay,
  istDateInDays,
  istDayStart,
  istToday,
  monthKeyIST,
  noShowCheckDelaySeconds,
  reminderWindowMatch,
} from './time'

const MS_PER_HOUR = 60 * 60 * 1000

describe('istToday', () => {
  it('rolls to the next IST day after IST midnight (UTC+5:30)', () => {
    // 2026-05-30 19:00 UTC = 2026-05-31 00:30 IST → IST date is the 31st.
    const now = new Date('2026-05-30T19:00:00Z')
    expect(istToday(now)).toBe('2026-05-31')
  })

  it('stays on the same IST day just before IST midnight', () => {
    // 2026-05-30 18:00 UTC = 2026-05-30 23:30 IST.
    const now = new Date('2026-05-30T18:00:00Z')
    expect(istToday(now)).toBe('2026-05-30')
  })
})

describe('istDateInDays', () => {
  it('advances and rewinds the IST calendar day', () => {
    const now = new Date('2026-05-30T12:00:00Z')
    expect(istDateInDays(now, 1)).toBe('2026-05-31')
    expect(istDateInDays(now, -1)).toBe('2026-05-29')
  })
})

describe('isSameISTDay', () => {
  it('treats two instants within the same IST day as equal', () => {
    const a = new Date('2026-05-30T06:00:00Z')
    const b = new Date('2026-05-30T14:00:00Z')
    expect(isSameISTDay(a, b)).toBe(true)
  })
})

describe('istDayStart', () => {
  it('is IST midnight of the IST day, not UTC midnight', () => {
    // 2026-05-30 19:00 UTC = 2026-05-31 00:30 IST → the day began at 18:30 UTC.
    expect(istDayStart(new Date('2026-05-30T19:00:00Z')).toISOString()).toBe(
      '2026-05-30T18:30:00.000Z',
    )
    // 2026-05-30 18:00 UTC = 2026-05-30 23:30 IST → that day began the UTC evening before.
    expect(istDayStart(new Date('2026-05-30T18:00:00Z')).toISOString()).toBe(
      '2026-05-29T18:30:00.000Z',
    )
  })
})

describe('reminderWindowMatch', () => {
  it('matches the 1h window inside the next 15-minute slot', () => {
    const now = new Date('2026-05-30T10:00:00Z')
    const startsAt = new Date(now.getTime() + MS_PER_HOUR + 5 * 60 * 1000)
    expect(reminderWindowMatch(startsAt, now)).toBe('1h')
  })

  it('matches the 24h window', () => {
    const now = new Date('2026-05-30T10:00:00Z')
    const startsAt = new Date(now.getTime() + 24 * MS_PER_HOUR + 60 * 1000)
    expect(reminderWindowMatch(startsAt, now)).toBe('24h')
  })

  it('returns null outside both windows', () => {
    const now = new Date('2026-05-30T10:00:00Z')
    const startsAt = new Date(now.getTime() + 3 * MS_PER_HOUR)
    expect(reminderWindowMatch(startsAt, now)).toBeNull()
  })
})

describe('noShowCheckDelaySeconds', () => {
  it('rounds up a partial second to keep the queued check after the IST grace period', () => {
    const now = new Date('2026-05-30T11:44:59.900Z').getTime()
    expect(noShowCheckDelaySeconds('2026-05-30', '16:00', '17:00', now)).toBe(1)
  })

  it('waits for the next IST day when the appointment ends after midnight', () => {
    const justBeforeGrace = new Date('2026-05-30T19:14:59.500Z').getTime()
    expect(noShowCheckDelaySeconds('2026-05-30', '23:30', '00:30', justBeforeGrace)).toBe(1)
  })
})

describe('monthKeyIST', () => {
  it('returns the previous month in IST', () => {
    const now = new Date('2026-05-01T12:00:00Z')
    expect(monthKeyIST(now)).toBe('2026-04')
  })

  it('wraps to December of the prior year in January', () => {
    const now = new Date('2026-01-10T12:00:00Z')
    expect(monthKeyIST(now)).toBe('2025-12')
  })
})

describe('daysUntilIST', () => {
  it('counts whole IST calendar days to a future date', () => {
    const now = new Date('2026-05-30T12:00:00Z')
    const target = new Date('2026-06-02T12:00:00Z')
    expect(daysUntilIST(target, now)).toBe(3)
  })
})
