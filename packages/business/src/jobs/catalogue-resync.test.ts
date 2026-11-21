/************************************************************
 * Module Name  : catalogue-resync.test
 * Scope        : Unit test — Developer catalogue resync helpers
 *                (multi-branch R4.7, catalogue-resync.md)
 *
 * Description  : The drift report grouped by record (missing, extra or
 *                different, with the CMS revision and whether a resync can
 *                repair it), names, the processing order and what a repair
 *                leaves.
 ************************************************************/

import type { CatalogueResyncRecord } from '@rgss/types'
import { describe, expect, it } from 'vitest'
import {
  type ByRecord,
  groupDriftFindings,
  orderForResync,
  recordNames,
  remainingDifferences,
} from './catalogue-resync'
import { withOfferDrift } from './offer-drift'
import { buildServiceDriftReport, type DriftRow } from './service-drift'

const AT = new Date('2026-11-21T06:00:00.000Z')

function category(overrides: Partial<Record<string, unknown>> = {}): DriftRow {
  return {
    id: 'cat_hair',
    name: 'Hair',
    slug: 'hair',
    description: null,
    serviceType: 'salon',
    displayOrder: 0,
    isActive: true,
    sacCode: '999721',
    allBranches: true,
    branchIds: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  } as DriftRow
}

function service(overrides: Partial<Record<string, unknown>> = {}): DriftRow {
  return {
    id: 'svc_cut',
    categoryId: 'cat_hair',
    name: 'Haircut',
    slug: 'haircut',
    description: null,
    durationMinutes: 30,
    bufferMinutes: 0,
    pricePaise: 50_000,
    isActive: true,
    imageUrl: null,
    displayOrder: 0,
    gemsRedeemable: false,
    gemsRequired: null,
    gemsCatalogueOrder: null,
    sacCode: null,
    allBranches: true,
    branchIds: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  } as DriftRow
}

function offer(overrides: Partial<Record<string, unknown>> = {}): DriftRow {
  return {
    id: 'cms_offer_7',
    name: '₹200 off',
    description: null,
    offerType: 'flat',
    discountPercentage: null,
    discountAmountPaise: 20_000,
    comboPricePaise: null,
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    isActive: true,
    terms: null,
    displayOrder: 0,
    showOnWebsite: true,
    serviceIds: 'svc_cut',
    ...overrides,
  } as DriftRow
}

const REVISIONS: ByRecord = {
  service_category: { cat_hair: '2026-11-21T06:00:00.000Z', cat_new: '2026-11-21T07:00:00.000Z' },
  service: { svc_cut: '2026-11-21T06:30:00.000Z' },
  offer: { cms_offer_7: '2026-11-21T08:00:00.000Z', cms_offer_8: '2026-11-21T08:30:00.000Z' },
}

function report() {
  return withOfferDrift(
    buildServiceDriftReport({
      // A new category never mirrored, and a mirror with no CMS row.
      categories: {
        cmsRows: [category(), category({ id: 'cat_new', name: 'Nails', slug: 'nails' })],
        publicRows: [category(), category({ id: 'cat_gone', name: 'Old', slug: 'old' })],
      },
      // A price edited straight in the mirror.
      services: { cmsRows: [service()], publicRows: [service({ pricePaise: 45_000 })] },
    }),
    // A rule whose mirror lost its service, and a rule-free offer still live.
    {
      ruleRows: [offer()],
      ruleFreeIds: ['cms_offer_8'],
      publicRows: [offer({ serviceIds: null }), offer({ id: 'cms_offer_8', name: 'Old rule' })],
    },
  )
}

