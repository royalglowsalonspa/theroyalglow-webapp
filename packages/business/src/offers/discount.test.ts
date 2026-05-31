import { describe, expect, it } from 'vitest'
import { computeOfferDiscount } from './discount'

describe('computeOfferDiscount', () => {
  it('computes a percentage discount, floored', () => {
    const { discountPaise, finalPaise } = computeOfferDiscount(
      { offerType: 'percentage', discountPercentage: 20 },
      100_001,
    )
    expect(discountPaise).toBe(20_000) // floor(100001 * 20 / 100) = 20000
    expect(finalPaise).toBe(80_001)
  })

  it('caps a flat discount at the subtotal', () => {
    const { discountPaise, finalPaise } = computeOfferDiscount(
      { offerType: 'flat', discountAmountPaise: 50_000 },
      30_000,
    )
    expect(discountPaise).toBe(30_000)
    expect(finalPaise).toBe(0)
  })

  it('computes combo savings as subtotal minus combo price', () => {
    const { discountPaise, finalPaise } = computeOfferDiscount(
      { offerType: 'combo_price', comboPricePaise: 90_000 },
      120_000,
    )
    expect(discountPaise).toBe(30_000)
    expect(finalPaise).toBe(90_000)
  })

  it('never produces a negative or over-subtotal discount (PBT)', () => {
    for (let i = 0; i < 1000; i++) {
      const subtotal = Math.floor(Math.random() * 1_000_000)
      const { discountPaise, finalPaise } = computeOfferDiscount(
        { offerType: 'percentage', discountPercentage: 150 },
        subtotal,
      )
      expect(discountPaise).toBeGreaterThanOrEqual(0)
      expect(discountPaise).toBeLessThanOrEqual(subtotal)
      expect(finalPaise).toBe(subtotal - discountPaise)
    }
  })
})
