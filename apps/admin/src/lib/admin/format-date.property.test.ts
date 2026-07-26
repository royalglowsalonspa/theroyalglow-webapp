/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : format-date.property.test
 * Scope        : Property-based test for DD/MM/YYYY date formatting
 *
 * Description  : fast-check + Vitest property test verifying that the reused
 *                `formatDateDDMMYYYY` (re-exported from `@/lib/admin/format`)
 *                renders any valid date as a zero-padded `DD/MM/YYYY` string
 *                whose components round-trip back to the original day, month,
 *                and year. Leap-year February 29 is exercised explicitly.
 *
 * Notes        : Presentation-layer test only. `formatDateDDMMYYYY` is a pure
 *                string transform (`YYYY-MM-DD…` → `DD/MM/YYYY`) and performs
 *                NO timezone conversion (verified in bookings.ts), so the
 *                expected components equal the literal year/month/day used to
 *                build the zero-padded input string. Requirements 15.2.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formatDateDDMMYYYY } from '@/lib/admin/format'

// Feature: admin-portal-redesign, Property 17: Date formatting is DD/MM/YYYY and round-trips
//
// Property 17: Date formatting is DD/MM/YYYY and round-trips
// Validates: Requirements 15.2
//
// For any valid date, `formatDateDDMMYYYY` returns a string matching
// `/^\d{2}\/\d{2}\/\d{4}$/` with each component zero-padded, and parsing the
// DD, MM, YYYY components back yields the same day, month, and year the helper
// was given.
//
// `formatDateDDMMYYYY` is a pure string transform with no timezone logic: it
// slices the first 10 chars (`YYYY-MM-DD`) and reorders them. The expected
// output components therefore equal the literal y/m/d used to construct the
// zero-padded input. We build the input via `Date.UTC(...).toISOString()` so
// the test mirrors the stored UTC ISO strings the helper receives in
// production, plus the bare `YYYY-MM-DD` form.

const OUTPUT_RE = /^\d{2}\/\d{2}\/\d{4}$/

const pad2 = (n: number): string => String(n).padStart(2, '0')
const pad4 = (n: number): string => String(n).padStart(4, '0')

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

const daysInMonth = (y: number, m: number): number => {
  if (m === 2) {
    return isLeap(y) ? 29 : 28
  }
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

// Arbitrary for a valid (year, month, day) triple. Years constrained to the
// 4-digit band so the formatted year is always exactly four characters, which
// matches every realistic stored timestamp.
const validDateArb: fc.Arbitrary<{ y: number; m: number; d: number }> = fc
  .record({
    y: fc.integer({ min: 1000, max: 9999 }),
    m: fc.integer({ min: 1, max: 12 }),
    dayPick: fc.integer({ min: 1, max: 31 }),
  })
  .map(({ y, m, dayPick }) => ({ y, m, d: ((dayPick - 1) % daysInMonth(y, m)) + 1 }))

// Explicit leap-year Feb 29 dates — the canonical edge case the task calls out.
const leapFeb29Arb: fc.Arbitrary<{ y: number; m: number; d: number }> = fc
  .constantFrom(2000, 2004, 2024, 2028, 2400)
  .map((y) => ({ y, m: 2, d: 29 }))

const dateArb = fc.oneof(
  { weight: 4, arbitrary: validDateArb },
  { weight: 1, arbitrary: leapFeb29Arb },
)

function check({ y, m, d }: { y: number; m: number; d: number }): void {
  const yyyy = pad4(y)
  const mm = pad2(m)
  const dd = pad2(d)

  // Two realistic input shapes: the stored UTC ISO string and the bare date.
  const isoInput = new Date(Date.UTC(y, m - 1, d)).toISOString()
  const bareInput = `${yyyy}-${mm}-${dd}`

  for (const input of [isoInput, bareInput]) {
    const out = formatDateDDMMYYYY(input)

    // Shape: zero-padded DD/MM/YYYY.
    expect(out).toMatch(OUTPUT_RE)
    expect(out).toBe(`${dd}/${mm}/${yyyy}`)

    // Round-trip: parsing the components back yields the original date.
    const [pDD, pMM, pYYYY] = out.split('/')
    expect(Number(pDD)).toBe(d)
    expect(Number(pMM)).toBe(m)
    expect(Number(pYYYY)).toBe(y)
  }
}

describe('Property 17: Date formatting is DD/MM/YYYY and round-trips', () => {
  it('formats any valid date as zero-padded DD/MM/YYYY whose components round-trip', () => {
    fc.assert(fc.property(dateArb, check), { numRuns: 25 })
  })

  it('handles leap-year February 29 explicitly', () => {
    for (const y of [2000, 2004, 2024, 2028, 2400]) {
      check({ y, m: 2, d: 29 })
    }
  })
})
