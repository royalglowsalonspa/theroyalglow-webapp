/************************************************************
 * Property test — Availability slot grid and flags (backend-api Property 7,
 * multi-branch R6.3)
 *
 * Validates: Requirements 3.1, 3.2, 3.5, 3.6; R6.3, R7.1
 *
 * For any valid (non-past) requested date, generateAvailability returns the
 * half-hour slots across the branch's opening window that day: the first at
 * the first half hour from opening, the last ending by closing, each with
 * endTime = startTime + 30 minutes (3.1, 3.2). A slot is unavailable when the
 * date is a holiday or closure (3.5), or when it starts sooner than now plus
 * the branch's lead time (3.6, R6.3). A closed day has no slots.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { generateAvailability } from './availability'
import { SLOT_DURATION_MINUTES } from './reschedule'

/** IST is UTC+5:30. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number)
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
}

/** "YYYY-MM-DD" of an instant in IST (mirrors the impl's IST day rule). */
function istDateString(instant: Date): string {
  const wall = new Date(instant.getTime() + IST_OFFSET_MS)
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`
}

/** Format a UTC y/m/d as a zero-padded "YYYY-MM-DD" day string. */
function ymd(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

/** Independent reference grid for an opening window (mirrors the spec, not the impl). */
function expectedStarts(openMinutes: number, closeMinutes: number): number[] {
  const starts: number[] = []
  let start = openMinutes
  while (start % 30 !== 0) start += 1
  for (; start + 30 <= closeMinutes; start += 30) {
    starts.push(start)
  }
  return starts
}

// Fixed instant for determinism. IST wall clock = 2026-06-25 17:30 IST.
const NOW = new Date('2026-06-25T12:00:00.000Z')
const TODAY = istDateString(NOW)
const TODAY_MIDNIGHT_UTC = Date.UTC(
  Number(TODAY.slice(0, 4)),
  Number(TODAY.slice(5, 7)) - 1,
  Number(TODAY.slice(8, 10)),
)

describe('generateAvailability — the branch’s grid and flags (Property 7)', () => {
  // Feature: backend-api, Property 7: Availability slots form a 30-minute grid with correct flags
  it('spans the opening window in half hours with the holiday and lead-time flags', () => {
    fc.assert(
      fc.property(
        // today .. ~10 years ahead — always today-or-future (non-past).
        fc.integer({ min: 0, max: 3650 }),
        fc.boolean(),
        // varied opening window, any minute
        fc.integer({ min: 0, max: 12 * 60 }),
        fc.integer({ min: 12 * 60, max: 24 * 60 }),
        // lead time up to a week
        fc.integer({ min: 0, max: 7 * 24 * 60 }),
        (daysAhead, markHoliday, openMinutes, closeMinutes, leadTimeMinutes) => {
          const date = ymd(new Date(TODAY_MIDNIGHT_UTC + daysAhead * DAY_MS))
          const holidays = markHoliday ? [date] : []

          const slots = generateAvailability({
            date,
            now: NOW,
            holidays,
            businessHours: { openMinutes, closeMinutes },
            leadTimeMinutes,
          })

          const starts = expectedStarts(openMinutes, closeMinutes)
          expect(slots.map((s) => timeToMinutes(s.startTime))).toEqual(starts)

          const dayStart = TODAY_MIDNIGHT_UTC + daysAhead * DAY_MS - IST_OFFSET_MS
          const earliest = NOW.getTime() + leadTimeMinutes * MINUTE_MS
          slots.forEach((slot, i) => {
            const startMin = starts[i] ?? 0
            // 3.2 — endTime is exactly start + 30 minutes.
            expect(timeToMinutes(slot.endTime)).toBe(startMin + SLOT_DURATION_MINUTES)
            // 3.5 / 3.6 / R6.3 — unavailable on a holiday or inside the lead time.
            const startsAt = dayStart + startMin * MINUTE_MS
            expect(slot.available).toBe(!markHoliday && startsAt >= earliest)
          })
        },
      ),
      { numRuns: 300 },
    )
  })

  it('has no slots on a day the branch is closed', () => {
    expect(generateAvailability({ date: TODAY, now: NOW, businessHours: null })).toEqual([])
  })

  it('defaults to the standard 10:00–21:00 grid', () => {
    const slots = generateAvailability({ date: '2026-07-01', now: NOW })
    expect(slots[0]?.startTime).toBe('10:00')
    expect(slots.at(-1)).toEqual({ startTime: '20:30', endTime: '21:00', available: true })
    expect(slots).toHaveLength(22)
  })

  it('offers today’s slots only from now plus the lead time', () => {
    // 17:30 IST now, one hour ahead: 18:30 is the first available start.
    const slots = generateAvailability({
      date: TODAY,
      now: NOW,
      businessHours: { openMinutes: 10 * 60, closeMinutes: 21 * 60 },
      leadTimeMinutes: 60,
    })
    expect(slots.filter((s) => s.available).map((s) => s.startTime)).toEqual([
      '18:30',
      '19:00',
      '19:30',
      '20:00',
      '20:30',
    ])
  })

  it('offers only the starts a booking of that length can finish from by closing', () => {
    // A 90-minute booking on the 10:00–21:00 grid: 19:30 is the last start.
    const slots = generateAvailability({ date: '2026-07-01', now: NOW, durationMinutes: 90 })
    expect(slots).toHaveLength(22)
    const offered = slots.filter((s) => s.available).map((s) => s.startTime)
    expect(offered[0]).toBe('10:00')
    expect(offered.at(-1)).toBe('19:30')
    expect(slots.filter((s) => !s.available).map((s) => s.startTime)).toEqual(['20:00', '20:30'])
  })

  it('never offers a start a booking would overrun closing from (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 600 }), (durationMinutes) => {
        const slots = generateAvailability({ date: '2026-07-01', now: NOW, durationMinutes })
        for (const slot of slots) {
          const start = timeToMinutes(slot.startTime)
          expect(slot.available).toBe(start + Math.max(30, durationMinutes) <= 21 * 60)
        }
      }),
      { numRuns: 200 },
    )
  })
})
