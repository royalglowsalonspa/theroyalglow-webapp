/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : membership/sale.test
 * Scope        : Unit tests — selling a SPA membership (multi-branch R9)
 *
 * Description  : The hours counter (MS-15), the tier prefill, the validity
 *                from picked IST dates whatever the host timezone (MS-16),
 *                the invoice line without the tier (R9.1), the IST year in
 *                membership numbers, and tier slugs.
 ************************************************************/

import { AppError } from '@rgss/errors'
import { describe, expect, it } from 'vitest'
import { generateMembershipNumber } from './number'
import {
  hoursLabel,
  membershipInvoiceLine,
  saleValidity,
  stepSaleHours,
  tierSalePrefill,
} from './sale'
import { assertTaxClassChange, tierSlug } from './tiers'
import { endOfDayIST, startOfDayIST } from './validity'

function refusal(run: () => unknown): { message: string; details: unknown } {
  try {
    run()
  } catch (error) {
    if (error instanceof AppError) {
      return { message: error.message, details: error.details }
    }
    throw error
  }
  throw new Error('expected a refusal')
}

describe('stepSaleHours (MS-15)', () => {
  it('moves in whole hours and stops at 1 hour', () => {
    expect(stepSaleHours(8, 1)).toBe(9)
    expect(stepSaleHours(8, -1)).toBe(7)
    expect(stepSaleHours(1, -1)).toBe(1)
    expect(stepSaleHours(0, 0)).toBe(1)
    expect(stepSaleHours(500, 1)).toBe(500)
    expect(stepSaleHours(7.6, 0)).toBe(8)
    expect(stepSaleHours(Number.NaN, 0)).toBe(1)
  })
})

describe('tierSalePrefill (R9.3)', () => {
  it('fills the usual hours, price and the expiry its validity gives', () => {
    expect(
      tierSalePrefill(
        { defaultHoursMinutes: 480, defaultPricePaise: 1_000_000, defaultValidityDays: 90 },
        '2026-11-01',
      ),
    ).toEqual({ hours: 8, pricePaise: 1_000_000, expiresOn: '2027-01-30' })
  })

  it('starts a custom tier at 1 hour and ₹0, to be agreed', () => {
    expect(
      tierSalePrefill(
        { defaultHoursMinutes: 0, defaultPricePaise: 0, defaultValidityDays: 90 },
        '2026-11-01',
      ),
    ).toMatchObject({ hours: 1, pricePaise: 0 })
  })
})

describe('saleValidity (MS-16)', () => {
  const today = '2026-11-01'

  it('runs from 00:00 IST on the start date to 23:59:59.999 IST on the expiry date', () => {
    const validity = saleValidity({ startDate: '2026-11-03', expiresOn: '2027-01-31', today })

    expect(validity.startDate).toBe('2026-11-03')
    expect(validity.startsAt.toISOString()).toBe('2026-11-02T18:30:00.000Z')
    expect(validity.expiresAt.toISOString()).toBe('2027-01-31T18:29:59.999Z')
  })

  it('starts today in IST when no start date is given', () => {
    expect(saleValidity({ expiresOn: '2026-12-01', today }).startDate).toBe(today)
  })

  it('refuses an expiry on or before the start date', () => {
    expect(refusal(() => saleValidity({ expiresOn: today, today })).details).toEqual({
      expiresOn: ['Choose a later date'],
    })
    expect(refusal(() => saleValidity({ expiresOn: '2026-10-31', today })).message).toMatch(
      /after the start date/,
    )
  })

  it('refuses a start in the past or too far ahead, and a validity too long', () => {
    expect(
      refusal(() => saleValidity({ startDate: '2026-10-31', expiresOn: '2026-12-01', today }))
        .message,
    ).toMatch(/in the past/)
    expect(
      refusal(() => saleValidity({ startDate: '2027-01-01', expiresOn: '2027-03-01', today }))
        .message,
    ).toMatch(/at most 60 days ahead/)
    expect(
      refusal(() => saleValidity({ startDate: today, expiresOn: '2029-11-02', today })).message,
    ).toMatch(/at most 1095 days/)
    // The edges themselves are allowed.
    expect(() =>
      saleValidity({ startDate: '2026-12-31', expiresOn: '2029-12-30', today }),
    ).not.toThrow()
  })
})

describe('IST day boundaries', () => {
  it('do not depend on the host timezone', () => {
    expect(startOfDayIST('2027-01-01').toISOString()).toBe('2026-12-31T18:30:00.000Z')
    expect(endOfDayIST('2027-01-01').toISOString()).toBe('2027-01-01T18:29:59.999Z')
  })
})

describe('membershipInvoiceLine (R9.1)', () => {
  it('names the hours and the expiry, not the tier', () => {
    expect(membershipInvoiceLine({ hours: 8, expiresOn: '2027-01-31' })).toBe(
      'SPA membership: 8 hours, valid until 31/01/2027',
    )
    expect(hoursLabel(1)).toBe('1 hour')
  })
})

describe('generateMembershipNumber', () => {
  it('uses the IST year, so a sale just after midnight IST on 1 January is the new year', () => {
    expect(generateMembershipNumber(2, new Date('2026-12-31T18:45:00.000Z'))).toMatch(
      /^RG-MEM-27-2-\d{5}$/,
    )
    expect(generateMembershipNumber(1, new Date('2026-12-31T18:15:00.000Z'))).toMatch(
      /^RG-MEM-26-1-\d{5}$/,
    )
  })
})

describe('tierSlug', () => {
  it('joins lowercase words with hyphens', () => {
    expect(tierSlug('Gold Plus')).toBe('gold-plus')
    expect(tierSlug('  Diwali — Special 2026!  ')).toBe('diwali-special-2026')
    expect(tierSlug('★★★')).toBe('tier')
  })
})

describe('assertTaxClassChange (MS-18)', () => {
  it('lets only the Developer change a tier’s SAC code', () => {
    expect(() =>
      assertTaxClassChange({ isDeveloper: false, current: '999723', next: '999722' }),
    ).toThrow(/Only the Developer/)
    expect(() =>
      assertTaxClassChange({ isDeveloper: true, current: '999723', next: '999722' }),
    ).not.toThrow()
  })

  it('lets anyone send the unchanged code, or none', () => {
    expect(() =>
      assertTaxClassChange({ isDeveloper: false, current: '999723', next: '999723' }),
    ).not.toThrow()
    expect(() =>
      assertTaxClassChange({ isDeveloper: false, current: '999723', next: undefined }),
    ).not.toThrow()
    // A new tier: setting any code is a change.
    expect(() =>
      assertTaxClassChange({ isDeveloper: false, current: null, next: '999723' }),
    ).toThrow()
  })
})
