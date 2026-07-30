/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : service-drift.test
 * Scope        : Business Logic — Background Jobs
 *
 * Description  : Unit tests for the pure service-catalogue drift differ used by
 *                the daily reconciliation job.
 *
 * Responsibilities :
 * - Assert a matching CMS/public state reports NO drift
 * - Assert missing, extra, changed and stale rows are each flagged
 * - Assert sub-tolerance timestamp differences are NOT flagged
 *
 * Features / Functionality :
 * - Covers both table pairs (service + service_category)
 *
 * Tech Stack   : TypeScript, Vitest
 * Layer        : Business Logic (test)
 *
 * Dependencies : vitest, ./service-drift
 *
 * Notes        : The precision case matters most — `cms.*` timestamps are
 *                timestamp(3) while `public.*` keeps microseconds, so a healthy
 *                pair legitimately differs by a fraction of a millisecond.
 ************************************************************/

import { describe, expect, it } from 'vitest'
import {
  buildServiceDriftReport,
  DRIFT_TIMESTAMP_TOLERANCE_MS,
  type DriftRow,
} from './service-drift'

const CREATED_AT = new Date('2026-07-01T10:00:00.000Z')
const UPDATED_AT = new Date('2026-07-20T12:30:45.123Z')

function categoryRow(overrides: Partial<DriftRow> = {}): DriftRow {
  return {
    id: 'cat_hair_00000000001',
    name: 'Hair',
    slug: 'hair',
    description: null,
    serviceType: 'salon',
    displayOrder: 1,
    isActive: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  } as DriftRow
}

function serviceRow(overrides: Partial<DriftRow> = {}): DriftRow {
  return {
    id: 'svc_haircut_000000001',
    categoryId: 'cat_hair_00000000001',
    name: 'Haircut',
    slug: 'haircut',
    description: null,
    durationMinutes: 30,
    bufferMinutes: 0,
    // Integer paise — ₹300.00.
    pricePaise: 30000,
    isActive: true,
    imageUrl: null,
    displayOrder: 0,
    gemsRedeemable: false,
    gemsRequired: null,
    gemsCatalogueOrder: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  } as DriftRow
}

function report(input: {
  cmsCategories?: DriftRow[]
  publicCategories?: DriftRow[]
  cmsServices?: DriftRow[]
  publicServices?: DriftRow[]
}) {
  return buildServiceDriftReport({
    categories: {
      cmsRows: input.cmsCategories ?? [categoryRow()],
      publicRows: input.publicCategories ?? [categoryRow()],
    },
    services: {
      cmsRows: input.cmsServices ?? [serviceRow()],
      publicRows: input.publicServices ?? [serviceRow()],
    },
  })
}

function tableOf(result: ReturnType<typeof buildServiceDriftReport>, table: string) {
  const found = result.tables.find((t) => t.table === table)
  if (!found) {
    throw new Error(`no report for table ${table}`)
  }
  return found
}

describe('buildServiceDriftReport: identical snapshots', () => {
  it('reports no drift when both sides match', () => {
    const result = report({})

    expect(result.hasDrift).toBe(false)
    expect(result.findingCount).toBe(0)
    for (const table of result.tables) {
      expect(table.findings).toEqual([])
      expect(table.cmsRowCount).toBe(table.publicRowCount)
    }
  })

  it('reports no drift for an empty catalogue on both sides', () => {
    const result = report({
      cmsCategories: [],
      publicCategories: [],
      cmsServices: [],
      publicServices: [],
    })

    expect(result.hasDrift).toBe(false)
    expect(result.findingCount).toBe(0)
  })
})

describe('buildServiceDriftReport: missing rows', () => {
  it('flags a CMS row with no public counterpart', () => {
    const result = report({ publicServices: [] })
    const services = tableOf(result, 'service')

    expect(result.hasDrift).toBe(true)
    expect(services.missingInPublic).toEqual(['svc_haircut_000000001'])
    expect(services.extraInPublic).toEqual([])
    expect(services.findings).toEqual([
      { table: 'service', kind: 'missing_in_public', id: 'svc_haircut_000000001' },
    ])
    // A missing row must not also be reported as a field mismatch.
    expect(services.changedRows).toEqual([])
    expect(services.staleRows).toEqual([])
    // The other table is unaffected.
    expect(tableOf(result, 'service_category').hasDrift).toBe(false)
  })
})

