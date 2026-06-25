import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { calculateBookingTotal } from './pricing'

// Feature: backend-api, Property 10: Booking totals equal the sums of selected services
// Validates: Requirements 5.5, 5.6
describe('calculateBookingTotal — Property 10: totals equal sums of selected services', () => {
  // A selected service contributes an integer price (paise) and an integer
  // duration (minutes). Bound the magnitudes to stay well within safe-integer
  // range even when many services are summed.
  const serviceArb = fc.record({
    pricePaise: fc.integer({ min: 0, max: 100_000_000 }),
    durationMinutes: fc.integer({ min: 0, max: 1_440 }),
  })

  const servicesArb = fc.array(serviceArb, { maxLength: 50 })

  it('totalAmountPaise and totalDurationMinutes equal the integer sums for any service set', () => {
    fc.assert(
      fc.property(servicesArb, (services) => {
        const result = calculateBookingTotal(services)

        // Independent reference sums (avoid reusing the implementation's reducer).
        let expectedAmount = 0
        let expectedDuration = 0
        for (const s of services) {
          expectedAmount += s.pricePaise
          expectedDuration += s.durationMinutes
        }

        // 5.5: total amount in paise equals the integer sum of prices.
        expect(result.totalAmountPaise).toBe(expectedAmount)
        expect(Number.isInteger(result.totalAmountPaise)).toBe(true)

        // 5.6: total duration equals the integer sum of durations.
        expect(result.totalDurationMinutes).toBe(expectedDuration)
        expect(Number.isInteger(result.totalDurationMinutes)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })
})
