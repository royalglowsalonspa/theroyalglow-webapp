/************************************************************
 * Property test — Slot bookability (backend-api Property 21)
 *
 * Validates: Requirements 8.3
 *
 * isBookableSlotStart(startTime, durationMinutes) is true only when the
 * requested start sits on the 30-minute grid within opening hours (10:00–21:00)
 * AND start + duration finishes by close (21:00). False otherwise.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  SLOT_CLOSE_MINUTES,
  SLOT_DURATION_MINUTES,
  SLOT_OPEN_MINUTES,
  isBookableSlotStart,
} from './reschedule'

/** Independent reference oracle for the bookability rule (mirrors the spec, not the impl). */
function expectedBookable(startMinutes: number, durationMinutes: number): boolean {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return false
  if (startMinutes < SLOT_OPEN_MINUTES) return false
  if ((startMinutes - SLOT_OPEN_MINUTES) % SLOT_DURATION_MINUTES !== 0) return false
  if (startMinutes + durationMinutes > SLOT_CLOSE_MINUTES) return false
  return true
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

describe('isBookableSlotStart (Property 21)', () => {
  // Feature: backend-api, Property 21: Slot bookability aligns to the grid within open hours
  it('is true only on the 30-min grid within open hours with duration finishing by close', () => {
    fc.assert(
      fc.property(
        // any minute-of-day start time (0..1439)
        fc.integer({ min: 0, max: 23 * 60 + 59 }),
        // service durations spanning realistic and edge values
        fc.integer({ min: 1, max: 8 * 60 }),
        (startMinutes, durationMinutes) => {
          const result = isBookableSlotStart(toHHMM(startMinutes), durationMinutes)
          expect(result).toBe(expectedBookable(startMinutes, durationMinutes))
        },
      ),
      { numRuns: 300 },
    )
  })
})
