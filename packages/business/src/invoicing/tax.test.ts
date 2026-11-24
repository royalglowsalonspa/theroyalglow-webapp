/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/tax.test
 * Scope        : Unit tests — GST on issued invoices (multi-branch R6, TX)
 *
 * Description  : TX-02 and TX-11 amounts, the odd-paisa rule, sums that
 *                always reconstruct the amount (property tests), discount
 *                shares, per-line rates, version resolution at an IST
 *                boundary (TX-04), no fallback rate, live-invoicing checks
 *                (TX-08), new-version timing, the IST financial year and the
 *                invoice number format.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { startOfDayIST } from '../membership/validity'
import { financialYearIST, formatInvoiceNumber, invoiceFileStem } from './invoice-number'
import {
  allocateDiscount,
  assertInvoiceIssuable,
  assertNewTaxVersion,
  computeInvoiceTax,
  resolveTaxVersions,
  splitInclusive,
  splitIntraState,
  type TaxVersion,
  versionInForce,
} from './tax'

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof AppError) {
      return error.code
    }
    throw error
  }
  throw new Error('expected a refusal')
}

describe('splitInclusive and splitIntraState', () => {
  it('TX-02: ₹1,050 at 5% is ₹1,000 taxable and ₹50 tax, ₹25 CGST and ₹25 SGST', () => {
    expect(splitInclusive(105_000, 500)).toEqual({ taxablePaise: 100_000, taxPaise: 5_000 })
    expect(splitIntraState(5_000)).toEqual({ cgstPaise: 2_500, sgstPaise: 2_500 })
  })

  it('TX-11: ₹10,000 at 5% is ₹9,523.81 taxable and ₹476.19 tax; the odd paisa goes to SGST', () => {
    const { taxablePaise, taxPaise } = splitInclusive(1_000_000, 500)
    expect({ taxablePaise, taxPaise }).toEqual({ taxablePaise: 952_381, taxPaise: 47_619 })
    expect(splitIntraState(taxPaise)).toEqual({ cgstPaise: 23_809, sgstPaise: 23_810 })
  })

  it('rounds half up and keeps 18% amounts as before', () => {
    // 118.00 at 18% → 100.00 + 18.00
    expect(splitInclusive(11_800, 1_800)).toEqual({ taxablePaise: 10_000, taxPaise: 1_800 })
    // 21 paise at 5%: 20.000… taxable; 1 paisa at 5% → 0.952… rounds to 1.
    expect(splitInclusive(21, 500)).toEqual({ taxablePaise: 20, taxPaise: 1 })
    expect(splitInclusive(1, 500)).toEqual({ taxablePaise: 1, taxPaise: 0 })
    expect(splitInclusive(0, 500)).toEqual({ taxablePaise: 0, taxPaise: 0 })
    expect(splitInclusive(12_345, 0)).toEqual({ taxablePaise: 12_345, taxPaise: 0 })
  })

  it('always reconstructs the amount and the tax exactly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 2_800 }),
        (amount, rate) => {
          const { taxablePaise, taxPaise } = splitInclusive(amount, rate)
          const { cgstPaise, sgstPaise } = splitIntraState(taxPaise)
          expect(taxablePaise + taxPaise).toBe(amount)
          expect(cgstPaise + sgstPaise).toBe(taxPaise)
          expect(sgstPaise - cgstPaise).toBeGreaterThanOrEqual(0)
          expect(sgstPaise - cgstPaise).toBeLessThanOrEqual(1)
          expect(taxPaise).toBeGreaterThanOrEqual(0)
        },
      ),
    )
  })

  it('refuses rates outside 0–28% and amounts that are not whole paise', () => {
    expect(codeOf(() => splitInclusive(100, 2_801))).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(codeOf(() => splitInclusive(100, 5.5))).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(codeOf(() => splitInclusive(-1, 500))).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(codeOf(() => splitInclusive(10.5, 500))).toBe(ERROR_CODES.VALIDATION_ERROR)
  })
})

describe('allocateDiscount', () => {
  it('shares in proportion with the remainder to the largest fractions, earlier first on ties', () => {
    expect(allocateDiscount([60_000, 40_000], 10_000)).toEqual([6_000, 4_000])
    expect(allocateDiscount([1, 1, 1], 2)).toEqual([1, 1, 0])
    expect(allocateDiscount([100, 0, 50], 0)).toEqual([0, 0, 0])
  })

  it('always adds up to the discount, with no share above its line', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5_000_000 }), { minLength: 1, maxLength: 8 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (amounts, fraction) => {
          const total = amounts.reduce((a, b) => a + b, 0)
          const discount = Math.floor(total * fraction)
          const shares = allocateDiscount(amounts, discount)
          expect(shares.reduce((a, b) => a + b, 0)).toBe(discount)
          shares.forEach((share, i) => {
            expect(share).toBeGreaterThanOrEqual(0)
            expect(share).toBeLessThanOrEqual(amounts[i] ?? 0)
          })
        },
      ),
    )
  })

  it('refuses a discount larger than the lines', () => {
    expect(codeOf(() => allocateDiscount([100], 101))).toBe(ERROR_CODES.VALIDATION_ERROR)
  })
})

