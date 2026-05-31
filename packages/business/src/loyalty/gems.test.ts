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
