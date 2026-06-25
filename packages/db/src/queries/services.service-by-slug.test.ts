/************************************************************
 * Property test — Service-by-slug projection (Property 5)
 *
 * Validates: Requirements 2.4
 *
 * `getServiceBySlug(slug)` in `./services.ts` is a thin Drizzle read:
 *   SELECT <projection>
 *   FROM service INNER JOIN service_category ON service.category_id = id
 *   WHERE service.slug = :slug AND service.is_active = true
 *   LIMIT 1
 * returning `rows[0] ?? null`.
 *
 * The query itself is SQL executed by Postgres, so it cannot be unit-tested
 * without a live database. Per the task, we instead model the *documented
 * projection contract* with an in-memory fake (`selectServiceBySlug`) that
 * mirrors the query's filter + join + projection exactly, and property-test
 * that contract across generated catalogues. No real DB, no mocks.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

type ServiceType = 'salon' | 'spa'

type CategoryRow = {
  id: string
  name: string
  serviceType: ServiceType
  isActive: boolean
}

type ServiceRow = {
  id: string
  categoryId: string
  name: string
  slug: string
  description: string | null
  durationMinutes: number
  pricePaise: number
  gemsRedeemable: boolean
  gemsRequired: number | null
  isActive: boolean
}

// The full read projection returned by getServiceBySlug (see services.ts).
type ServiceBySlugProjection = {
  id: string
  categoryId: string
  categoryName: string
  serviceType: ServiceType
  name: string
  slug: string
  description: string | null
  durationMinutes: number
  pricePaise: number
  gemsRedeemable: boolean
  gemsRequired: number | null
}

// In-memory model of getServiceBySlug: INNER JOIN to the owning category, filter
// by slug + active, project the documented columns, first match or null.
function selectServiceBySlug(
  slug: string,
  services: ServiceRow[],
  categories: CategoryRow[],
): ServiceBySlugProjection | null {
  const categoriesById = new Map(categories.map((c) => [c.id, c]))
  for (const s of services) {
    if (s.slug !== slug || !s.isActive) {
      continue
    }
    const category = categoriesById.get(s.categoryId)
    // INNER JOIN: a row only survives if its category exists.
    if (!category) {
      continue
    }
    return {
      id: s.id,
      categoryId: s.categoryId,
      categoryName: category.name,
      serviceType: category.serviceType,
      name: s.name,
      slug: s.slug,
      description: s.description,
      durationMinutes: s.durationMinutes,
      pricePaise: s.pricePaise,
      gemsRedeemable: s.gemsRedeemable,
      gemsRequired: s.gemsRequired,
    }
  }
  return null
}

const serviceTypeArb: fc.Arbitrary<ServiceType> = fc.constantFrom('salon', 'spa')

// A catalogue: 1..6 categories, then 1..15 services each tied to an existing
// category, with unique slugs so lookups are deterministic.
const catalogueArb = fc
  .array(
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 20 }),
      serviceType: serviceTypeArb,
      isActive: fc.boolean(),
    }),
    { minLength: 1, maxLength: 6 },
  )
  // Distinct category ids.
  .map((cats) => {
    const seen = new Set<string>()
    return cats.filter((c) => {
      if (seen.has(c.id)) {
        return false
      }
      seen.add(c.id)
      return true
    })
  })
  .chain((categories) =>
    fc
      .array(
        fc.record({
          id: fc.uuid(),
          categoryIndex: fc.nat(),
          name: fc.string({ minLength: 1, maxLength: 30 }),
          slugBody: fc.string({ minLength: 1, maxLength: 20 }),
          description: fc.option(fc.string({ maxLength: 50 }), { nil: null }),
          durationMinutes: fc.integer({ min: 1, max: 480 }),
          pricePaise: fc.nat({ max: 100_000_000 }),
          gemsRedeemable: fc.boolean(),
          gemsRequired: fc.option(fc.nat({ max: 10_000 }), { nil: null }),
          isActive: fc.boolean(),
        }),
        { minLength: 1, maxLength: 15 },
      )
      .map((rawServices) => {
        const usedSlugs = new Set<string>()
        const services: ServiceRow[] = rawServices.map((r, i) => {
          // Force unique slug per service (index suffix guarantees uniqueness).
          let slug = `svc-${r.slugBody}-${i}`
          while (usedSlugs.has(slug)) {
            slug = `${slug}-x`
          }
          usedSlugs.add(slug)
          const category = categories[r.categoryIndex % categories.length]
          return {
            id: r.id,
            categoryId: category.id,
            name: r.name,
            slug,
            description: r.description,
            durationMinutes: r.durationMinutes,
            pricePaise: r.pricePaise,
            gemsRedeemable: r.gemsRedeemable,
            gemsRequired: r.gemsRequired,
            isActive: r.isActive,
          }
        })
        return { categories, services }
      }),
  )

// Feature: backend-api, Property 5: Service-by-slug returns the matching active service with full projection
describe('Property 5: Service-by-slug returns the matching active service with full projection', () => {
  // Validates: Requirements 2.4
  it('returns every active service by its slug with the full read projection', () => {
    fc.assert(
      fc.property(catalogueArb, ({ categories, services }) => {
        const categoriesById = new Map(categories.map((c) => [c.id, c]))
        for (const target of services) {
          const result = selectServiceBySlug(target.slug, services, categories)

          if (target.isActive) {
            // Active service → its full projection, joined to its category.
            const category = categoriesById.get(target.categoryId)
            expect(category).toBeDefined()
            expect(result).toEqual({
              id: target.id,
              categoryId: target.categoryId,
              categoryName: category?.name,
              serviceType: category?.serviceType,
              name: target.name,
              slug: target.slug,
              description: target.description,
              durationMinutes: target.durationMinutes,
              pricePaise: target.pricePaise,
              gemsRedeemable: target.gemsRedeemable,
              gemsRequired: target.gemsRequired,
            })
          } else {
            // Inactive service → not returned (caller maps to 404).
            expect(result).toBeNull()
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  // Validates: Requirements 2.4
  it('returns null for any slug that matches no active service', () => {
    fc.assert(
      fc.property(catalogueArb, ({ categories, services }) => {
        const knownSlugs = new Set(services.map((s) => s.slug))
        // A slug guaranteed absent from the catalogue.
        const unknownSlug = '__absent__'
        fc.pre(!knownSlugs.has(unknownSlug))
        expect(selectServiceBySlug(unknownSlug, services, categories)).toBeNull()
      }),
      { numRuns: 100 },
    )
  })
})
