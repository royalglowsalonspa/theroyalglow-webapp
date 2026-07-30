/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-07-2026 & Updated - 30-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-timestamps.properties.test
 * Scope        : Property-based test — sync timestamp handling (createdAt/updatedAt)
 *
 * Validates    : Requirements 3.7, 3.8
 *
 * Description  : fast-check + Vitest property tests for design Correctness
 *                Property 11 (UpdatedAt Correctness) across BOTH sync hooks,
 *                with Property 10 (CreatedAt Preservation) quantified over the
 *                same generated documents. Complements the example-based
 *                timestamp cases in sync-service.test.ts /
 *                sync-service-category.test.ts.
 *
 * Responsibilities :
 * - Property 11: on the UPDATE path, updatedAt is stamped inside the call window
 * - Property 11: on the conflict (re-create) path, updatedAt is re-stamped
 * - Property 10: createdAt is preserved verbatim, and never re-stamped on conflict
 * - Document the designed create-path behaviour: the INSERT payload carries NO
 *   updatedAt, so a brand-new public.* row takes the column default now()
 *
 * Features / Functionality :
 * - Both collections, both timestamp shapes (Date and ISO string)
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : CMS (Hooks — property test)
 *
 * Dependencies : fast-check, vitest, ../sync-service, ../sync-service-category
 *
 * Notes        : KNOWN, DESIGNED ASYMMETRY — the mappers deliberately omit
 *                `updatedAt`, so on a FRESH create `public.*.updated_at` comes
 *                from the column default while `cms.*.updated_at` keeps
 *                Payload's own value; the two can therefore differ after a
 *                CMS-originated create (recorded as Caveat 1 on Task 5.0).
 *                Property 11 is scoped to UPDATES, so this is not a violation —
 *                the property below asserts the real behaviour rather than an
 *                idealised one.
 ************************************************************/

import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { txDb } from '../../lib/sync-db'
import type { PayloadServiceCategoryDoc, PayloadServiceDoc } from '../mappers'
import { syncServiceToPublic } from '../sync-service'
import { syncServiceCategoryToPublic } from '../sync-service-category'
import { categoryDocArb, nanoidArb, serviceDocArb } from './arbitraries'
import { type FakeRow, makeFakeTxDb } from './fake-tx-db'

vi.mock('../../lib/sync-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sync-db')>()
  return { ...actual, txDb: vi.fn() }
})

/** Requirement 3.8 / Property 11 tolerance: updatedAt is "current time" within 2s. */
const UPDATED_AT_TOLERANCE_MS = 2000

type ServiceHookArgs = Parameters<typeof syncServiceToPublic>[0]
type CategoryHookArgs = Parameters<typeof syncServiceCategoryToPublic>[0]

function freshDb() {
  const fake = makeFakeTxDb()
  vi.mocked(txDb).mockResolvedValue(fake.db as never)
  return fake
}

function runService(doc: PayloadServiceDoc, operation: 'create' | 'update') {
  return syncServiceToPublic({ doc, operation, req: {} } as unknown as ServiceHookArgs)
}

function runCategory(doc: PayloadServiceCategoryDoc, operation: 'create' | 'update') {
  return syncServiceCategoryToPublic({ doc, operation, req: {} } as unknown as CategoryHookArgs)
}