describe('buildServiceDriftReport: extra rows', () => {
  it('flags a public row absent from the CMS (direct DB insert)', () => {
    const rogue = serviceRow({ id: 'svc_rogue_0000000001', slug: 'rogue' })
    const result = report({ publicServices: [serviceRow(), rogue] })
    const services = tableOf(result, 'service')

    expect(result.hasDrift).toBe(true)
    expect(services.extraInPublic).toEqual(['svc_rogue_0000000001'])
    expect(services.missingInPublic).toEqual([])
    expect(services.publicRowCount).toBe(2)
    expect(services.cmsRowCount).toBe(1)
    expect(services.findings).toEqual([
      { table: 'service', kind: 'extra_in_public', id: 'svc_rogue_0000000001' },
    ])
  })
})

describe('buildServiceDriftReport: changed fields', () => {
  it('flags a price divergence with both values', () => {
    const result = report({ publicServices: [serviceRow({ pricePaise: 45000 })] })
    const services = tableOf(result, 'service')

    expect(result.hasDrift).toBe(true)
    expect(services.changedRows).toEqual(['svc_haircut_000000001'])
    expect(services.findings).toEqual([
      {
        table: 'service',
        kind: 'field_mismatch',
        id: 'svc_haircut_000000001',
        field: 'pricePaise',
        cmsValue: '30000',
        publicValue: '45000',
      },
    ])
  })

  it('flags a category-relation divergence (cms category_id_id → public category_id)', () => {
    const result = report({
      publicServices: [serviceRow({ categoryId: 'cat_spa_000000000001' })],
    })
    const services = tableOf(result, 'service')

    expect(services.findings.map((f) => f.field)).toEqual(['categoryId'])
  })

  it('flags a category-table field divergence', () => {
    const result = report({ publicCategories: [categoryRow({ isActive: false })] })
    const categories = tableOf(result, 'service_category')

    expect(categories.changedRows).toEqual(['cat_hair_00000000001'])
    expect(categories.findings).toEqual([
      {
        table: 'service_category',
        kind: 'field_mismatch',
        id: 'cat_hair_00000000001',
        field: 'isActive',
        cmsValue: 'true',
        publicValue: 'false',
      },
    ])
  })

  it('does not flag null vs undefined for an absent optional column', () => {
    const cms = serviceRow({ description: null })
    const pub = { ...serviceRow() } as Record<string, unknown>
    pub.description = undefined

    const result = report({ cmsServices: [cms], publicServices: [pub as DriftRow] })

    expect(tableOf(result, 'service').hasDrift).toBe(false)
  })
})

describe('buildServiceDriftReport: timestamp tolerance', () => {
  it('does NOT flag a precision-truncation difference (timestamp(3) vs microseconds)', () => {
    // cms.* is timestamp(3), public.* keeps microseconds: the same logical
    // instant can land a whole millisecond apart once truncated/rounded.
    const cms = serviceRow({ updatedAt: new Date('2026-07-20T12:30:45.123Z') })
    const pub = serviceRow({ updatedAt: new Date('2026-07-20T12:30:45.124Z') })

    const result = report({ cmsServices: [cms], publicServices: [pub] })

    expect(result.hasDrift).toBe(false)
    expect(tableOf(result, 'service').staleRows).toEqual([])
  })

  it('does NOT flag a difference exactly at the tolerance boundary', () => {
    const cms = serviceRow()
    const pub = serviceRow({
      updatedAt: new Date(UPDATED_AT.getTime() + DRIFT_TIMESTAMP_TOLERANCE_MS),
    })

    const result = report({ cmsServices: [cms], publicServices: [pub] })

    expect(result.hasDrift).toBe(false)
  })

  it('flags a stale public row when the timestamp gap exceeds the tolerance', () => {
    const cms = serviceRow({ updatedAt: new Date('2026-07-20T12:30:45.123Z') })
    const pub = serviceRow({ updatedAt: new Date('2026-07-18T09:00:00.000Z') })

    const result = report({ cmsServices: [cms], publicServices: [pub] })
    const services = tableOf(result, 'service')

    expect(result.hasDrift).toBe(true)
    expect(services.staleRows).toEqual(['svc_haircut_000000001'])
    expect(services.findings).toEqual([
      {
        table: 'service',
        kind: 'stale',
        id: 'svc_haircut_000000001',
        field: 'updatedAt',
        cmsValue: '2026-07-20T12:30:45.123Z',
        publicValue: '2026-07-18T09:00:00.000Z',
      },
    ])
  })

  it('compares ISO-string timestamps the same way as Date instances', () => {
    const cms = serviceRow({ updatedAt: UPDATED_AT.toISOString() })
    const result = report({ cmsServices: [cms] })

    expect(result.hasDrift).toBe(false)
  })
})
