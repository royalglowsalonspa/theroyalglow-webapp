import { describe, expect, it } from 'vitest'
import { formatINR } from './currency'

describe('formatINR', () => {
  it('formats paise as INR with two decimals', () => {
    // 100000 paise = ₹1,000.00
    expect(formatINR(100_000)).toBe('₹1,000.00')
  })

  it('uses Indian digit grouping (lakh)', () => {
    // 10000000 paise = ₹1,00,000.00
    expect(formatINR(10_000_000)).toBe('₹1,00,000.00')
  })

  it('formats zero', () => {
    expect(formatINR(0)).toBe('₹0.00')
  })

  it('always renders exactly two decimals for any non-negative paise (PBT)', () => {
    for (let i = 0; i < 1000; i++) {
      const p = Math.floor(Math.random() * 100_000_000)
      const out = formatINR(p)
      expect(out.startsWith('₹')).toBe(true)
      // Exactly two digits after the decimal point.
      expect(out).toMatch(/\.\d{2}$/)
    }
  })
})
