import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isValidIndianMobile, normaliseValidIndianPhone } from './phone'

// Feature: backend-api, Property 22: Indian mobile validation accepts only valid numbers
// Validates: Requirements 9.3
describe('Indian mobile validation — Property 22: accepts only valid numbers', () => {
  // Independent reference pattern (not imported from the implementation) so the
  // test verifies the contract rather than the code under test.
  const referencePattern = /^(?:\+?91|0)?[6-9]\d{9}$/

  // Generator for syntactically valid candidates: an optional country/trunk
  // prefix followed by a ten-digit number whose first digit is 6–9.
  const prefixArb = fc.constantFrom('', '+91', '91', '0')
  const firstDigitArb = fc.constantFrom('6', '7', '8', '9')
  const nineDigitsArb = fc
    .array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: 9,
      maxLength: 9,
    })
    .map((d) => d.join(''))

  const validArb = fc
    .tuple(prefixArb, firstDigitArb, nineDigitsArb)
    .map(([prefix, first, rest]) => `${prefix}${first}${rest}`)

  // Optional surrounding whitespace to exercise the trimming behaviour.
  const padArb = fc.constantFrom('', ' ', '  ', '\t', '\n ')
  const withPad = (s: fc.Arbitrary<string>) =>
    fc.tuple(padArb, s, padArb).map(([l, v, r]) => `${l}${v}${r}`)

  // Mix valid candidates with arbitrary noise so both branches are exercised.
  const candidateArb = withPad(
    fc.oneof({ weight: 3, arbitrary: validArb }, { weight: 2, arbitrary: fc.string() }),
  )

  it('accepts exactly the candidates matching the canonical pattern', () => {
    fc.assert(
      fc.property(candidateArb, (raw) => {
        const expected = referencePattern.test(raw.trim())
        expect(isValidIndianMobile(raw)).toBe(expected)
      }),
      { numRuns: 200 },
    )
  })

  it('normalises every valid candidate to +91 followed by its last ten digits', () => {
    fc.assert(
      fc.property(withPad(validArb), (raw) => {
        const result = normaliseValidIndianPhone(raw)
        const last10 = raw.replace(/\D/g, '').slice(-10)

        expect(result).toBe(`+91${last10}`)
        expect(result).toMatch(/^\+91\d{10}$/)
      }),
      { numRuns: 200 },
    )
  })

  it('returns null for every candidate that fails the pattern', () => {
    fc.assert(
      fc.property(candidateArb, (raw) => {
        if (!referencePattern.test(raw.trim())) {
          expect(normaliseValidIndianPhone(raw)).toBeNull()
        }
      }),
      { numRuns: 200 },
    )
  })
})
