import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { generateBookingNumber } from './booking-number'

// Feature: backend-api, Property 9: Booking number matches the structured format
// Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
describe('generateBookingNumber — Property 9: structured format', () => {
  // Branch codes are short uppercase-alphanumeric tokens (e.g. "RS"). They must
  // not contain the "-" delimiter used by the booking-number grammar.
  const branchCodeArb = fc
    .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')), {
      minLength: 1,
      maxLength: 5,
    })
    .map((chars) => chars.join(''))

  const serviceTypeArb = fc.constantFrom<'salon' | 'spa'>('salon', 'spa')

  // Constrain to a sane, valid calendar range so YYMM derivation is well-defined.
  // noInvalidDate excludes `Invalid Date`, which fast-check v4 generates by
  // default; invalid input is rejected by generateBookingNumber and is covered
  // by its own validation test rather than this format property.
  const dateArb = fc.date({
    min: new Date('2000-01-01T00:00:00.000Z'),
    max: new Date('2099-12-31T23:59:59.999Z'),
    noInvalidDate: true,
  })

  it('matches BK-{branchCode}-{YYMM}-{H|S}-{5 alphanumeric}[-M] for all inputs', () => {
    fc.assert(
      fc.property(
        branchCodeArb,
        serviceTypeArb,
        dateArb,
        fc.boolean(),
        (branchCode, serviceType, date, isMembershipSession) => {
          const result = generateBookingNumber(branchCode, serviceType, date, isMembershipSession)

          const yy = String(date.getFullYear()).slice(-2)
          const mm = String(date.getMonth() + 1).padStart(2, '0')
          const typeInitial = serviceType === 'salon' ? 'H' : 'S'
          const suffix = isMembershipSession ? '-M' : ''

          // 4.1/4.2/4.3/4.5: full grammar including the conditional -M suffix.
          const escapedBranch = branchCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const pattern = new RegExp(
            `^BK-${escapedBranch}-${yy}${mm}-${typeInitial}-[A-Za-z0-9]{5}${suffix ? '-M' : ''}$`,
          )
          expect(result).toMatch(pattern)

          // 4.3: H for salon, S for spa.
          expect(result.split('-')[3]).toBe(typeInitial)

          // 4.2: YYMM equals the two-digit year and month of the creation date.
          expect(result.split('-')[2]).toBe(`${yy}${mm}`)

          // 4.4: random segment is exactly 5 alphanumeric characters.
          expect(result.split('-')[4]).toMatch(/^[A-Za-z0-9]{5}$/)

          // 4.5: -M present exactly when membership session.
          expect(result.endsWith('-M')).toBe(isMembershipSession)
        },
      ),
      { numRuns: 200 },
    )
  })
})
