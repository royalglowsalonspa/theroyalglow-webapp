import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import { getServiceDriftSnapshot } from './service-drift'
import { readServiceDriftSnapshot } from './service-drift-snapshot'

const { execute } = vi.hoisted(() => ({ execute: vi.fn<(query: SQL) => Promise<unknown>>() }))
vi.mock('../index', () => ({ db: { execute } }))

type FixtureRow = Record<string, unknown>

function catalogueReader(fixtures: Record<string, FixtureRow[]>) {
  return vi.fn(async (statement: string) => {
    const table = [...statement.matchAll(/^\s*FROM ([\w.]+) \w+$/gm)].at(-1)?.[1]
    const rows = table ? fixtures[table] : undefined
    if (!rows || !/^\s*SELECT\b/.test(statement)) {
      throw new Error('Expected a catalogue SELECT against a fixture table')
    }
    return rows
  })
}

const timestamp = '2026-11-26T09:30:00.000Z'
const category = {
  id: 'cat_hair',
  name: 'Hair care',
  slug: 'hair-care',
  service_type: 'salon',
  display_order: '1',
  is_active: 'true',
  sac_code: 999721,
  all_branches: 'f',
  branch_ids: 'branch_east,branch_south',
  created_at: timestamp,
  updated_at: timestamp,
}
const service = {
  id: 'svc_hair_spa',
  category_id: 'cat_hair',
  name: 'Hair spa',
  slug: 'hair-spa',
  description: 'Scalp and hair conditioning treatment',
  duration_minutes: '45',
  buffer_minutes: '0',
  price_paise: '125000',
  is_active: 't',
  image_url: '/hair-spa.webp',
  display_order: '2',
  gems_redeemable: false,
  gems_required: null,
  gems_catalogue_order: null,
  sac_code: '999721',
  all_branches: 'false',
  branch_ids: 'branch_east,branch_south',
  created_at: timestamp,
  updated_at: timestamp,
}
const offer = {
  id: 'cms_offer_1',
  name: 'Hair spa launch offer',
  description: 'Weekday appointment offer',
  rule_type: 'flat',
  offer_type: 'flat',
  discount_percentage: null,
  discount_amount_paise: '20000',
  combo_price_paise: null,
  start_date: '2026-12-01',
  end_date: '2026-12-31',
  is_active: 'true',
  terms: 'Weekdays only',
  display_order: '0',
  show_on_website: 't',
  service_ids: 'svc_hair_spa',
}

describe('service catalogue drift snapshot', () => {
  it('normalizes both catalogue schemas and separates offers without checkout rules', async () => {
    const createdAt = new Date(timestamp)
    const read = catalogueReader({
      'cms.service_category': [category],
      service_category: [
        { ...category, sac_code: '999721', display_order: 1, is_active: true, all_branches: false },
      ],
      'cms.service': [service],
      service: [
        {
          ...service,
          duration_minutes: 45,
          buffer_minutes: 0,
          price_paise: 125000,
          display_order: 2,
          created_at: createdAt,
          updated_at: createdAt,
        },
      ],
      'cms.offer': [offer, { id: 'cms_offer_2', rule_type: 'none' }],
      offer: [{ ...offer, discount_amount_paise: 20000, display_order: 0, show_on_website: true }],
    })
    const dialect = new PgDialect()
    execute.mockImplementation(async (query) => ({
      rows: await read(dialect.sqlToQuery(query).sql),
    }))

    const snapshot = await getServiceDriftSnapshot()

    expect(snapshot.categories.cmsRows).toEqual([
      {
        id: 'cat_hair',
        name: 'Hair care',
        slug: 'hair-care',
        description: null,
        serviceType: 'salon',
        displayOrder: 1,
        isActive: true,
        sacCode: '999721',
        allBranches: false,
        branchIds: 'branch_east,branch_south',
        createdAt,
        updatedAt: createdAt,
      },
    ])
    expect(snapshot.categories.publicRows).toEqual(snapshot.categories.cmsRows)
    expect(snapshot.services.cmsRows).toEqual([
      {
        id: 'svc_hair_spa',
        categoryId: 'cat_hair',
        name: 'Hair spa',
        slug: 'hair-spa',
        description: 'Scalp and hair conditioning treatment',
        durationMinutes: 45,
        bufferMinutes: 0,
        pricePaise: 125000,
        isActive: true,
        imageUrl: '/hair-spa.webp',
        displayOrder: 2,
        gemsRedeemable: false,
        gemsRequired: null,
        gemsCatalogueOrder: null,
        sacCode: '999721',
        allBranches: false,
        branchIds: 'branch_east,branch_south',
        createdAt,
        updatedAt: createdAt,
      },
    ])
    expect(snapshot.services.publicRows).toEqual(snapshot.services.cmsRows)
    expect(snapshot.offers.ruleRows).toEqual([
      {
        id: 'cms_offer_1',
        name: 'Hair spa launch offer',
        description: 'Weekday appointment offer',
        offerType: 'flat',
        discountPercentage: null,
        discountAmountPaise: 20000,
        comboPricePaise: null,
        startDate: '2026-12-01',
        endDate: '2026-12-31',
        isActive: true,
        terms: 'Weekdays only',
        displayOrder: 0,
        showOnWebsite: true,
        serviceIds: 'svc_hair_spa',
      },
    ])
    expect(snapshot.offers.publicRows).toEqual(snapshot.offers.ruleRows)
    expect(snapshot.offers.ruleFreeIds).toEqual(['cms_offer_2'])
    expect(read).toHaveBeenCalledTimes(6)
  })

  it('normalizes absent and invalid optional wire values to null', async () => {
    const read = catalogueReader({
      'cms.service_category': [],
      service_category: [],
      'cms.service': [
        { id: 42, price_paise: 'invalid', created_at: 'invalid', all_branches: true },
      ],
      service: [],
      'cms.offer': [],
      offer: [],
    })

    const snapshot = await readServiceDriftSnapshot(read)

    expect(snapshot.categories).toEqual({ cmsRows: [], publicRows: [] })
    expect(snapshot.services).toMatchObject({
      cmsRows: [
        {
          id: '42',
          name: null,
          pricePaise: null,
          isActive: null,
          allBranches: true,
          branchIds: null,
          createdAt: null,
          updatedAt: null,
        },
      ],
      publicRows: [],
    })
    expect(snapshot.offers).toEqual({ ruleRows: [], ruleFreeIds: [], publicRows: [] })
  })

  it('rejects the snapshot if a read fails', async () => {
    const failure = new Error('CMS catalogue read failed')
    const read = vi.fn(async (statement: string) => {
      if (statement.includes('FROM cms.service s')) throw failure
      return []
    })

    await expect(readServiceDriftSnapshot(read)).rejects.toBe(failure)
  })
})