describe('groupDriftFindings', () => {
  it('lists each drifted record once, categories, then services, then offers', () => {
    const records = groupDriftFindings(report(), {
      revisions: REVISIONS,
      names: {
        service_category: { cat_new: 'Nails', cat_gone: 'Old' },
        service: { svc_cut: 'Haircut' },
        offer: { cms_offer_7: '₹200 off', cms_offer_8: 'Old rule' },
      },
    })

    expect(records).toEqual([
      {
        table: 'service_category',
        id: 'cat_gone',
        name: 'Old',
        kind: 'extra',
        differences: [],
        cmsUpdatedAt: null,
        repairable: false,
      },
      {
        table: 'service_category',
        id: 'cat_new',
        name: 'Nails',
        kind: 'missing',
        differences: [],
        cmsUpdatedAt: '2026-11-21T07:00:00.000Z',
        repairable: true,
      },
      {
        table: 'service',
        id: 'svc_cut',
        name: 'Haircut',
        kind: 'different',
        differences: [{ field: 'pricePaise', cmsValue: '50000', publicValue: '45000' }],
        cmsUpdatedAt: '2026-11-21T06:30:00.000Z',
        repairable: true,
      },
      {
        table: 'offer',
        id: 'cms_offer_7',
        name: '₹200 off',
        kind: 'different',
        differences: [{ field: 'serviceIds', cmsValue: 'svc_cut', publicValue: null }],
        cmsUpdatedAt: '2026-11-21T08:00:00.000Z',
        repairable: true,
      },
      {
        table: 'offer',
        id: 'cms_offer_8',
        name: 'Old rule',
        kind: 'different',
        differences: [{ field: 'isActive', cmsValue: 'false', publicValue: 'true' }],
        cmsUpdatedAt: '2026-11-21T08:30:00.000Z',
        repairable: true,
      },
    ])
  })

  it('does not offer a repair without the CMS revision', () => {
    const records = groupDriftFindings(report(), {
      revisions: { service_category: {}, service: {}, offer: {} },
      names: { service_category: {}, service: {}, offer: {} },
    })
    expect(records.every((record) => !record.repairable)).toBe(true)
    expect(records.map((record) => record.name)).toEqual([null, null, null, null, null])
  })

  it('is empty when nothing drifted', () => {
    const clean = buildServiceDriftReport({
      categories: { cmsRows: [category()], publicRows: [category()] },
      services: { cmsRows: [service()], publicRows: [service()] },
    })
    expect(groupDriftFindings(clean, { revisions: REVISIONS, names: REVISIONS })).toEqual([])
  })
})

describe('recordNames', () => {
  it('takes the CMS row’s name over its mirror’s, and a mirror’s alone', () => {
    expect(
      recordNames({
        service_category: { cms: [category()], mirror: [category({ name: 'Hair (old)' })] },
        service: { cms: [], mirror: [service({ id: 'svc_extra', name: 'Extra' })] },
        offer: { cms: [offer({ name: '' })], mirror: [offer({ name: 'Mirror name' })] },
      }),
    ).toEqual({
      service_category: { cat_hair: 'Hair' },
      service: { svc_extra: 'Extra' },
      offer: { cms_offer_7: 'Mirror name' },
    })
  })
})

describe('orderForResync', () => {
  it('names each record once, the last revision winning, categories first', () => {
    const records: CatalogueResyncRecord[] = [
      { table: 'offer', id: 'cms_offer_7', cmsUpdatedAt: '2026-11-21T08:00:00.000Z' },
      { table: 'service', id: 'svc_cut', cmsUpdatedAt: '2026-11-21T06:00:00.000Z' },
      { table: 'service_category', id: 'cat_new', cmsUpdatedAt: '2026-11-21T07:00:00.000Z' },
      { table: 'service', id: 'svc_cut', cmsUpdatedAt: '2026-11-21T06:30:00.000Z' },
      { table: 'service', id: 'svc_a', cmsUpdatedAt: '2026-11-21T06:00:00.000Z' },
    ]
    expect(orderForResync(records)).toEqual([
      { table: 'service_category', id: 'cat_new', cmsUpdatedAt: '2026-11-21T07:00:00.000Z' },
      { table: 'service', id: 'svc_a', cmsUpdatedAt: '2026-11-21T06:00:00.000Z' },
      { table: 'service', id: 'svc_cut', cmsUpdatedAt: '2026-11-21T06:30:00.000Z' },
      { table: 'offer', id: 'cms_offer_7', cmsUpdatedAt: '2026-11-21T08:00:00.000Z' },
    ])
  })
})

describe('remainingDifferences', () => {
  it('says what a record still differs in, or nothing once in sync', () => {
    const after = report()
    expect(remainingDifferences(after, 'service', 'svc_cut')).toEqual({
      kind: 'different',
      differences: [{ field: 'pricePaise', cmsValue: '50000', publicValue: '45000' }],
    })
    expect(remainingDifferences(after, 'service_category', 'cat_new')).toEqual({
      kind: 'missing',
      differences: [],
    })
    expect(remainingDifferences(after, 'service_category', 'cat_hair')).toEqual({
      kind: null,
      differences: [],
    })
  })
})
