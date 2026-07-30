/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-07-2026 & Updated - 30-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-idempotency.properties.test
 * Scope        : Property-based test — create-path sync idempotency
 *
 * Validates    : Requirements 3.11
 *
 * Description  : fast-check + Vitest property tests for design Correctness
 *                Property 12 (Sync Write Idempotency) across BOTH sync hooks.
 *                Applying the create path N times (N >= 1) with the same
 *                document id must converge on exactly ONE row rather than
 *                colliding on the primary key or the unique slug — the
 *                behaviour the seed script, hook retries and partially
 *                completed seeds all depend on.
 *
 * Responsibilities :
 * - Property 12: N create-path applications yield exactly one row for that id
 * - Property 12: every write goes through onConflictDoUpdate keyed on <table>.id,
 *   so a duplicate-key error is unreachable at the database
 * - Property 12: createdAt stays at the FIRST write while all mutable fields
 *   converge on the LATEST document
 * - Property 12: no application throws, for either collection
 *
 * Features / Functionality :
 * - N is generated (1..4) rather than fixed at 2, quantifying what the
 *   example-based "apply twice" cases in sync-service.test.ts /
 *   sync-service-category.test.ts only sample
 * - Each repeat carries DIFFERENT mutable field values and a different
 *   createdAt, so convergence and createdAt preservation are both observable
 *
 * Tech Stack   : Vitest + fast-check + Drizzle ORM
 * Layer        : CMS (Hooks — property test)
 *
 * Dependencies : fast-check, vitest, ../sync-service, ../sync-service-category,
 *                ../../lib/sync-db
 *
 * Notes        : Expected values are derived independently from the Requirement
 *                9.x field-mapping table, NOT by calling the mapper — asserting
 *                the mapper against itself would be vacuous.
 ************************************************************/

import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { service, serviceCategory, txDb } from '../../lib/sync-db'
import type { PayloadServiceCategoryDoc, PayloadServiceDoc } from '../mappers'
import { syncServiceToPublic } from '../sync-service'
import { syncServiceCategoryToPublic } from '../sync-service-category'
import { categoryDocArb, nanoidArb, serviceDocArb } from './arbitraries'
import { type FakeRow, makeFakeTxDb } from './fake-tx-db'

// Keep the real table definitions and the real isSyncEnabled(); replace ONLY the
// transaction-handle resolver, the single seam that touches Postgres.
vi.mock('../../lib/sync-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sync-db')>()
  return { ...actual, txDb: vi.fn() }
})

type ServiceHookArgs = Parameters<typeof syncServiceToPublic>[0]
type CategoryHookArgs = Parameters<typeof syncServiceCategoryToPublic>[0]

/** Fresh double per generated case, so state never leaks between iterations. */
function freshDb() {
  const fake = makeFakeTxDb()
  vi.mocked(txDb).mockResolvedValue(fake.db as never)
  return fake
}

function createService(doc: PayloadServiceDoc) {
  return syncServiceToPublic({ doc, operation: 'create', req: {} } as unknown as ServiceHookArgs)
}

function createCategory(doc: PayloadServiceCategoryDoc) {
  return syncServiceCategoryToPublic({
    doc,
    operation: 'create',
    req: {},
  } as unknown as CategoryHookArgs)
}

/** Mutable `public.service` columns per the Req 9.1-9.14 mapping table. */
function expectedMutableServiceFields(doc: PayloadServiceDoc) {
  const categoryId = typeof doc.categoryId === 'object' ? doc.categoryId?.id : doc.categoryId
  return {
    categoryId,
    name: doc.name,
    slug: doc.slug,
    description: doc.description ?? null,
    durationMinutes: Number(doc.durationMinutes),
    bufferMinutes: doc.bufferMinutes ?? 0,
    pricePaise: doc.pricePaise,
    isActive: doc.isActive ?? true,
    imageUrl: doc.imageUrl ?? null,
    displayOrder: doc.displayOrder ?? 0,
    gemsRedeemable: doc.gemsRedeemable ?? false,
    gemsRequired: doc.gemsRequired ?? null,
    gemsCatalogueOrder: doc.gemsCatalogueOrder ?? null,
  }
}

