import { describe, expect, it } from 'vitest'
import {
  daysUntilIST,
  isSameISTDay,
  istDateInDays,
  istToday,
  monthKeyIST,
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
