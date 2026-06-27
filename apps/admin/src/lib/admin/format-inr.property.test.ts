/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : format-inr.property.test
 * Scope        : Property-based test for INR currency formatting
 *
 * Description  : fast-check + Vitest property test verifying that the reused
 *                `formatINRWithPaise` helper (re-exported from
 *                `@/lib/admin/format`, originally defined in `./bookings`)
 *                renders any paise amount in `[0, 99_999_999_999]` as an
 *                India-first currency string: a `₹` prefix, exactly two decimal
 *                places, the integer part grouped in the Indian convention
 *                (groups of two beyond the rightmost three), and digits that
 *                round-trip back to the original rupee amount.
 *
 * Notes        : Presentation-layer test only. `bookings.ts` is consumed as-is
 *                via the `format.ts` re-export — this file asserts behaviour and
 *                does not modify the helper (Req 15.1, 10.6).
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formatINRWithPaise } from '@/lib/admin/format'

// Feature: admin-portal-redesign, Property 16: INR formatting round-trips with Indian grouping
//
// Property 16: INR formatting round-trips with Indian grouping
// Validates: Requirements 15.1, 10.6
//
// For any paise amount in [0, 99_999_999_999] (₹0.00 … ₹999,999,999.99) the
// formatted string:
//   - begins with the rupee sign `₹`;
//   - has exactly two decimal places;
//   - groups the integer part using the Indian convention (the rightmost three
//     digits, then groups of two — e.g. 1,00,000 / 12,34,567 / 99,99,99,999);
//   - round-trips: stripping `₹`, the commas, and the decimal point recovers
//     the original paise amount, and parsing the grouped value recovers the
//     original rupee amount (paise / 100 with two decimals).

/**
 * Indian-grouping matcher for the integer (rupee) part:
 *   - `\d{1,3}` — a plain 1–3 digit value with no grouping (0 … 999), OR
 *   - `\d{1,2}(,\d{2})*,\d{3}` — a leading 1–2 digit group, zero or more
 *     two-digit groups, then a final three-digit group.
 * Matches "0", "999", "1,000", "10,000", "1,00,000", "12,34,567",
 * "99,99,99,999" and rejects Western grouping like "1,000,000".
 */
const INDIAN_INTEGER_GROUPING = /^(\d{1,3}|\d{1,2}(,\d{2})*,\d{3})$/

// Whole input space: 0 paise (₹0.00) … 99_999_999_999 paise (₹999,999,999.99).
// All values are well within Number.MAX_SAFE_INTEGER, so the digit round-trip
// is exact.
const paiseArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 99_999_999_999 })

describe('Property 16: INR formatting round-trips with Indian grouping', () => {
  it('renders ₹ + two decimals + Indian grouping and round-trips the digits', () => {
    fc.assert(
      fc.property(paiseArb, (paise) => {
        const formatted = formatINRWithPaise(paise)

        // (15.1) The string begins with the rupee sign.
        expect(formatted.startsWith('₹')).toBe(true)

        // Drop the `₹` prefix and any (non-breaking) whitespace some Intl
        // engines insert, leaving the grouped numeric body "1,234.56".
        const numeric = formatted.slice(1).replace(/\s/g, '')

        // Exactly two decimal places, separated by a single dot.
        expect(/^\d[\d,]*\.\d{2}$/.test(numeric)).toBe(true)

        const [intPart, decPart] = numeric.split('.')
        if (intPart === undefined || decPart === undefined) {
          throw new Error(`unexpected formatted shape: ${formatted}`)
        }
        expect(decPart).toHaveLength(2)

        // (10.6) The integer part uses Indian digit grouping.
        expect(INDIAN_INTEGER_GROUPING.test(intPart)).toBe(true)

        // Round-trip 1: stripping the grouping commas and the decimal point
        // recovers the original paise amount exactly.
        const digitsOnly = `${intPart.replace(/,/g, '')}${decPart}`
        expect(Number(digitsOnly)).toBe(paise)

        // Round-trip 2: parsing the grouped value (commas removed) recovers the
        // original rupee amount (paise / 100 with two decimals).
        const rupees = Number(`${intPart.replace(/,/g, '')}.${decPart}`)
        expect(rupees).toBeCloseTo(paise / 100, 2)
      }),
      { numRuns: 25 },
    )
  })

  it('formats the boundary values ₹0.00 and ₹999,999,999.99', () => {
    expect(formatINRWithPaise(0)).toBe('₹0.00')
    expect(formatINRWithPaise(99_999_999_999)).toBe('₹99,99,99,999.99')
  })
})
