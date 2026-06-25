/************************************************************
 * Property test — service catalogue query layer
 *
 * Feature      : backend-api
 * Property     : 4 — Catalogue returns exactly the active, ordered records
 * Validates    : Requirements 2.1, 2.2, 2.3
 *
 * Approach     : `getActiveCatalogue()` issues two Drizzle reads — active
 *                categories (ordered by displayOrder) and active services
 *                (ordered by displayOrder), then groups services under their
 *                parent category in JS. Faithfully replaying Drizzle's
 *                operator objects (eq/and/asc/innerJoin) in a fake is
 *                impractical, so we mock `../index` with a small in-memory
 *                `db` that stands in for the SQL contract: it applies the
 *                active-only filter and displayOrder ordering that the real
 *                WHERE/ORDER BY clauses would, returning the documented
 *                projection. The grouping/nesting + order-preservation logic
 *                under test (`getActiveCatalogue`) runs unmodified, and the
 *                assertions check the documented property directly rather than
 *                comparing against a mirror of the implementation.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

// ── Seeded dataset shared with the mocked db (set per fast-check run) ───────
type SeedCategory = {
  id: string
  name: string
  serviceType: 'salon' | 'spa'
  displayOrder: number
  isActive: boolean
}
type SeedService = {
  id: string
  categoryId: string
  name: string
  slug: string
  durationMinutes: number
  pricePaise: number
  gemsRedeemable: boolean
  gemsRequired: number | null
  displayOrder: number
  isActive: boolean
}

let seed: { categories: SeedCategory[]; services: SeedService[] } = {
  categories: [],
  services: [],
}

// A minimal thenable query builder that emulates exactly the two query shapes
// `getActiveCatalogue` builds. The categories query has no innerJoin; the
// services query does — that flag is enough to distinguish them.
function makeBuilder() {
  let joined = false
  const builder: Record<string, unknown> = {
    from: () => builder,
    innerJoin: () => {
      joined = true
      return builder
    },
    where: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    // biome-ignore lint/suspicious/noThenProperty: intentionally thenable to mimic Drizzle's awaitable query builder
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(compute()).then(resolve, reject),
  }

  function compute() {
    const catById = new Map(seed.categories.map((c) => [c.id, c]))
    if (!joined) {
      // Categories query: WHERE is_active = true ORDER BY display_order ASC
      return seed.categories
        .filter((c) => c.isActive)
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((c) => ({
          id: c.id,
          name: c.name,
          serviceType: c.serviceType,
          displayOrder: c.displayOrder,
        }))
    }
    // Services query: INNER JOIN category, WHERE service.is_active = true AND
    // category.is_active = true, ORDER BY service.display_order ASC
    return seed.services
      .filter((s) => s.isActive && catById.get(s.categoryId)?.isActive === true)
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((s) => {
        const cat = catById.get(s.categoryId)
        return {
          id: s.id,
          categoryId: s.categoryId,
          categoryName: cat?.name,
          serviceType: cat?.serviceType,
          name: s.name,
          slug: s.slug,
          durationMinutes: s.durationMinutes,
          pricePaise: s.pricePaise,
          gemsRedeemable: s.gemsRedeemable,
          gemsRequired: s.gemsRequired,
        }
      })
  }

  return builder
}

vi.mock('../index', () => ({
  db: { select: () => makeBuilder() },
}))

// Import after mock registration (vi.mock is hoisted, so this is safe).
const { getActiveCatalogue } = await import('./services')

// ── Generators ──────────────────────────────────────────────────────────────
// displayOrder kept in a small range so ties are common (exercises ordering).
const datasetArb = fc
  .array(
    fc.record({
      name: fc.string(),
      serviceType: fc.constantFrom<'salon' | 'spa'>('salon', 'spa'),
      displayOrder: fc.integer({ min: 0, max: 4 }),
      isActive: fc.boolean(),
    }),
    { maxLength: 6 },
  )
  .chain((cats) => {
    const categories: SeedCategory[] = cats.map((c, i) => ({ id: `cat-${i}`, ...c }))
    const catIds = categories.map((c) => c.id)
    const servicesArb =
      catIds.length === 0
        ? fc.constant<SeedService[]>([])
        : fc
            .array(
              fc.record({
                categoryId: fc.constantFrom(...catIds),
                name: fc.string(),
                slug: fc.string(),
                durationMinutes: fc.integer({ min: 5, max: 240 }),
                pricePaise: fc.nat(),
                gemsRedeemable: fc.boolean(),
                gemsRequired: fc.option(fc.nat(), { nil: null }),
                displayOrder: fc.integer({ min: 0, max: 4 }),
                isActive: fc.boolean(),
              }),
              { maxLength: 14 },
            )
            .map((svcs) => svcs.map((s, i) => ({ id: `svc-${i}`, ...s })))
    return servicesArb.map((services) => ({ categories, services }))
  })

const isNonDecreasing = (xs: number[]) => {
  for (let i = 1; i < xs.length; i++) {
    const prev = xs[i - 1]
    const cur = xs[i]
    if (prev !== undefined && cur !== undefined && prev > cur) {
      return false
    }
  }
  return true
}

// Feature: backend-api, Property 4: Catalogue returns exactly the active, ordered records
// Validates: Requirements 2.1, 2.2, 2.3
describe('getActiveCatalogue — Property 4: returns exactly the active, ordered records', () => {
  it('contains exactly active categories (each with exactly its active services), all ordered by displayOrder', async () => {
    await fc.assert(
      fc.asyncProperty(datasetArb, async (dataset) => {
        seed = dataset

        const result = await getActiveCatalogue()

        const catById = new Map(dataset.categories.map((c) => [c.id, c]))

        // (1) Exactly the active categories — no inactive, none missing, no dupes.
        const expectedActiveCatIds = new Set(
          dataset.categories.filter((c) => c.isActive).map((c) => c.id),
        )
        const resultCatIds = result.map((c) => c.id)
        expect(new Set(resultCatIds)).toEqual(expectedActiveCatIds)
        expect(resultCatIds.length).toBe(expectedActiveCatIds.size)

        // (3) Categories ordered by non-decreasing displayOrder.
        expect(isNonDecreasing(result.map((c) => c.displayOrder))).toBe(true)

        for (const cat of result) {
          // (2) Each category carries exactly its active services (parent is
          //     active by construction since the category is in the result).
          const expectedServiceIds = new Set(
            dataset.services.filter((s) => s.isActive && s.categoryId === cat.id).map((s) => s.id),
          )
          const gotServiceIds = cat.services.map((s) => s.id)
          expect(new Set(gotServiceIds)).toEqual(expectedServiceIds)
          expect(gotServiceIds.length).toBe(expectedServiceIds.size)

          // Every nested service truly belongs to this category.
          expect(cat.services.every((s) => s.categoryId === cat.id)).toBe(true)

          // (4) Services within a category ordered by non-decreasing displayOrder.
          const orders = cat.services.map(
            (s) => dataset.services.find((d) => d.id === s.id)?.displayOrder ?? 0,
          )
          expect(isNonDecreasing(orders)).toBe(true)

          // Projection carries the joined category name/type.
          for (const s of cat.services) {
            expect(s.categoryName).toBe(catById.get(cat.id)?.name)
          }
        }
      }),
      { numRuns: 200 },
    )
  })
})