describe('computeInvoiceTax', () => {
  it('works out each line after its discount share and sums the lines', () => {
    const { lines, totals } = computeInvoiceTax(
      [
        { grossPaise: 105_000, rateBps: 500 },
        { grossPaise: 52_500, rateBps: 500 },
      ],
      15_750,
    )
    expect(lines.map((l) => [l.discountPaise, l.netPaise, l.taxablePaise, l.taxPaise])).toEqual([
      [10_500, 94_500, 90_000, 4_500],
      [5_250, 47_250, 45_000, 2_250],
    ])
    expect(totals).toEqual({
      grossPaise: 157_500,
      discountPaise: 15_750,
      netPaise: 141_750,
      taxablePaise: 135_000,
      taxPaise: 6_750,
      cgstPaise: 3_375,
      sgstPaise: 3_375,
    })
  })

  it('keeps each line’s own rate on a mixed invoice', () => {
    const { lines, totals } = computeInvoiceTax([
      { grossPaise: 105_000, rateBps: 500 },
      { grossPaise: 118_000, rateBps: 1_800 },
    ])
    expect(lines.map((l) => l.taxPaise)).toEqual([5_000, 18_000])
    expect(totals.taxPaise).toBe(23_000)
  })

  it('bills a gems-covered line at zero and still records its rate', () => {
    const { lines } = computeInvoiceTax([
      { grossPaise: 0, rateBps: 500 },
      { grossPaise: 52_500, rateBps: 500 },
    ])
    expect(lines[0]).toMatchObject({ netPaise: 0, taxPaise: 0, rateBps: 500 })
  })

  it('shares an offer’s discount across the lines it covers only', () => {
    const { lines, totals } = computeInvoiceTax(
      [
        { grossPaise: 105_000, rateBps: 500 },
        { grossPaise: 52_500, rateBps: 500 },
        { grossPaise: 21_000, rateBps: 500 },
      ],
      15_750,
      [true, false, true],
    )
    // 15,750 split 105,000 : 21,000 → 13,125 and 2,625; the middle line keeps
    // its full amount.
    expect(lines.map((l) => l.discountPaise)).toEqual([13_125, 0, 2_625])
    expect(lines[1]).toMatchObject({ netPaise: 52_500, taxablePaise: 50_000, taxPaise: 2_500 })
    expect(totals.discountPaise).toBe(15_750)
    expect(totals.netPaise).toBe(178_500 - 15_750)
  })

  it('refuses a discount larger than the lines it covers', () => {
    expect(
      codeOf(() =>
        computeInvoiceTax(
          [
            { grossPaise: 10_000, rateBps: 500 },
            { grossPaise: 90_000, rateBps: 500 },
          ],
          20_000,
          [true, false],
        ),
      ),
    ).toBe(ERROR_CODES.VALIDATION_ERROR)
  })

  it('always adds up: net = taxable + tax, tax = CGST + SGST, totals = sums', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            grossPaise: fc.integer({ min: 0, max: 2_000_000 }),
            rateBps: fc.constantFrom(0, 500, 1_200, 1_800, 2_800),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (input, fraction) => {
          const gross = input.reduce((a, l) => a + l.grossPaise, 0)
          const discount = Math.floor(gross * fraction)
          const { lines, totals } = computeInvoiceTax(input, discount)
          for (const line of lines) {
            expect(line.taxablePaise + line.taxPaise).toBe(line.netPaise)
            expect(line.cgstPaise + line.sgstPaise).toBe(line.taxPaise)
          }
          expect(totals.netPaise).toBe(gross - discount)
          expect(totals.taxablePaise + totals.taxPaise).toBe(totals.netPaise)
          expect(totals.cgstPaise + totals.sgstPaise).toBe(totals.taxPaise)
        },
      ),
    )
  })
})

