/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : mappers.test
 * Scope        : CMS Integration — Payload → Drizzle field mapping
 *
 * Validates    : Requirements 3.6, 3.7, 9.x, 10.x
 *
 * Description  : Unit tests for the pure mappers that translate a Payload
 *                document into the row written to `public.service` /
 *                `public.service_category` by the sync hooks.
 *
 * Responsibilities :
 * - Assert durationMinutes is coerced from Payload's select STRING to an integer
 * - Assert categoryId is normalised from BOTH relationship shapes
 * - Assert nullable coalescing (undefined → null) and field defaults
 * - Assert createdAt is preserved verbatim, never regenerated
 *
 * Features / Functionality :
 * - Covers every member of SERVICE_DURATION_MINUTES, derived from the constant
 *
 * Tech Stack   : TypeScript, Vitest
 * Layer        : CMS (Hooks — test)
 *
 * Dependencies : vitest, @rgss/types, ../mappers
 *
 * Notes        : Output keys are Drizzle FIELD names; Drizzle maps them to the
 *                snake_case columns (`durationMinutes` → `duration_minutes`) at
 *                query build time, so the mapper stays camelCase.
 ************************************************************/

import { SERVICE_DURATION_MINUTES } from '@rgss/types'
import { describe, expect, it } from 'vitest'
import {
  mapPayloadToPublicCategory,
  mapPayloadToPublicService,
  type PayloadServiceCategoryDoc,
  type PayloadServiceDoc,
} from '../mappers'

const CREATED_AT_ISO = '2026-06-01T10:00:00.000Z'

function serviceDoc(overrides: Partial<PayloadServiceDoc> = {}): PayloadServiceDoc {
  return {
    id: 'V1StGXR8Z5jdHi6BmyT_1',
    // Populated relationship — the shape Payload sends at depth ≥ 1.
    categoryId: { id: 'p1StGXR8Z5jdHi6BmyT_9' },
    name: 'Haircut',
    slug: 'haircut',
    description: 'A haircut',
    // Payload `select` values are ALWAYS strings.
    durationMinutes: '30',
    bufferMinutes: 5,
    pricePaise: 30_000,
    isActive: true,
    imageUrl: 'https://r2.theroyalglow.in/haircut.webp',
    displayOrder: 2,
    gemsRedeemable: true,
    gemsRequired: 40,
    gemsCatalogueOrder: 1,
    createdAt: CREATED_AT_ISO,
    ...overrides,
  }
}

function categoryDoc(
  overrides: Partial<PayloadServiceCategoryDoc> = {},
): PayloadServiceCategoryDoc {
  return {
    id: 'p1StGXR8Z5jdHi6BmyT_9',
    name: 'Hair & Beauty',
    slug: 'hair-beauty',
    description: 'Salon services',
    serviceType: 'salon',
    displayOrder: 1,
    isActive: true,
    createdAt: CREATED_AT_ISO,
    ...overrides,
  }
}

describe('mapPayloadToPublicService: field mapping', () => {
  it('maps a fully populated document 1:1', () => {
    expect(mapPayloadToPublicService(serviceDoc())).toEqual({
      id: 'V1StGXR8Z5jdHi6BmyT_1',
      categoryId: 'p1StGXR8Z5jdHi6BmyT_9',
      name: 'Haircut',
      slug: 'haircut',
      description: 'A haircut',
      durationMinutes: 30,
      bufferMinutes: 5,
      pricePaise: 30_000,
      isActive: true,
      imageUrl: 'https://r2.theroyalglow.in/haircut.webp',
      displayOrder: 2,
      gemsRedeemable: true,
      gemsRequired: 40,
      gemsCatalogueOrder: 1,
      createdAt: CREATED_AT_ISO,
    })
  })

  it('never emits an updatedAt — the sync hook owns that column', () => {
    expect(mapPayloadToPublicService(serviceDoc())).not.toHaveProperty('updatedAt')
  })

  it('coalesces every optional field to null and applies the defaults', () => {
    const sparse = mapPayloadToPublicService({
      id: 'V1StGXR8Z5jdHi6BmyT_1',
      categoryId: 'p1StGXR8Z5jdHi6BmyT_9',
      name: 'Beard Trim',
      slug: 'beard-trim',
      durationMinutes: '15',
      pricePaise: 15_000,
      createdAt: CREATED_AT_ISO,
    })

    // undefined → null, so Postgres receives real NULLs.
    expect(sparse.description).toBeNull()
    expect(sparse.imageUrl).toBeNull()
    expect(sparse.gemsRequired).toBeNull()
    expect(sparse.gemsCatalogueOrder).toBeNull()
    // Defaults.
    expect(sparse.bufferMinutes).toBe(0)
    expect(sparse.displayOrder).toBe(0)
    expect(sparse.isActive).toBe(true)
    expect(sparse.gemsRedeemable).toBe(false)
  })

  it('keeps an explicit false isActive instead of falling back to the default', () => {
    expect(mapPayloadToPublicService(serviceDoc({ isActive: false })).isActive).toBe(false)
  })

  it('preserves createdAt verbatim for both Date and ISO-string inputs', () => {
    const asDate = new Date(CREATED_AT_ISO)

    expect(mapPayloadToPublicService(serviceDoc({ createdAt: asDate })).createdAt).toBe(asDate)
    expect(mapPayloadToPublicService(serviceDoc()).createdAt).toBe(CREATED_AT_ISO)
  })
})