/** updatedAt is a real Date, inside the call window, and within the 2s tolerance. */
function expectStampedInWindow(value: unknown, before: number, after: number) {
  expect(value).toBeInstanceOf(Date)
  const stamped = (value as Date).getTime()
  expect(stamped).toBeGreaterThanOrEqual(before)
  expect(stamped).toBeLessThanOrEqual(after)
  expect(Math.abs(stamped - after)).toBeLessThanOrEqual(UPDATED_AT_TOLERANCE_MS)
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

describe('Property 11: UpdatedAt Correctness — update path', () => {
  it('stamps service.updatedAt at sync time while preserving createdAt', async () => {
    await fc.assert(
      fc.asyncProperty(nanoidArb.chain(serviceDocArb), async (doc) => {
        const fake = freshDb()

        const before = Date.now()
        await runService(doc, 'update')
        const after = Date.now()

        const patch = fake.set.mock.calls[0]?.[0] as FakeRow
        expectStampedInWindow(patch.updatedAt, before, after)
        // Property 10: the instant Payload supplied survives the sync untouched.
        expect((patch.createdAt as Date).getTime()).toBe(new Date(doc.createdAt).getTime())
      }),
    )
  })

  it('stamps service_category.updatedAt at sync time while preserving createdAt', async () => {
    await fc.assert(
      fc.asyncProperty(nanoidArb.chain(categoryDocArb), async (doc) => {
        const fake = freshDb()

        const before = Date.now()
        await runCategory(doc, 'update')
        const after = Date.now()

        const patch = fake.set.mock.calls[0]?.[0] as FakeRow
        expectStampedInWindow(patch.updatedAt, before, after)
        expect((patch.createdAt as Date).getTime()).toBe(new Date(doc.createdAt).getTime())
      }),
    )
  })
})

describe('Property 11: UpdatedAt Correctness — conflict (re-create) path', () => {
  it('re-stamps updatedAt on an existing row and keeps the FIRST createdAt', async () => {
    await fc.assert(
      fc.asyncProperty(
        nanoidArb.chain((id) => fc.record({ first: serviceDocArb(id), second: serviceDocArb(id) })),
        async ({ first, second }) => {
          const fake = freshDb()

          await runService(first, 'create')

          const before = Date.now()
          await runService(second, 'create')
          const after = Date.now()

          // The upsert converged: one row, no duplicate-key error.
          expect(fake.rows.size).toBe(1)
          const row = fake.rows.get(first.id) as FakeRow

          expectStampedInWindow(row.updatedAt, before, after)
          // createdAt is excluded from the set clause, so it stays at the FIRST
          // write even when the second document carries a different timestamp.
          expect((row.createdAt as Date).getTime()).toBe(new Date(first.createdAt).getTime())
        },
      ),
    )
  })

  it('re-stamps category updatedAt on an existing row and keeps the FIRST createdAt', async () => {
    await fc.assert(
      fc.asyncProperty(
        nanoidArb.chain((id) =>
          fc.record({ first: categoryDocArb(id), second: categoryDocArb(id) }),
        ),
        async ({ first, second }) => {
          const fake = freshDb()

          await runCategory(first, 'create')

          const before = Date.now()
          await runCategory(second, 'create')
          const after = Date.now()

          expect(fake.rows.size).toBe(1)
          const row = fake.rows.get(first.id) as FakeRow

          expectStampedInWindow(row.updatedAt, before, after)
          expect((row.createdAt as Date).getTime()).toBe(new Date(first.createdAt).getTime())
        },
      ),
    )
  })
})

describe('Property 11: designed create-path asymmetry (Task 5.0 Caveat 1)', () => {
  // The mappers deliberately omit `updatedAt`, so a BRAND-NEW public.* row takes
  // the column default now() rather than Payload's updatedAt. This is asserted
  // here as the REAL behaviour: Property 11 is scoped to updates, so a fresh
  // insert leaving updated_at to the database is in scope for neither Property 10
  // (createdAt only) nor Property 11 — but the divergence between cms.updated_at
  // and public.updated_at after a CMS-originated create is real and recorded.
  it('never sends updatedAt in the INSERT payload for either collection', async () => {
    await fc.assert(
      fc.asyncProperty(
        nanoidArb.chain((id) => fc.record({ svc: serviceDocArb(id), cat: categoryDocArb(id) })),
        async ({ svc, cat }) => {
          const serviceDb = freshDb()
          await runService(svc, 'create')
          expect(serviceDb.values.mock.calls[0]?.[0]).not.toHaveProperty('updatedAt')

          const categoryDb = freshDb()
          await runCategory(cat, 'create')
          expect(categoryDb.values.mock.calls[0]?.[0]).not.toHaveProperty('updatedAt')
        },
      ),
    )
  })
})
