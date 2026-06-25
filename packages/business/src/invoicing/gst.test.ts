import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { splitGST } from './gst'

const GST_RATE = 0.18

describe('splitGST', () => {
  it('reconstructs the inclusive total exactly (base + gst === total)', () => {
    const { basePaise, gstPaise, totalPaise } = splitGST(11_800)
    expect(basePaise + gstPaise).toBe(totalPaise)
    expect(totalPaise).toBe(11_800)
  })

  it('back-calculates the 18% inclusive base', () => {
    // ₹118.00 inclusive → ₹100.00 base + ₹18.00 GST
    const { basePaise, gstPaise } = splitGST(11_800)
    expect(basePaise).toBe(10_000)
    expect(gstPaise).toBe(1_800)
  })

  it('splits GST into cgst + sgst halves that sum to gst', () => {
    const { gstPaise, cgstPaise, sgstPaise } = splitGST(15_001)
    expect(cgstPaise + sgstPaise).toBe(gstPaise)
  })

  // Property: for any non-negative integer paise, all parts are integers and
  // base + gst === total === input, with no floating-point drift.
  it('is integral and conserving for arbitrary paise (PBT)', () => {
    for (let i = 0; i < 2000; i++) {
      const p = Math.floor(Math.random() * 100_000_000)
      const { basePaise, gstPaise, cgstPaise, sgstPaise, totalPaise } = splitGST(p)
      expect(Number.isInteger(basePaise)).toBe(true)
      expect(Number.isInteger(gstPaise)).toBe(true)
      expect(Number.isInteger(cgstPaise)).toBe(true)
      expect(Number.isInteger(sgstPaise)).toBe(true)
      expect(basePaise + gstPaise).toBe(p)
      expect(totalPaise).toBe(p)
      expect(cgstPaise + sgstPaise).toBe(gstPaise)
    }
  })

  it('handles zero', () => {
    expect(splitGST(0)).toEqual({
      basePaise: 0,
      gstPaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      totalPaise: 0,
    })
  })

  // Feature: backend-api, Property 27: GST split reconstructs the total exactly
  // Validates: Requirements 12.2
  it('Property 27: GST split reconstructs the total exactly', () => {
    fc.assert(
      fc.property(fc.nat(), (total) => {
        const { basePaise, gstPaise, cgstPaise, sgstPaise } = splitGST(total)
        // taxable === round(total / 1.18)
        expect(basePaise).toBe(Math.round(total / (1 + GST_RATE)))
        // gst === total - taxable
        expect(gstPaise).toBe(total - basePaise)
        // taxable + gst === total exactly
        expect(basePaise + gstPaise).toBe(total)
        // cgst + sgst === gst with cgst === floor(gst / 2)
        expect(cgstPaise).toBe(Math.floor(gstPaise / 2))
        expect(cgstPaise + sgstPaise).toBe(gstPaise)
      }),
      { numRuns: 100 },
    )
  })
})
