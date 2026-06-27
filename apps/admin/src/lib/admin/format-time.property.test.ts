/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : format-time.property.test
 * Scope        : Property-based test for 24-hour IST time-of-day presentation
 *
 * Description  : fast-check + Vitest property test verifying that
 *                `formatTime24hIST` from `@/lib/admin/format` presents a stored
 *                UTC instant as a zero-padded, 24-hour `HH:MM` string in India
 *                Standard Time (constant UTC+05:30, no daylight saving). The
 *                presented time must equal the HH:MM read from the instant
 *                shifted forward by exactly +330 minutes (read back in UTC),
 *                with the midnight 24 → 00 normalisation applied.
 *
 * Notes        : Presentation-layer test only. `format.ts` is consumed as-is —
 *                this file imports the pure formatter and asserts behaviour; it
 *                does not modify any formatting logic. Requirements 15.5.
 ************************************************************/

import { formatTime24hIST } from '@/lib/admin/format'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// Feature: admin-portal-redesign, Property 19: Time formatting is 24-hour HH:MM in IST
//
// Property 19: Time formatting is 24-hour HH:MM in IST
// Validates: Requirements 15.5
//
// For any stored UTC instant, `formatTime24hIST(date)`:
//   1. matches /^\d{2}:\d{2}$/ (zero-padded, 24-hour HH:MM), and
//   2. equals the HH:MM of the instant shifted forward by exactly +330 minutes
//      (the fixed UTC+05:30 India offset) read back in UTC, with 24 → 00
//      normalised to the standard midnight representation.
//
// The IST offset is constant year-round (India observes no DST), so the +330
// shift holds in every month — there is never a +04:30 or +06:30 variant.

const IST_OFFSET_MINUTES = 330
const MS_PER_MINUTE = 60_000
const OUTPUT_RE = /^\d{2}:\d{2}$/

const pad2 = (n: number): string => String(n).padStart(2, '0')

// Reference: shift the UTC instant by the fixed +330-minute IST offset, then
// read the wall-clock HH:MM back in UTC. Normalise an "24" hour to "00" to
// mirror the formatter's midnight handling. This is the constant-offset
// definition Property 19 pins formatTime24hIST against.
function expectedTime(date: Date): string {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE)
  const hh = pad2(shifted.getUTCHours() % 24)
  const min = pad2(shifted.getUTCMinutes())
  return `${hh}:${min}`
}

// Arbitrary UTC instants across a modern multi-year, all-months band. The range
// stays within 4-digit years (2000–2099) and sweeps every hour/minute, which is
// where a DST-style variable offset would surface.
const utcInstantArb: fc.Arbitrary<Date> = fc
  .integer({
    min: Date.UTC(2000, 0, 1, 0, 0, 0),
    max: Date.UTC(2099, 11, 31, 23, 59, 0),
  })
  .map((ms) => new Date(ms))

// Near-midnight IST boundaries. UTC 18:30 == IST 00:00, so instants whose UTC
// wall-clock lands near 18:30 cross the IST midnight boundary — the canonical
// edge case (24 → 00 normalisation and date rollover) the task calls out.
const istMidnightBoundaryArb: fc.Arbitrary<Date> = fc
  .record({
    year: fc.integer({ min: 2000, max: 2099 }),
    month: fc.integer({ min: 0, max: 11 }),
    day: fc.integer({ min: 1, max: 28 }),
    // Centre on 18:30 UTC (= 00:00 IST) and sweep a few minutes either side.
    offsetMinutes: fc.integer({ min: -5, max: 5 }),
  })
  .map(({ year, month, day, offsetMinutes }) => {
    const base = Date.UTC(year, month, day, 18, 30, 0)
    return new Date(base + offsetMinutes * MS_PER_MINUTE)
  })

describe('Property 19: Time formatting is 24-hour HH:MM in IST', () => {
  it('presents 24-hour zero-padded HH:MM equal to the +330-minute IST shift', () => {
    fc.assert(
      fc.property(utcInstantArb, (date) => {
        const out = formatTime24hIST(date)
        expect(out).toMatch(OUTPUT_RE)
        expect(out).toBe(expectedTime(date))
      }),
      { numRuns: 25 },
    )
  })

  it('handles midnight and near-midnight IST boundaries (UTC 18:30 = IST 00:00)', () => {
    fc.assert(
      fc.property(istMidnightBoundaryArb, (date) => {
        const out = formatTime24hIST(date)
        expect(out).toMatch(OUTPUT_RE)
        expect(out).toBe(expectedTime(date))
      }),
      { numRuns: 25 },
    )
  })

  it('formats exact IST midnight as 00:00', () => {
    // UTC 18:30:00 is precisely 00:00 IST.
    const utcMidnightIST = new Date(Date.UTC(2026, 4, 24, 18, 30, 0))
    expect(formatTime24hIST(utcMidnightIST)).toBe('00:00')
  })
})
