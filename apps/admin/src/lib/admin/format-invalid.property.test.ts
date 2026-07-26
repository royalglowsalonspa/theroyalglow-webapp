/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : format-invalid.property.test
 * Scope        : Property-based test for invalid formatter input handling
 *
 * Description  : fast-check + Vitest property test verifying that the IST
 *                presentation formatters from `@/lib/admin/format`
 *                (`formatDateTimeIST`, `formatTime24hIST`) return EXACTLY the
 *                fixed PLACEHOLDER ('—') for every shape of invalid input
 *                (null, undefined, NaN, empty/whitespace strings, non-date
 *                strings, invalid Date objects) and never leak a partial, raw,
 *                or unformatted value.
 *
 * Notes        : Presentation-layer test only. The Req 15.4 invalid-input guard
 *                is owned by the new `format.ts` helpers, which are consumed
 *                as-is here. The re-exported `formatINRWithPaise` /
 *                `formatDateDDMMYYYY` do NOT implement the placeholder guard
 *                (see bookings.ts) and are therefore intentionally out of scope
 *                for this property — see the gap note below. Requirements 15.4.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formatDateTimeIST, formatTime24hIST, PLACEHOLDER } from '@/lib/admin/format'

// Feature: admin-portal-redesign, Property 20: Formatters reject invalid input with a fixed placeholder
//
// Property 20: Formatters reject invalid input with a fixed placeholder
// Validates: Requirements 15.4
//
// For any invalid input — null, undefined, NaN, empty or whitespace-only
// strings, non-date strings, or an invalid Date object — the IST date-time and
// time-of-day formatters return EXACTLY the PLACEHOLDER ('—'). The output is
// never a partial value, the raw input, an "Invalid Date" string, or any other
// unformatted text.
//
// SCOPE NOTE (per task 1.19): the Req 15.4 placeholder guard lives in the new
// `format.ts` helpers — `formatDateTimeIST` and `formatTime24hIST` — which this
// property pins down. The re-exported legacy helpers `formatINRWithPaise`
// (returns "₹NaN" for NaN paise) and `formatDateDDMMYYYY` (echoes the raw
// string when it cannot parse) do NOT return the placeholder for invalid input,
// so asserting the placeholder over them would fail by design. They are
// deliberately excluded here; the gap is reported rather than forced.

// The IST formatters under test. Both must collapse every invalid input to the
// single fixed placeholder.
const formatters = [
  { name: 'formatDateTimeIST', fn: formatDateTimeIST },
  { name: 'formatTime24hIST', fn: formatTime24hIST },
] as const

// Strings that must never parse to a valid date. Excludes anything the Date
// constructor would coerce into a real instant (e.g. bare numbers, ISO dates).
const nonDateStringArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    'abc',
    'not-a-date',
    'hello world',
    '24/05/2026', // DD/MM/YYYY is not ISO-parseable
    '2026-13-45', // out-of-range month/day
    '99:99',
    'NaN',
    'Invalid Date',
    'undefined',
    'null',
    '   abc   ',
    '\t\n',
  ),
  // Random alphabetic-ish junk that the Date constructor rejects.
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => Number.isNaN(new Date(s).getTime())),
)

// Empty / whitespace-only strings — the formatters treat these as missing.
const blankStringArb: fc.Arbitrary<string> = fc.constantFrom('', ' ', '   ', '\t', '\n', ' \t \n ')

// Invalid Date objects (NaN time value).
const invalidDateArb: fc.Arbitrary<Date> = fc.constantFrom(
  new Date(Number.NaN),
  new Date('not a date'),
  new Date(undefined as unknown as number),
)

// NaN-bearing numeric inputs.
const nanNumberArb: fc.Arbitrary<number> = fc.constantFrom(
  Number.NaN,
  Number.parseInt('x', 10),
  0 / 0,
)

// Null / undefined.
const nullishArb: fc.Arbitrary<null | undefined> = fc.constantFrom(null, undefined)

// The full invalid-input space the property ranges over.
const invalidInputArb: fc.Arbitrary<string | number | Date | null | undefined> = fc.oneof(
  nullishArb,
  nanNumberArb,
  blankStringArb,
  nonDateStringArb,
  invalidDateArb,
)

describe('Property 20: Formatters reject invalid input with a fixed placeholder', () => {
  it('returns exactly the PLACEHOLDER for every shape of invalid input', () => {
    fc.assert(
      fc.property(invalidInputArb, (input) => {
        for (const { fn } of formatters) {
          const out = fn(input as Parameters<typeof fn>[0])
          // Exactly the placeholder — never a partial or raw value.
          expect(out).toBe(PLACEHOLDER)
        }
      }),
      { numRuns: 25 },
    )
  })

  it('never leaks a raw, partial, or "Invalid Date" string', () => {
    fc.assert(
      fc.property(invalidInputArb, (input) => {
        for (const { fn } of formatters) {
          const out = fn(input as Parameters<typeof fn>[0])
          expect(out).not.toMatch(/invalid/i)
          expect(out).not.toMatch(/nan/i)
          // The raw string input must never appear in the output.
          if (typeof input === 'string' && input.trim() !== '') {
            expect(out).not.toContain(input)
          }
        }
      }),
      { numRuns: 25 },
    )
  })

  it('collapses the canonical invalid inputs to the placeholder (examples)', () => {
    const examples: Array<string | number | Date | null | undefined> = [
      null,
      undefined,
      Number.NaN,
      '',
      '   ',
      'abc',
      new Date(Number.NaN),
    ]
    for (const input of examples) {
      expect(formatDateTimeIST(input as Parameters<typeof formatDateTimeIST>[0])).toBe(PLACEHOLDER)
      expect(formatTime24hIST(input as Parameters<typeof formatTime24hIST>[0])).toBe(PLACEHOLDER)
    }
  })
})
