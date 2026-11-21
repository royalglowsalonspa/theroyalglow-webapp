/************************************************************
 * Module Name  : offer-rule.test
 * Scope        : CMS Collections — an Offer's checkout rule (offers.md)
 *
 * Description  : The card needs its image while shown; a rule needs its
 *                type's value, its services (a combo two) and both dates in
 *                order; linked services must be known, active and salon; an
 *                update merges over the saved document; dates read in IST.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import {
  istDate,
  type LinkedServiceRow,
  linkedServiceErrors,
  linkedServiceIds,
  mergeOfferData,
  type OfferData,
  offerRuleErrors,
  ruleTypeOf,
} from '../offer-rule'

const DATES = { validFrom: '2026-11-30T18:30:00.000Z', validUntil: '2026-12-31T18:30:00.000Z' }

function offer(over: OfferData = {}): OfferData {
  return {
    showOnWebsite: true,
    image: 7,
    ...DATES,
    rule: { type: 'percentage', percentage: 20, services: ['svc_facial'] },
    ...over,
  }
}

const paths = (data: OfferData) => offerRuleErrors(data).map((e) => e.path)

describe('offerRuleErrors', () => {
  it('accepts a complete rule of each type', () => {
    expect(offerRuleErrors(offer())).toEqual([])
    expect(
      offerRuleErrors(offer({ rule: { type: 'flat', amountPaise: 50_000, services: ['a'] } })),
    ).toEqual([])
    expect(
      offerRuleErrors(
        offer({ rule: { type: 'combo_price', comboPricePaise: 299_900, services: ['a', 'b'] } }),
      ),
    ).toEqual([])
  })

  it('needs the image only while the card is shown', () => {
    expect(paths(offer({ image: null }))).toEqual(['image'])
    expect(paths(offer({ image: null, showOnWebsite: false }))).toEqual([])
  })

  it('checks nothing more for a card without a rule', () => {
    expect(offerRuleErrors({ showOnWebsite: true, image: 3, rule: { type: 'none' } })).toEqual([])
    expect(offerRuleErrors({ showOnWebsite: false, rule: null })).toEqual([])
  })

  it.each([
    [{ type: 'percentage', percentage: 0, services: ['a'] }, 'rule.percentage'],
    [{ type: 'percentage', percentage: 101, services: ['a'] }, 'rule.percentage'],
    [{ type: 'percentage', percentage: 12.5, services: ['a'] }, 'rule.percentage'],
    [{ type: 'flat', amountPaise: 0, services: ['a'] }, 'rule.amountPaise'],
    [{ type: 'flat', amountPaise: 99.5, services: ['a'] }, 'rule.amountPaise'],
    [{ type: 'combo_price', services: ['a', 'b'] }, 'rule.comboPricePaise'],
  ])('refuses a missing or out-of-range value: %o', (rule, path) => {
    expect(paths(offer({ rule }))).toEqual([path])
  })

  it('needs linked services, and two for a combo', () => {
    expect(paths(offer({ rule: { type: 'percentage', percentage: 10, services: [] } }))).toEqual([
      'rule.services',
    ])
    const combo = offerRuleErrors(
      offer({ rule: { type: 'combo_price', comboPricePaise: 1_000, services: ['a', 'a'] } }),
    )
    expect(combo).toEqual([
      { path: 'rule.services', message: 'A combo needs at least two services.' },
    ])
  })

  it('needs both dates, in order, read as IST days', () => {
    expect(paths(offer({ validFrom: null }))).toEqual(['validFrom'])
    expect(paths(offer({ validUntil: null }))).toEqual(['validUntil'])
    expect(
      paths(
        offer({ validFrom: '2026-12-02T00:00:00.000Z', validUntil: '2026-12-01T06:30:00.000Z' }),
      ),
    ).toEqual(['validUntil'])
    // 01/12 00:00 IST to 01/12 23:59 IST: the same day, so in order.
    expect(
      paths(
        offer({ validFrom: '2026-11-30T18:30:00.000Z', validUntil: '2026-12-01T18:29:00.000Z' }),
      ),
    ).toEqual([])
  })
})

describe('linkedServiceErrors', () => {
  const row = (over: Partial<LinkedServiceRow>): LinkedServiceRow => ({
    id: 'svc',
    name: 'Service',
    isActive: true,
    serviceType: 'salon',
    categoryActive: true,
    ...over,
  })

  it('passes active salon services', () => {
    expect(linkedServiceErrors(['a'], [row({ id: 'a' })])).toEqual([])
  })

  it('names unknown, SPA and inactive services in one message', () => {
    expect(
      linkedServiceErrors(
        ['a', 'b', 'c', 'd', 'gone'],
        [
          row({ id: 'a', name: 'Haircut' }),
          row({ id: 'b', name: 'Hot Stone', serviceType: 'spa' }),
          row({ id: 'c', name: 'Old Facial', isActive: false }),
          row({ id: 'd', name: 'Waxing', categoryActive: false }),
        ],
      ),
    ).toEqual([
      {
        path: 'rule.services',
        message:
          "No service has the id gone. Offers apply to salon services only: Hot Stone is a SPA service. Old Facial and Waxing aren't active. Choose the services again.",
      },
    ])
  })
})

describe('mergeOfferData', () => {
  it('lays an update’s fields over the saved document, the rule field by field', () => {
    const saved = {
      image: 4,
      showOnWebsite: true,
      rule: { type: 'percentage', percentage: 20, services: ['a'] },
    }
    expect(mergeOfferData({ rule: { percentage: 30 } }, saved)).toEqual({
      image: 4,
      showOnWebsite: true,
      rule: { type: 'percentage', percentage: 30, services: ['a'] },
    })
    expect(mergeOfferData({ title: 'x' }, undefined)).toEqual({ title: 'x', rule: {} })
  })
})

describe('helpers', () => {
  it('reads unknown or missing rule types as no rule', () => {
    expect(ruleTypeOf({ type: 'flat' })).toBe('flat')
    expect(ruleTypeOf({ type: 'bogus' })).toBe('none')
    expect(ruleTypeOf(null)).toBe('none')
  })

  it('takes ids from bare or populated relationships, unique and sorted', () => {
    expect(linkedServiceIds({ services: ['b', { id: 'a' }, 'b', ' ', null] })).toEqual(['a', 'b'])
  })

  it('reads an instant as its IST calendar day', () => {
    expect(istDate('2026-11-30T18:30:00.000Z')).toBe('2026-12-01')
    expect(istDate('2026-11-30T18:29:59.000Z')).toBe('2026-11-30')
    expect(istDate(new Date('2026-12-01T06:30:00.000Z'))).toBe('2026-12-01')
  })
})
