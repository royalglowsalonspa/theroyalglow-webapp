/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : currency.property.test
 * Scope        : Property-based test — Indian currency formatting
 *
 * Property     : Property 3: Indian Currency Formatting
 * Validates    : Requirements 12.2, 12.5
 *
 * Description  : fast-check + Vitest property tests for formatINR
 *                (packages/business/src/utils/currency.ts). Money is ALWAYS
 *                integer paise, so formatting must never lose or invent a
 *                paisa, and it must use Indian lakh/crore grouping
 *                (₹1,00,000.00 — not ₹100,000.00).
 *
 * Responsibilities :
 * - Output always starts with ₹ and ends in exactly 2 decimal digits
 * - The digits always equal paise / 100 computed with integer arithmetic only
 * - Grouping is always Indian: 3 digits from the right, then groups of 2
 * - Holds at the documented bounds: 0 and 9,99,99,999.99 (9_999_999_999 paise)
 *
 * Features / Functionality :
 * - A pure integer-only reference formatter (no floating point) is the oracle,
 *   so the assertion covers value, decimals and grouping in one comparison
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, ../utils/currency
 *
 * Notes        : Implements design Correctness Property 3 only. The example
 *                cases live in ../utils/currency.test.ts.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formatINR } from '../utils/currency'

// Documented input domain: 0 ≤ paise ≤ 9,999,999,999 (₹9,99,99,999.99).
const MAX_PAISE = 9_999_999_999

const paiseArb = fc.integer({ min: 0, max: MAX_PAISE })

/**
 * Indian digit grouping, integer-only: the last 3 digits form one group, then
 * every 2 digits. `1234567` → `12,34,567`.
 */
function groupIndian(digits: string): string {
  if (digits.length <= 3) {
    return digits
  }
  const last3 = digits.slice(-3)
  const rest = digits.slice(0, -3)
  const pairs: string[] = []
  let index = rest.length
  while (index > 2) {
    pairs.unshift(rest.slice(index - 2, index))
    index -= 2
  }
  pairs.unshift(rest.slice(0, index))
  return `${pairs.join(',')},${last3}`
}

/** Oracle: paise → "₹1,00,000.00" using integer arithmetic only. */
function expectedINR(paise: number): string {
  const rupees = Math.floor(paise / 100)
  const remainder = paise % 100
  return `₹${groupIndian(String(rupees))}.${String(remainder).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Property 3: Indian Currency Formatting
// ---------------------------------------------------------------------------

describe('Property 3: Indian Currency Formatting', () => {
  it('always starts with ₹ and ends with exactly two decimal digits', () => {
    fc.assert(
      fc.property(paiseArb, (paise) => {
        const output = formatINR(paise)

        expect(output.startsWith('₹')).toBe(true)
        expect(output).toMatch(/\.\d{2}$/)
        // Exactly one decimal separator — no stray dots.
        expect(output.split('.')).toHaveLength(2)
      }),
      { numRuns: 500 },
    )
  })

  it('never loses or invents a paisa — digits always equal paise / 100', () => {
    fc.assert(
      fc.property(paiseArb, (paise) => {
        const digitsOnly = formatINR(paise).replace('₹', '').replaceAll(',', '')
        const rupees = Math.floor(paise / 100)
        const remainder = paise % 100

        expect(digitsOnly).toBe(`${rupees}.${String(remainder).padStart(2, '0')}`)
      }),
      { numRuns: 500 },
    )
  })

  it('always uses Indian lakh/crore grouping', () => {
    fc.assert(
      fc.property(paiseArb, (paise) => {
        const integerPart = formatINR(paise).replace('₹', '').split('.')[0] as string
        const groups = integerPart.split(',')

        if (groups.length === 1) {
          // Ungrouped values are at most 3 digits.
          expect(integerPart.length).toBeLessThanOrEqual(3)
        } else {
          // Rightmost group is 3 digits, every inner group is exactly 2, and the
          // leading group is 1 or 2 digits.
          expect(groups.at(-1)).toHaveLength(3)
          for (const group of groups.slice(1, -1)) {
            expect(group).toHaveLength(2)
          }
          const first = groups[0] as string
          expect(first.length).toBeGreaterThanOrEqual(1)
          expect(first.length).toBeLessThanOrEqual(2)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('matches the integer-only reference formatter across every magnitude', () => {
    fc.assert(
      fc.property(
        // Bias towards magnitude boundaries: hundreds, thousands, lakhs, crores.
        fc.oneof(
          paiseArb,
          fc.integer({ min: 0, max: 99 }),
          fc.integer({ min: 0, max: 9 }).map((n) => n * 100),
          fc.integer({ min: 0, max: 99 }).map((n) => n * 100_000),
          fc.integer({ min: 0, max: 99 }).map((n) => n * 10_000_000),
          fc.integer({ min: 0, max: 9 }).map((n) => n * 1_000_000_000),
        ),
        (paise) => {
          expect(formatINR(paise)).toBe(expectedINR(paise))
        },
      ),
      { numRuns: 1000 },
    )
  })

  it('holds at the documented bounds', () => {
    expect(formatINR(0)).toBe('₹0.00')
    expect(formatINR(1)).toBe('₹0.01')
    expect(formatINR(99)).toBe('₹0.99')
    expect(formatINR(100)).toBe('₹1.00')
    expect(formatINR(100_000)).toBe('₹1,000.00')
    expect(formatINR(10_000_000)).toBe('₹1,00,000.00')
    expect(formatINR(1_000_000_000)).toBe('₹1,00,00,000.00')
    expect(formatINR(MAX_PAISE)).toBe('₹9,99,99,999.99')
  })
})