/** Mutable `public.service_category` columns per the same mapping table. */
function expectedMutableCategoryFields(doc: PayloadServiceCategoryDoc) {
  return {
    name: doc.name,
    slug: doc.slug,
    description: doc.description ?? null,
    serviceType: doc.serviceType,
    displayOrder: doc.displayOrder ?? 0,
    isActive: doc.isActive ?? true,
  }
}

/**
 * N documents (N >= 1) sharing ONE id, with independently generated mutable
 * fields and createdAt values — the shape a repeated create path really sees.
 */
function repeatedDocsArb<T>(docArb: (id: string) => fc.Arbitrary<T>) {
  return nanoidArb.chain((id) =>
    fc.record({
      id: fc.constant(id),
      docs: fc.array(docArb(id), { minLength: 1, maxLength: 4 }),
    }),
  )
}

beforeEach(() => {
  // The flag defaults to enabled; pin it so an ambient env var cannot mute the sync.
  vi.stubEnv('SERVICE_SYNC_ENABLED', 'true')
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(txDb).mockReset()
})

describe('Property 12: Sync Write Idempotency — service', () => {
  it('converges on ONE row for N create-path applications, keeping the first createdAt', async () => {
    await fc.assert(
      fc.asyncProperty(repeatedDocsArb(serviceDocArb), async ({ id, docs }) => {
        const fake = freshDb()

        // Every application must resolve — a primary-key or unique-constraint
        // error would surface here as a rejection.
        for (const doc of docs) {
          await createService(doc)
        }

        // Exactly one row, keyed on the id every document shared.
        expect(fake.rows.size).toBe(1)
        expect(fake.rows.has(id)).toBe(true)

        // The create path only — never a bare insert, never the update builder.
        expect(fake.insert).toHaveBeenCalledTimes(docs.length)
        expect(fake.onConflictDoUpdate).toHaveBeenCalledTimes(docs.length)
        expect(fake.update).not.toHaveBeenCalled()

        // Every write is an UPSERT keyed on service.id, which is what makes the
        // duplicate-key error unreachable rather than merely unobserved.
        for (const call of fake.onConflictDoUpdate.mock.calls) {
          const config = call[0] as { target: unknown; set: FakeRow }
          expect(config.target).toBe(service.id)
          expect(config.set).not.toHaveProperty('id')
          expect(config.set).not.toHaveProperty('createdAt')
        }

        const row = fake.rows.get(id) as FakeRow
        const latest = docs.at(-1) as PayloadServiceDoc
        const first = docs[0] as PayloadServiceDoc

        // Mutable fields reflect the LATEST document...
        expect(row).toMatchObject(expectedMutableServiceFields(latest))
        expect(row.id).toBe(id)
        // ...while createdAt is still the FIRST write's instant.
        expect(row.createdAt).toBeInstanceOf(Date)
        expect((row.createdAt as Date).getTime()).toBe(new Date(first.createdAt).getTime())
      }),
      { numRuns: 150 },
    )
  })
})

describe('Property 12: Sync Write Idempotency — service_category', () => {
  it('converges on ONE row for N create-path applications, keeping the first createdAt', async () => {
    await fc.assert(
      fc.asyncProperty(repeatedDocsArb(categoryDocArb), async ({ id, docs }) => {
        const fake = freshDb()

        for (const doc of docs) {
          await createCategory(doc)
        }

        expect(fake.rows.size).toBe(1)
        expect(fake.rows.has(id)).toBe(true)

        expect(fake.insert).toHaveBeenCalledTimes(docs.length)
        expect(fake.onConflictDoUpdate).toHaveBeenCalledTimes(docs.length)
        expect(fake.update).not.toHaveBeenCalled()

        for (const call of fake.onConflictDoUpdate.mock.calls) {
          const config = call[0] as { target: unknown; set: FakeRow }
          expect(config.target).toBe(serviceCategory.id)
          expect(config.set).not.toHaveProperty('id')
          expect(config.set).not.toHaveProperty('createdAt')
        }

        const row = fake.rows.get(id) as FakeRow
        const latest = docs.at(-1) as PayloadServiceCategoryDoc
        const first = docs[0] as PayloadServiceCategoryDoc

        expect(row).toMatchObject(expectedMutableCategoryFields(latest))
        expect(row.id).toBe(id)
        expect(row.createdAt).toBeInstanceOf(Date)
        expect((row.createdAt as Date).getTime()).toBe(new Date(first.createdAt).getTime())
      }),
      { numRuns: 150 },
    )
  })
})
