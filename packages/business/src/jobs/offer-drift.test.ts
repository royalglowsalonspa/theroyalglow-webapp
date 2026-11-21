/************************************************************
 * Module Name  : offer-drift.test
 * Scope        : Business Logic — catalogue drift, the offer pair
 *                (multi-branch offers.md)
 *
 * Description  : A rule's mirror must match it field for field; a missing
 *                mirror and a mirror with no CMS offer are drift; the mirror
 *                of an offer without a rule must be retired; the catalogue
 *                report gains the offer table and its findings.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import { diffOfferDrift, type OfferDriftSnapshot, withOfferDrift } from './offer-drift'
import { buildServiceDriftReport } from './service-drift'

function rule(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: '20% off facials',
    description: null,
    offerType: 'percentage',
    discountPercentage: 20,
    discountAmountPaise: null,
    comboPricePaise: null,
    startDate: '2026-12-01',
    endDate: '2026-12-31',
    isActive: true,
    terms: 'Weekdays only',
    displayOrder: 0,
    showOnWebsite: true,
    serviceIds: 'svc_cleanup,svc_facial',
    ...over,
  }
}

const CLEAN: OfferDriftSnapshot = {
  ruleRows: [rule('cms_offer_1')],
  ruleFreeIds: ['cms_offer_2', 'cms_offer_3'],
  publicRows: [rule('cms_offer_1'), rule('cms_offer_2', { isActive: false })],
}

describe('diffOfferDrift', () => {
  it('is clean when every rule has its mirror and retired mirrors stay retired', () => {
    const report = diffOfferDrift(CLEAN)
    expect(report).toMatchObject({
      table: 'offer',
      cmsRowCount: 3,
      publicRowCount: 2,
      hasDrift: false,
      findings: [],
    })
  })

  it('reports a changed rule field by field', () => {
    const report = diffOfferDrift({
      ...CLEAN,
      publicRows: [
        rule('cms_offer_1', { discountPercentage: 25, serviceIds: 'svc_facial' }),
        rule('cms_offer_2', { isActive: false }),
      ],
    })
    expect(report.changedRows).toEqual(['cms_offer_1'])
    expect(report.findings.map((f) => [f.field, f.cmsValue, f.publicValue])).toEqual([
      ['discountPercentage', '20', '25'],
      ['serviceIds', 'svc_cleanup,svc_facial', 'svc_facial'],
    ])
  })

  it('reports a missing mirror and a mirror without a CMS offer', () => {
    const report = diffOfferDrift({
      ruleRows: [rule('cms_offer_1'), rule('cms_offer_4')],
      ruleFreeIds: [],
      publicRows: [rule('cms_offer_1'), rule('cms_offer_9')],
    })
    expect(report.missingInPublic).toEqual(['cms_offer_4'])
    expect(report.extraInPublic).toEqual(['cms_offer_9'])
    expect(report.hasDrift).toBe(true)
  })

  it('reports a mirror still active after its rule was removed', () => {
    const report = diffOfferDrift({
      ...CLEAN,
      publicRows: [rule('cms_offer_1'), rule('cms_offer_2')],
    })
    expect(report.findings).toEqual([
      {
        table: 'offer',
        kind: 'field_mismatch',
        id: 'cms_offer_2',
        field: 'isActive',
        cmsValue: 'false',
        publicValue: 'true',
      },
    ])
    expect(report.changedRows).toEqual(['cms_offer_2'])
  })
})

describe('withOfferDrift', () => {
  const empty = buildServiceDriftReport({
    categories: { cmsRows: [], publicRows: [] },
    services: { cmsRows: [], publicRows: [] },
  })

  it('adds the offer table and its findings to the catalogue report', () => {
    const report = withOfferDrift(empty, {
      ruleRows: [rule('cms_offer_1')],
      ruleFreeIds: [],
      publicRows: [],
    })
    expect(report.tables.map((t) => t.table)).toEqual(['service_category', 'service', 'offer'])
    expect(report.findingCount).toBe(1)
    expect(report.hasDrift).toBe(true)
  })

  it('leaves the report as it is without an offer snapshot', () => {
    expect(withOfferDrift(empty, undefined)).toBe(empty)
  })
})
