/************************************************************
 * Property test — Availability slot grid and flags (backend-api Property 7)
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6
 *
 * For any valid (non-past) requested date, generateAvailability returns a
 * fixed 30-minute grid within the standard operating window where every slot
 * has endTime = startTime + 30 minutes (3.1, 3.2). A slot is flagged
 * unavailable when it falls outside the day's business hours (3.3), when the
 * date is a recorded holiday (3.5), and — when the date is today in IST — when
 * its start is earlier than the current IST minute-of-day (3.6).
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type BusinessHours, generateAvailability } from './availability'
import { SLOT_CLOSE_MINUTES, SLOT_DURATION_MINUTES, SLOT_OPEN_MINUTES } from './reschedule'

/** IST is UTC+5:30. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  return h * 60 + m
}

/** "YYYY-MM-DD" of an instant in IST (mirrors the impl's IST day rule). */
function istDateString(instant: Date): string {
  const wall = new Date(instant.getTime() + IST_OFFSET_MS)
  return `${wall.getUTCFullYear()}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`
}

/** Minutes since IST midnight for an instant. */
function istMinutesOfDay(instant: Date): number {
  const wall = new Date(instant.getTime() + IST_OFFSET_MS)
  return wall.getUTCHours() * 60 + wall.getUTCMinutes()
}

/** Format a UTC y/m/d as a zero-padded "YYYY-MM-DD" day string. */
function ymd(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

/** Independent reference grid (mirrors the spec, not the impl). */
function expectedStarts(): number[] {
  const starts: number[] = []
  for (
    let start = SLOT_OPEN_MINUTES;
    start + SLOT_DURATION_MINUTES <= SLOT_CLOSE_MINUTES;
    start += SLOT_DURATION_MINUTES
  ) {
    starts.push(start)
  }
  return starts
}

describe('generateAvailability — slot grid and flags (Property 7)', () => {
  // Feature: backend-api, Property 7: Availability slots form a 30-minute grid with correct flags
  it('produces a fixed 30-min grid with correct availability flags for valid dates', () => {
    // Fixed instant for determinism. IST wall clock = 2026-06-25 17:30 IST.
    const now = new Date('2026-06-25T12:00:00.000Z')
    const todayIST = istDateString(now)
    const currentISTMinutes = istMinutesOfDay(now)

    const dateParts = todayIST.split('-').map(Number)
    const y = dateParts[0] ?? 0
    const m = dateParts[1] ?? 1
    const d = dateParts[2] ?? 1
    const istTodayMidnightUTC = Date.UTC(y, m - 1, d)

    fc.assert(
      fc.property(
        // 0 .. ~10 years ahead — always today-or-future (non-past).
        fc.integer({ min: 0, max: 3650 }),
        // whether to mark the requested date as a holiday
        fc.boolean(),
        // varied business-hours window within the day
        fc.integer({ min: 0, max: 12 * 60 }),
        fc.integer({ min: 12 * 60, max: 24 * 60 }),
        (daysAhead, markHoliday, openMinutes, closeMinutes) => {
          const date = ymd(new Date(istTodayMidnightUTC + daysAhead * DAY_MS))
          const businessHours: BusinessHours = { openMinutes, closeMinutes }
          const holidays = markHoliday ? [date] : []

          const slots = generateAvailability({ date, now, holidays, businessHours })

          const starts = expectedStarts()
          // 3.1 — fixed grid: one slot per expected 30-min start.
          expect(slots.length).toBe(starts.length)

          const isToday = date === todayIST

          slots.forEach((slot, i) => {
            const startMin = starts[i] ?? 0
            const endMin = startMin + SLOT_DURATION_MINUTES

            // 3.1 — slots align to the 30-min grid.
            expect(timeToMinutes(slot.startTime)).toBe(startMin)
            // 3.2 — endTime is exactly start + 30 minutes.
            expect(timeToMinutes(slot.endTime)).toBe(endMin)

            const withinBusinessHours = startMin >= openMinutes && endMin <= closeMinutes
            const inPastToday = isToday && startMin < currentISTMinutes

            // 3.3 / 3.5 / 3.6 — availability flag reflects each rule.
            const expectedAvailable = withinBusinessHours && !markHoliday && !inPastToday
            expect(slot.available).toBe(expectedAvailable)
          })
        },
      ),
      { numRuns: 200 },
    )
  })
})
