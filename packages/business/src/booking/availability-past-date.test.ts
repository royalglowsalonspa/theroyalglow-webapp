/************************************************************
 * Property test — Past dates are rejected (backend-api Property 8)
 *
 * Validates: Requirements 3.4
 *
 * For any requested date strictly earlier than the current date in IST,
 * generateAvailability throws an AppError with code VALIDATION_ERROR and
 * statusCode 400, and generates no slots (it throws before producing any).
 ************************************************************/

import { AppError } from '@rgss/errors'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { generateAvailability } from './availability'

/** IST is UTC+5:30. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
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

describe('generateAvailability — past-date rejection (Property 8)', () => {
  // Feature: backend-api, Property 8: Past dates are rejected
  it('rejects any date earlier than today (IST) with VALIDATION_ERROR 400 and no slots', () => {
    // Fixed instant for determinism. IST wall clock = 2026-06-25 17:30 IST.
    const now = new Date('2026-06-25T12:00:00.000Z')
    const todayIST = istDateString(now)

    // Anchor at IST-today midnight (as a UTC instant) so subtracting whole
    // days yields the correct prior IST calendar day regardless of time-of-day.
    const dateParts = todayIST.split('-').map(Number)
    const y = dateParts[0] ?? 0
    const m = dateParts[1] ?? 1
    const d = dateParts[2] ?? 1
    const istTodayMidnightUTC = Date.UTC(y, m - 1, d)

    fc.assert(
      fc.property(
        // Strictly-before: 1 .. ~30 years of days back.
        fc.integer({ min: 1, max: 11_000 }),
        (daysBefore) => {
          const pastDate = ymd(new Date(istTodayMidnightUTC - daysBefore * DAY_MS))

          // Sanity: the generated date is strictly earlier than IST today.
          expect(pastDate < todayIST).toBe(true)

          let thrown: unknown
          try {
            generateAvailability({ date: pastDate, now })
          } catch (err) {
            thrown = err
          }

          expect(thrown).toBeInstanceOf(AppError)
          const appErr = thrown as AppError
          expect(appErr.code).toBe('VALIDATION_ERROR')
          expect(appErr.statusCode).toBe(400)
        },
      ),
      { numRuns: 200 },
    )
  })
})