describe('mapPayloadToPublicService: durationMinutes coercion', () => {
  // Derived from the constant, never restated — the CMS select options are
  // built from the same source, so this cannot drift.
  it.each(SERVICE_DURATION_MINUTES.map((minutes) => ({ minutes })))(
    'coerces the select string "$minutes" to the integer $minutes',
    ({ minutes }) => {
      const row = mapPayloadToPublicService(serviceDoc({ durationMinutes: String(minutes) }))

      expect(row.durationMinutes).toBe(minutes)
      expect(typeof row.durationMinutes).toBe('number')
      expect(Number.isInteger(row.durationMinutes)).toBe(true)
      expect(Number.isNaN(row.durationMinutes)).toBe(false)
    },
  )

  it('passes a numeric durationMinutes through unchanged', () => {
    expect(mapPayloadToPublicService(serviceDoc({ durationMinutes: 90 })).durationMinutes).toBe(90)
  })
})

describe('mapPayloadToPublicService: categoryId normalisation', () => {
  it('extracts the id from a POPULATED relationship object (depth ≥ 1)', () => {
    const row = mapPayloadToPublicService(
      serviceDoc({ categoryId: { id: 'p1StGXR8Z5jdHi6BmyT_9' } }),
    )

    expect(row.categoryId).toBe('p1StGXR8Z5jdHi6BmyT_9')
  })

  it('passes a bare id string through unchanged (depth 0)', () => {
    const row = mapPayloadToPublicService(serviceDoc({ categoryId: 'p1StGXR8Z5jdHi6BmyT_9' }))

    expect(row.categoryId).toBe('p1StGXR8Z5jdHi6BmyT_9')
  })
})

describe('mapPayloadToPublicCategory', () => {
  it('maps a fully populated category document 1:1', () => {
    expect(mapPayloadToPublicCategory(categoryDoc())).toEqual({
      id: 'p1StGXR8Z5jdHi6BmyT_9',
      name: 'Hair & Beauty',
      slug: 'hair-beauty',
      description: 'Salon services',
      serviceType: 'salon',
      displayOrder: 1,
      isActive: true,
      createdAt: CREATED_AT_ISO,
    })
  })

  it('coalesces description to null and applies the displayOrder/isActive defaults', () => {
    const sparse = mapPayloadToPublicCategory({
      id: 'p1StGXR8Z5jdHi6BmyT_9',
      name: 'Spa',
      slug: 'spa',
      serviceType: 'spa',
      createdAt: CREATED_AT_ISO,
    })

    expect(sparse.description).toBeNull()
    expect(sparse.displayOrder).toBe(0)
    expect(sparse.isActive).toBe(true)
    expect(sparse.serviceType).toBe('spa')
  })

  it('preserves createdAt and emits no updatedAt', () => {
    const row = mapPayloadToPublicCategory(categoryDoc())

    expect(row.createdAt).toBe(CREATED_AT_ISO)
    expect(row).not.toHaveProperty('updatedAt')
  })
})
