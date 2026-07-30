/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-07-2026 & Updated - 30-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-service.properties.test
 * Scope        : Property-based test — Service sync hook (cms → public)
 *
 * Validates    : Requirements 3.1, 3.2
 *
 * Description  : fast-check + Vitest property tests for `syncServiceToPublic`,
 *                covering design Correctness Property 6 (Service Create Sync
 *                Correctness) and Property 7 (Service Update Sync Correctness).
 *                Complements the example-based cases in sync-service.test.ts by
 *                quantifying the same guarantees over ALL valid Payload docs.
 *
 * Responsibilities :
 * - Property 6: any created doc produces one public.service row with the same
 *   id and every field mapped per Requirement 9.x
 * - Property 6: the upsert set clause never contains `id` or `createdAt`
 * - Property 7: any updated doc targets EXACTLY that id, leaving other rows alone
 *
 * Features / Functionality :
 * - Generators cover both relationship shapes, both timestamp shapes, and
 *   present / null / absent for every optional column
 *
 * Tech Stack   : Vitest + fast-check + Drizzle ORM (PgDialect)
 * Layer        : CMS (Hooks — property test)
 *
 * Dependencies : fast-check, vitest, drizzle-orm, ../sync-service, ../../lib/sync-db
 *
 * Notes        : Expected values are derived independently from the Requirement
 *                9.x field-mapping table, NOT by calling the mapper — asserting
 *                the mapper against itself would be vacuous.
 ************************************************************/

import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { service, txDb } from '../../lib/sync-db'
import type { PayloadServiceDoc } from '../mappers'
import { syncServiceToPublic } from '../sync-service'
import { nanoidArb, serviceDocArb } from './arbitraries'
import { type FakeRow, makeFakeTxDb } from './fake-tx-db'

// Keep the real table definitions and the real isSyncEnabled(); replace ONLY the
// transaction-handle resolver, the single seam that touches Postgres.
vi.mock('../../lib/sync-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sync-db')>()
  return { ...actual, txDb: vi.fn() }
})

const dialect = new PgDialect()

type HookArgs = Parameters<typeof syncServiceToPublic>[0]

/** Fresh double per generated case, so state never leaks between iterations. */
function freshDb() {
  const fake = makeFakeTxDb()
  vi.mocked(txDb).mockResolvedValue(fake.db as never)
  return fake
}

function runHook(doc: PayloadServiceDoc, operation: 'create' | 'update') {
  return syncServiceToPublic({ doc, operation, req: {} } as unknown as HookArgs)
}

/**
 * The expected `public.service` row for a Payload doc, derived from the
 * Requirement 9.1-9.14 mapping table (defaults, null coalescing, relationship
 * normalisation, select→integer coercion) — deliberately NOT from the mapper.
 */
function expectedRow(doc: PayloadServiceDoc) {
  const categoryId = typeof doc.categoryId === 'object' ? doc.categoryId?.id : doc.categoryId
  return {
    id: doc.id,
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

describe('Property 6: Service Create Sync Correctness', () => {
  it('writes ONE public.service row with the same id and every field mapped faithfully', async () => {
    await fc.assert(
      fc.asyncProperty(nanoidArb.chain(serviceDocArb), async (doc) => {
        const fake = freshDb()

        await runHook(doc, 'create')

        // Insert on the service table, never the update path.
        expect(fake.insert).toHaveBeenCalledTimes(1)
        expect(fake.insert).toHaveBeenCalledWith(service)
        expect(fake.update).not.toHaveBeenCalled()

        // Exactly one row, keyed on the SAME id the CMS used.
        expect(fake.rows.size).toBe(1)
        expect(fake.rows.has(doc.id)).toBe(true)

        const written = fake.values.mock.calls[0]?.[0] as FakeRow
        expect(written).toMatchObject(expectedRow(doc))

        // durationMinutes must be a real integer, never NaN, never a string.
        expect(Number.isInteger(written.durationMinutes)).toBe(true)
        expect(Number.isNaN(written.durationMinutes)).toBe(false)

        // Drizzle's column is timestamp({ mode: 'date' }) — a real Date is required,
        // carrying the instant Payload supplied (Property 10).
        expect(written.createdAt).toBeInstanceOf(Date)
        expect((written.createdAt as Date).getTime()).toBe(new Date(doc.createdAt).getTime())
      }),
    )
  })

  it('keys the upsert on service.id and never lists id or createdAt in the set clause', async () => {
    await fc.assert(
      fc.asyncProperty(nanoidArb.chain(serviceDocArb), async (doc) => {
        const fake = freshDb()

        await runHook(doc, 'create')

        const config = fake.onConflictDoUpdate.mock.calls[0]?.[0] as {
          target: unknown
          set: FakeRow
        }

        expect(config.target).toBe(service.id)
        // Excluded so an existing row keeps its ORIGINAL creation timestamp
        // while every mutable field converges (Property 10 / Property 12).
        expect(config.set).not.toHaveProperty('id')
        expect(config.set).not.toHaveProperty('createdAt')
        // ...and every mutable field IS present.
        const { id: _id, ...mutable } = expectedRow(doc)
        expect(config.set).toMatchObject(mutable)
      }),
    )
  })
})

describe('Property 7: Service Update Sync Correctness', () => {
  it('updates public.service WHERE id = the document id and touches no other row', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Distinct ids: the first is the target, the rest are decoy rows that
        // must survive the update untouched.
        fc.uniqueArray(nanoidArb, { minLength: 2, maxLength: 4 }).chain(([targetId, ...otherIds]) =>
          fc.record({
            doc: serviceDocArb(targetId as string),
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
          expect(fake.update).toHaveBeenCalledWith(service)
          expect(fake.insert).not.toHaveBeenCalled()

          // The WHERE clause is compiled to SQL rather than trusted by shape:
          // it must bind exactly this id, so no other row can be reached.
          const compiled = dialect.sqlToQuery(fake.where.mock.calls[0]?.[0] as SQL)
          expect(compiled.sql).toBe('"service"."id" = $1')
          expect(compiled.params).toEqual([doc.id])

          // The patch carries the updated field values.
          const patch = fake.set.mock.calls[0]?.[0] as FakeRow
          expect(patch).toMatchObject(expectedRow(doc))

          // Every decoy row is byte-for-byte as it was.
          for (const id of otherIds) {
            expect(fake.rows.get(id)).toEqual({ id, name: `untouched-${id}` })
          }
        },
      ),
    )
  })
})
