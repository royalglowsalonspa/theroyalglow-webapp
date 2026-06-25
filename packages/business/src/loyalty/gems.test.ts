import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { calculateGemsEarned } from './gems'

describe('calculateGemsEarned', () => {
  it('awards 1 gem per ₹100 (10000 paise), floored', () => {
    expect(calculateGemsEarned(10_000)).toBe(1)
    expect(calculateGemsEarned(19_999)).toBe(1)
    expect(calculateGemsEarned(150_000)).toBe(15)
  })

  it('awards zero below ₹100', () => {
    expect(calculateGemsEarned(0)).toBe(0)
    expect(calculateGemsEarned(9_999)).toBe(0)
  })

  it('is the floor of paise / 10000 for arbitrary input (PBT)', () => {
    for (let i = 0; i < 1000; i++) {
      const p = Math.floor(Math.random() * 100_000_000)
      expect(calculateGemsEarned(p)).toBe(Math.floor(p / 10_000))
    }
  })
})

// Feature: backend-api, Property 28: Gems award is floor of rupees, zero for membership sessions
// Validates: Requirements 12.3, 12.4
describe('calculateGemsEarned — Property 28: floor of rupees, zero for membership sessions', () => {
  it('awards floor(totalPaise/10000) for non-membership sessions', () => {
    fc.assert(
      fc.property(fc.nat(), (totalPaise) => {
        expect(calculateGemsEarned(totalPaise, false)).toBe(Math.floor(totalPaise / 10_000))
      }),
      { numRuns: 100 },
    )
  })

  it('awards zero gems for membership sessions regardless of total', () => {
    fc.assert(
      fc.property(fc.nat(), (totalPaise) => {
        expect(calculateGemsEarned(totalPaise, true)).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})
