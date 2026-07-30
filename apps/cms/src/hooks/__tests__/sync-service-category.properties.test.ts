/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-07-2026 & Updated - 30-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-service-category.properties.test
 * Scope        : Property-based test — Category sync hook (cms → public)
 *
 * Validates    : Requirements 3.3, 3.4
 *
 * Description  : fast-check + Vitest property tests for
 *                `syncServiceCategoryToPublic`, covering design Correctness
 *                Property 8 (Category Create Sync Correctness) and Property 9
 *                (Category Update Sync Correctness). Complements the
 *                example-based cases in sync-service-category.test.ts by
 *                quantifying the same guarantees over ALL valid category docs.
 *
 * Responsibilities :
 * - Property 8: any created doc produces one public.service_category row with
 *   the same id and every field mapped per Requirement 10.x
 * - Property 8: the upsert set clause never contains `id` or `createdAt`
 * - Property 9: any updated doc targets EXACTLY that id, leaving other rows alone
 *
 * Features / Functionality :
 * - Generators cover both timestamp shapes and present / null / absent for
 *   every optional column, plus both serviceType enum members
 *
 * Tech Stack   : Vitest + fast-check + Drizzle ORM (PgDialect)
 * Layer        : CMS (Hooks — property test)
 *
 * Dependencies : fast-check, vitest, drizzle-orm, ../sync-service-category
 *
 * Notes        : Expected values are derived independently from the Requirement
 *                10.x field-mapping table, NOT by calling the mapper.
 ************************************************************/

import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serviceCategory, txDb } from '../../lib/sync-db'
import type { PayloadServiceCategoryDoc } from '../mappers'
import { syncServiceCategoryToPublic } from '../sync-service-category'
import { categoryDocArb, nanoidArb } from './arbitraries'
import { type FakeRow, makeFakeTxDb } from './fake-tx-db'

// Real table defs, real isSyncEnabled(); only the Postgres seam is doubled.
vi.mock('../../lib/sync-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sync-db')>()
  return { ...actual, txDb: vi.fn() }
})

const dialect = new PgDialect()

type HookArgs = Parameters<typeof syncServiceCategoryToPublic>[0]

/** Fresh double per generated case, so state never leaks between iterations. */
function freshDb() {
  const fake = makeFakeTxDb()
  vi.mocked(txDb).mockResolvedValue(fake.db as never)
  return fake
}

function runHook(doc: PayloadServiceCategoryDoc, operation: 'create' | 'update') {
  return syncServiceCategoryToPublic({ doc, operation, req: {} } as unknown as HookArgs)
}

/**
 * The expected `public.service_category` row, derived from the Requirement
 * 10.1-10.7 mapping table (null coalescing + displayOrder/isActive defaults)
 * rather than from the mapper itself.
 */
function expectedRow(doc: PayloadServiceCategoryDoc) {
  return {
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    description: doc.description ?? null,
    serviceType: doc.serviceType,
    displayOrder: doc.displayOrder ?? 0,
    isActive: doc.isActive ?? true,
  }
}

beforeEach(() => {
  vi.stubEnv('SERVICE_SYNC_ENABLED', 'true')
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(txDb).mockReset()
})

describe('Property 8: Category Create Sync Correctness', () => {
  it('writes ONE public.service_category row with the same id and every field mapped', async () => {
    await fc.assert(
      fc.asyncProperty(nanoidArb.chain(categoryDocArb), async (doc) => {
        const fake = freshDb()

        await runHook(doc, 'create')

        expect(fake.insert).toHaveBeenCalledTimes(1)
        expect(fake.insert).toHaveBeenCalledWith(serviceCategory)
        expect(fake.update).not.toHaveBeenCalled()

        expect(fake.rows.size).toBe(1)
        expect(fake.rows.has(doc.id)).toBe(true)

        const written = fake.values.mock.calls[0]?.[0] as FakeRow
        expect(written).toMatchObject(expectedRow(doc))
        // serviceType is a Postgres enum — only salon | spa may reach it.
        expect(['salon', 'spa']).toContain(written.serviceType)

        // Coerced to a real Date for timestamp({ mode: 'date' }), carrying the
        // instant Payload supplied (Property 10).
        expect(written.createdAt).toBeInstanceOf(Date)
        expect((written.createdAt as Date).getTime()).toBe(new Date(doc.createdAt).getTime())
      }),
    )
  })

  it('keys the upsert on serviceCategory.id and omits id and createdAt from the set clause', async () => {
    await fc.assert(
      fc.asyncProperty(nanoidArb.chain(categoryDocArb), async (doc) => {
        const fake = freshDb()

        await runHook(doc, 'create')

        const config = fake.onConflictDoUpdate.mock.calls[0]?.[0] as {
          target: unknown
          set: FakeRow
        }

        expect(config.target).toBe(serviceCategory.id)
        expect(config.set).not.toHaveProperty('id')
        expect(config.set).not.toHaveProperty('createdAt')
        const { id: _id, ...mutable } = expectedRow(doc)
        expect(config.set).toMatchObject(mutable)
      }),
    )
  })
})

describe('Property 9: Category Update Sync Correctness', () => {
  it('updates public.service_category WHERE id = the document id and touches no other row', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(nanoidArb, { minLength: 2, maxLength: 4 }).chain(([targetId, ...otherIds]) =>
          fc.record({
            doc: categoryDocArb(targetId as string),
            otherIds: fc.constant(otherIds),
          }),
        ),
        async ({ doc, otherIds }) => {
          const fake = freshDb()
          for (const id of otherIds) {
            fake.rows.set(id, { id, name: `untouched-${id}` })
          }

          await runHook(doc, 'update')

          expect(fake.update).toHaveBeenCalledTimes(1)
          expect(fake.update).toHaveBeenCalledWith(serviceCategory)
          expect(fake.insert).not.toHaveBeenCalled()

          const compiled = dialect.sqlToQuery(fake.where.mock.calls[0]?.[0] as SQL)
          expect(compiled.sql).toBe('"service_category"."id" = $1')
          expect(compiled.params).toEqual([doc.id])

          const patch = fake.set.mock.calls[0]?.[0] as FakeRow
          expect(patch).toMatchObject(expectedRow(doc))

          for (const id of otherIds) {
            expect(fake.rows.get(id)).toEqual({ id, name: `untouched-${id}` })
          }
        },
      ),
    )
  })
})