describe('tax versions', () => {
  const version = (over: Partial<TaxVersion>): TaxVersion => ({
    id: 'v',
    branchId: 'rs',
    sacCode: '999721',
    rateBps: 500,
    pricesIncludeTax: true,
    effectiveFrom: startOfDayIST('2025-09-22'),
    reviewStatus: 'provisional',
    ...over,
  })
  const OLD = version({ id: 'old', rateBps: 1_800, effectiveFrom: startOfDayIST('2025-04-01') })
  const NEW = version({ id: 'new' })
  const OTHER_BRANCH = version({ id: 'mh', branchId: 'mh', rateBps: 1_200 })
  const ALL = [NEW, OLD, OTHER_BRANCH]

  it('TX-04: resolves the version just before, at and after an IST boundary', () => {
    const boundary = startOfDayIST('2025-09-22') // 21/09/2025 18:30 UTC
    expect(versionInForce(ALL, 'rs', '999721', new Date(boundary.getTime() - 1))?.id).toBe('old')
    expect(versionInForce(ALL, 'rs', '999721', boundary)?.id).toBe('new')
    expect(versionInForce(ALL, 'rs', '999721', new Date(boundary.getTime() + 1))?.id).toBe('new')
  })

  it('TX-01: keeps branches apart and never applies a future version early', () => {
    const at = startOfDayIST('2026-10-25')
    expect(versionInForce(ALL, 'mh', '999721', at)?.rateBps).toBe(1_200)
    const future = version({
      id: 'future',
      rateBps: 900,
      effectiveFrom: startOfDayIST('2027-01-01'),
    })
    expect(versionInForce([...ALL, future], 'rs', '999721', at)?.id).toBe('new')
  })

  it('resolves each SAC code once and fails with an actionable error when one is missing', () => {
    const resolved = resolveTaxVersions({
      versions: ALL,
      branchId: 'rs',
      branchName: 'Rayasandra',
      sacCodes: ['999721', '999721'],
      taxPoint: new Date('2026-10-25T06:00:00Z'),
    })
    expect([...resolved.keys()]).toEqual(['999721'])

    expect(() =>
      resolveTaxVersions({
        versions: ALL,
        branchId: 'rs',
        branchName: 'Rayasandra',
        sacCodes: ['999721', '999723'],
        taxPoint: new Date('2026-10-25T06:00:00Z'),
      }),
    ).toThrow(/Rayasandra has no tax rate in force for SAC 999723/)
  })

  it('never falls back: no versions at all is a configuration error, not 18% or 0%', () => {
    expect(
      codeOf(() =>
        resolveTaxVersions({
          versions: [],
          branchId: 'rs',
          branchName: 'Rayasandra',
          sacCodes: ['999721'],
          taxPoint: new Date(),
        }),
      ),
    ).toBe(ERROR_CODES.TAX_CONFIGURATION_INCOMPLETE)
  })

  it('lets a first version start any day, a later one only on a future date', () => {
    const now = new Date('2026-10-25T06:00:00Z')
    expect(() =>
      assertNewTaxVersion({ effectiveFrom: startOfDayIST('2025-09-22'), now, existing: [] }),
    ).not.toThrow()
    expect(
      codeOf(() =>
        assertNewTaxVersion({ effectiveFrom: startOfDayIST('2026-10-25'), now, existing: [NEW] }),
      ),
    ).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(() =>
      assertNewTaxVersion({ effectiveFrom: startOfDayIST('2026-10-26'), now, existing: [NEW] }),
    ).not.toThrow()
    expect(
      codeOf(() => assertNewTaxVersion({ effectiveFrom: NEW.effectiveFrom, now, existing: [NEW] })),
    ).toBe(ERROR_CODES.CONFLICT)
  })
})

describe('assertInvoiceIssuable (TX-08, TX-10)', () => {
  const branch = { name: 'Rayasandra', legalName: null, gstin: null }

  it('issues with provisional rates before live invoicing, and says so', () => {
    expect(
      assertInvoiceIssuable({
        liveInvoicing: false,
        branch,
        versions: [{ reviewStatus: 'provisional' }],
      }),
    ).toBe('provisional')
    expect(
      assertInvoiceIssuable({
        liveInvoicing: false,
        branch,
        versions: [{ reviewStatus: 'reviewed' }],
      }),
    ).toBe('reviewed')
  })

  it('refuses live invoicing without the legal name, GSTIN or reviewed rates', () => {
    expect(() =>
      assertInvoiceIssuable({
        liveInvoicing: true,
        branch,
        versions: [{ reviewStatus: 'provisional' }],
      }),
    ).toThrow(/needs its legal name, its GSTIN, reviewed tax rates/)
    expect(
      assertInvoiceIssuable({
        liveInvoicing: true,
        branch: { name: 'Rayasandra', legalName: 'Royal Glow LLP', gstin: '29ABCDE1234F1Z5' },
        versions: [{ reviewStatus: 'reviewed' }],
      }),
    ).toBe('reviewed')
  })
})

describe('financialYearIST and invoice numbers', () => {
  it('turns over at 00:00 IST on 1 April, whatever the host timezone', () => {
    expect(financialYearIST(new Date('2026-03-31T18:29:59.999Z'))).toBe('2526')
    expect(financialYearIST(new Date('2026-03-31T18:30:00.000Z'))).toBe('2627')
    expect(financialYearIST(new Date('2027-03-31T18:29:59.999Z'))).toBe('2627')
    expect(financialYearIST(new Date('2099-12-31T00:00:00Z'))).toBe('9900')
  })

  it('formats RS/2627/000123 within 16 characters and makes a safe file name', () => {
    const number = formatInvoiceNumber('RS', '2627', 123)
    expect(number).toBe('RS/2627/000123')
    expect(formatInvoiceNumber('ABCD', '2627', 999_999)).toHaveLength(16)
    expect(invoiceFileStem(number)).toBe('RS-2627-000123')
    // Numbers from before per-branch numbering are unchanged.
    expect(invoiceFileStem('INV-1-2627-92921')).toBe('INV-1-2627-92921')
  })
})
