/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : format-ist.property.test
 * Scope        : Property-based test for UTC → IST date-time presentation
 *
 * Description  : fast-check + Vitest property test verifying that
 *                `formatDateTimeIST` from `@/lib/admin/format` converts a stored
 *                UTC instant to India Standard Time using a CONSTANT +05:30
 *                (+330-minute) offset, with NO daylight-saving adjustment at any
 *                point in the year. The presented DD/MM/YYYY, HH:MM string must
 *                equal the value computed by shifting the instant forward by
 *                exactly 330 minutes and reading it back in UTC.
 *
 * Notes        : Presentation-layer test only. `format.ts` is consumed as-is —
 *                this file imports the pure formatter and asserts behaviour;
 *                it does not modify any formatting logic (Req 15.3).
 ************************************************************/

import { formatDateTimeIST } from '@/lib/admin/format'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// Feature: admin-portal-redesign, Property 18: UTC→IST conversion uses a constant +05:30 offset
//
// Property 18: UTC→IST conversion uses a constant +05:30 offset
// Validates: Requirements 15.3
//
// For any stored UTC instant, the presented IST date-time
// (`formatDateTimeIST(date)`) equals the instant shifted forward by exactly
// +330 minutes (the fixed UTC+05:30 India offset) read back in UTC and rendered
// the same DD/MM/YYYY, HH:MM way. The offset is constant across every month of
// the year — India observes no daylight saving, so there is never a +04:30 or
// +06:30 shift.

const IST_OFFSET_MINUTES = 330
const MS_PER_MINUTE = 60_000

const pad2 = (n: number): string => String(n).padStart(2, '0')

// Reference: shift the UTC instant by the fixed +330-minute IST offset, then
// read the wall-clock components back in UTC and format DD/MM/YYYY, HH:MM. This
// is the constant-offset definition Property 18 pins formatDateTimeIST against.
function expectedIST(date: Date): string {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE)
  const dd = pad2(shifted.getUTCDate())
  const mm = pad2(shifted.getUTCMonth() + 1)
  const yyyy = String(shifted.getUTCFullYear())
  const hh = pad2(shifted.getUTCHours())
  const min = pad2(shifted.getUTCMinutes())
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}`
}

// Arbitrary UTC instants across a modern multi-year, all-months band. The range
// stays within 4-digit years (2000–2099) so both the formatter and the
// reference render a fixed-width year; the breadth exercises every month and
// day-of-year, which is where a DST-style variable offset would surface.
const utcInstantArb: fc.Arbitrary<Date> = fc
  .integer({
    min: Date.UTC(2000, 0, 1, 0, 0, 0),
    max: Date.UTC(2099, 11, 31, 23, 59, 0),
  })
  .map((ms) => new Date(ms))

describe('Property 18: UTC→IST conversion uses a constant +05:30 offset', () => {
  it('presents the IST date-time as the instant shifted by exactly +330 minutes', () => {
    fc.assert(
      fc.property(utcInstantArb, (date) => {
        expect(formatDateTimeIST(date)).toBe(expectedIST(date))
      }),
      { numRuns: 25 },
    )
  })

  it('applies the same +330-minute offset in every month (no daylight saving)', () => {
    // Hold the day and wall-clock fixed and sweep all 12 months across many
    // years. A DST regime would break the constant offset in some months; under
    // the fixed IST offset every month must still match the +330-minute shift.
    const monthSweepArb = fc.record({
      year: fc.integer({ min: 2000, max: 2099 }),
      month: fc.integer({ min: 0, max: 11 }),
      day: fc.integer({ min: 1, max: 28 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
    })

    fc.assert(
      fc.property(monthSweepArb, ({ year, month, day, hour, minute }) => {
        const date = new Date(Date.UTC(year, month, day, hour, minute, 0))
        expect(formatDateTimeIST(date)).toBe(expectedIST(date))
      }),
      { numRuns: 25 },
    )
  })
})
