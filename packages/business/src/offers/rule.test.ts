/************************************************************
 * Module Name  : rule.test
 * Scope        : Business Logic — Offers (multi-branch offers.md)
 *
 * Description  : An offer's checkout rule covers the booking lines whose
 *                service it links, gives its type's discount on them, needs a
 *                combo's every service, and doesn't apply when it covers or
 *                saves nothing; the checkout list keeps live offers that
 *                save something on a salon booking, best first.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { assertOfferActive, isOfferLive } from './applicability'
import {
  assertOfferApplies,
  type CheckoutOffer,
  checkoutOfferChoices,
  evaluateOfferRule,
  type OfferLine,
} from './rule'

const LINES: OfferLine[] = [
  { serviceId: 'haircut', grossPaise: 80_000 },
  { serviceId: 'facial', grossPaise: 150_000 },
  { serviceId: 'manicure', grossPaise: 60_000 },
]

describe('evaluateOfferRule', () => {
  it('takes a percentage off the linked lines only', () => {
    const outcome = evaluateOfferRule(
      { offerType: 'percentage', discountPercentage: 20, serviceIds: ['facial'] },
      LINES,
    )
    expect(outcome).toEqual({
      applies: true,
      discountPaise: 30_000,
      coveredLines: [false, true, false],
    })
  })

  it('caps a flat amount at the linked lines', () => {
    const outcome = evaluateOfferRule(
      { offerType: 'flat', discountAmountPaise: 100_000, serviceIds: ['manicure'] },
      LINES,
    )
    expect(outcome).toMatchObject({ applies: true, discountPaise: 60_000 })
  })

  it('prices a combo against its linked lines when all are booked', () => {
    const outcome = evaluateOfferRule(
      { offerType: 'combo_price', comboPricePaise: 199_900, serviceIds: ['haircut', 'facial'] },
      LINES,
    )
    // 80,000 + 150,000 − 199,900; the manicure keeps its price.
    expect(outcome).toEqual({
      applies: true,
      discountPaise: 30_100,
      coveredLines: [true, true, false],
    })
  })

  it('names what a combo still needs', () => {
    const outcome = evaluateOfferRule(
      {
        offerType: 'combo_price',
        comboPricePaise: 99_900,
        serviceIds: ['haircut', 'pedicure', 'waxing'],
      },
      LINES,
      new Map([
        ['pedicure', 'Classic Pedicure'],
        ['waxing', 'Full Arms Waxing'],
      ]),
    )
    expect(outcome).toEqual({
      applies: false,
      reason: 'This combo also needs Classic Pedicure and Full Arms Waxing on the booking.',
    })
  })

  it('says a combo needs its services when it can’t name them', () => {
    const outcome = evaluateOfferRule(
      { offerType: 'combo_price', comboPricePaise: 99_900, serviceIds: ['haircut', 'unknown'] },
      LINES,
    )
    expect(outcome).toEqual({
      applies: false,
      reason: 'This combo needs every service it includes on the booking.',
    })
  })

  it('doesn’t apply when it covers no line', () => {
    expect(
      evaluateOfferRule(
        { offerType: 'percentage', discountPercentage: 10, serviceIds: ['pedicure'] },
        LINES,
      ),
    ).toEqual({ applies: false, reason: "This offer doesn't cover any service on this booking." })
  })

  it('doesn’t apply when it saves nothing', () => {
    expect(
      evaluateOfferRule(
        { offerType: 'combo_price', comboPricePaise: 300_000, serviceIds: ['haircut', 'facial'] },
        LINES,
      ),
    ).toEqual({ applies: false, reason: 'This offer saves nothing on this booking.' })
    expect(
      evaluateOfferRule(
        { offerType: 'percentage', discountPercentage: 1, serviceIds: ['haircut'] },
        [{ serviceId: 'haircut', grossPaise: 50 }],
      ),
    ).toMatchObject({ applies: false })
  })

  it('covers every line for a legacy offer with no linked services', () => {
    expect(
      evaluateOfferRule({ offerType: 'flat', discountAmountPaise: 10_000, serviceIds: [] }, LINES),
    ).toEqual({ applies: true, discountPaise: 10_000, coveredLines: [true, true, true] })
  })

  it('never discounts more than the covered lines, nor a negative amount (PBT)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            serviceId: fc.constantFrom('a', 'b', 'c', 'd'),
            grossPaise: fc.integer({ min: 0, max: 5_000_000 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        fc.subarray(['a', 'b', 'c', 'd']),
        fc.oneof(
          fc.record({
            offerType: fc.constant('percentage' as const),
            discountPercentage: fc.integer({ min: 1, max: 100 }),
          }),
          fc.record({
            offerType: fc.constant('flat' as const),
            discountAmountPaise: fc.integer({ min: 1, max: 10_000_000 }),
          }),
          fc.record({
            offerType: fc.constant('combo_price' as const),
            comboPricePaise: fc.integer({ min: 1, max: 10_000_000 }),
          }),
        ),
        (lines, serviceIds, value) => {
          const outcome = evaluateOfferRule({ ...value, serviceIds }, lines)
          if (!outcome.applies) {
            return
          }
          const covered = lines.reduce(
            (sum, line, index) => (outcome.coveredLines[index] ? sum + line.grossPaise : sum),
            0,
          )
          expect(outcome.discountPaise).toBeGreaterThan(0)
          expect(outcome.discountPaise).toBeLessThanOrEqual(covered)
          for (const [index, line] of lines.entries()) {
            expect(outcome.coveredLines[index]).toBe(
              serviceIds.length === 0 || serviceIds.includes(line.serviceId),
            )
          }
        },
      ),
    )
  })
})

describe('assertOfferApplies', () => {
  it('throws 409 OFFER_NOT_APPLICABLE with the reason', () => {
    let error: unknown
    try {
      assertOfferApplies(
        { offerType: 'percentage', discountPercentage: 10, serviceIds: ['pedicure'] },
        LINES,
      )
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe(ERROR_CODES.OFFER_NOT_APPLICABLE)
    expect((error as AppError).statusCode).toBe(409)
    expect((error as AppError).message).toBe(
      "This offer doesn't cover any service on this booking.",
    )
  })

  it('returns the discount and covered lines when it applies', () => {
    expect(
      assertOfferApplies(
        { offerType: 'flat', discountAmountPaise: 5_000, serviceIds: ['haircut'] },
        LINES,
      ),
    ).toEqual({ discountPaise: 5_000, coveredLines: [true, false, false] })
  })
})

describe('isOfferLive', () => {
  const offer = { isActive: true, startDate: '2026-11-01', endDate: '2026-11-30' }

  it('reads today on the IST calendar', () => {
    // 31/10 19:00 UTC is 01/11 00:30 IST: the first day of the offer.
    expect(isOfferLive(offer, new Date('2026-10-31T19:00:00.000Z'))).toBe(true)
    // 30/11 18:29 UTC is 30/11 23:59 IST, the last day; a minute later it ended.
    expect(isOfferLive(offer, new Date('2026-11-30T18:29:00.000Z'))).toBe(true)
    expect(isOfferLive(offer, new Date('2026-11-30T18:31:00.000Z'))).toBe(false)
  })

  it('takes date-mode column values', () => {
    expect(
      isOfferLive(
        {
          isActive: true,
          startDate: new Date('2026-11-01T00:00:00.000Z'),
          endDate: new Date('2026-11-01T00:00:00.000Z'),
        },
        new Date('2026-11-01T06:00:00.000Z'),
      ),
    ).toBe(true)
  })

  it('is false for a retired offer', () => {
    expect(isOfferLive({ ...offer, isActive: false }, new Date('2026-11-10T06:00:00.000Z'))).toBe(
      false,
    )
    expect(() =>
      assertOfferActive({ ...offer, isActive: false }, new Date('2026-11-10T06:00:00.000Z')),
    ).toThrow('This offer is not currently active')
  })
})

describe('checkoutOfferChoices', () => {
  const NOW = new Date('2026-11-10T06:00:00.000Z')
  const offer = (over: Partial<CheckoutOffer>): CheckoutOffer => ({
    id: 'o',
    name: 'Offer',
    terms: null,
    isActive: true,
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    offerType: 'percentage',
    discountPercentage: 10,
    serviceIds: ['facial'],
    ...over,
  })

  it('keeps the live offers that save something, best first, then by name', () => {
    const choices = checkoutOfferChoices({
      offers: [
        offer({ id: 'small', name: 'B small', discountPercentage: 10 }),
        offer({ id: 'expired', name: 'Expired', endDate: '2026-11-05' }),
        offer({ id: 'retired', name: 'Retired', isActive: false }),
        offer({ id: 'other', name: 'Pedicure only', serviceIds: ['pedicure'] }),
        offer({ id: 'big', name: 'Big', offerType: 'flat', discountAmountPaise: 50_000 }),
        offer({ id: 'small2', name: 'A small', discountPercentage: 10 }),
      ],
      lines: LINES,
      serviceType: 'salon',
      now: NOW,
    })
    expect(choices.map((c) => [c.id, c.discountPaise])).toEqual([
      ['big', 50_000],
      ['small2', 15_000],
      ['small', 15_000],
    ])
  })

  it('offers nothing on a spa booking', () => {
    expect(
      checkoutOfferChoices({ offers: [offer({})], lines: LINES, serviceType: 'spa', now: NOW }),
    ).toEqual([])
  })
})
