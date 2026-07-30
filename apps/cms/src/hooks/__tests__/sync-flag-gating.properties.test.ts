/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-07-2026 & Updated - 30-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-flag-gating.properties.test
 * Scope        : Property-based test — SERVICE_SYNC_ENABLED gate
 *
 * Validates    : Requirements 3.12, 15.6
 *
 * Description  : fast-check + Vitest property tests for design Correctness
 *                Property 13 (Sync Flag Gating) across BOTH sync hooks and BOTH
 *                write operations. The gate is deliberately asymmetric: ONLY the
 *                literal string 'false' disables the sync, so an unset,
 *                mistyped, or differently-cased env var can never silently stop
 *                the booking catalogue from syncing.
 *
 * Responsibilities :
 * - Property 13: SERVICE_SYNC_ENABLED === 'false' → NO write to public.*
 * - Property 13: every other value, INCLUDING unset, executes the sync
 * - Property 13: a disabled sync never throws — the CMS write still succeeds
 * - Property 13: holds for service and service_category, on create and update
 *
 * Features / Functionality :
 * - The flag value is GENERATED (unset, casing variants, truthy/falsy lookalikes,
 *   and arbitrary strings) rather than sampled at three fixed values, so the
 *   "only the literal 'false' disables it" boundary is quantified
 * - `isSyncEnabled()` runs for real against a stubbed env var — the flag gate is
 *   exercised as it behaves in production, not through a stubbed boolean
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : CMS (Hooks — property test)
 *
 * Dependencies : fast-check, vitest, ../sync-service, ../sync-service-category,
 *                ../../lib/sync-db
 *
 * Notes        : Complements the example-based flag cases in sync-service.test.ts
 *                and sync-service-category.test.ts, which cover only 'false',
 *                unset and 'true'. The interesting failures live in between —
 *                'False', 'FALSE', '0', '' and 'no' must all keep syncing.
 ************************************************************/

import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { txDb } from '../../lib/sync-db'
import type { PayloadServiceCategoryDoc, PayloadServiceDoc } from '../mappers'
import { syncServiceToPublic } from '../sync-service'
import { syncServiceCategoryToPublic } from '../sync-service-category'
import { makeFakeTxDb } from './fake-tx-db'

// Keep the real table definitions and the REAL isSyncEnabled(); replace ONLY the
// transaction-handle resolver, the single seam that touches Postgres.
vi.mock('../../lib/sync-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sync-db')>()
  return { ...actual, txDb: vi.fn() }
})

type ServiceHookArgs = Parameters<typeof syncServiceToPublic>[0]
type CategoryHookArgs = Parameters<typeof syncServiceCategoryToPublic>[0]

const SERVICE_DOC: PayloadServiceDoc = {
  id: 'V1StGXR8Z5jdHi6BmyT_1',
  categoryId: 'p1StGXR8Z5jdHi6BmyT_9',
  name: 'Haircut',
  slug: 'haircut',
  durationMinutes: '30',
  pricePaise: 30_000,
  createdAt: '2026-06-01T10:00:00.000Z',
}

const CATEGORY_DOC: PayloadServiceCategoryDoc = {
  id: 'p1StGXR8Z5jdHi6BmyT_9',
  name: 'Hair Care',
  slug: 'hair-care',
  serviceType: 'salon',
  createdAt: '2026-06-01T10:00:00.000Z',
}

/**
 * Fresh double per generated case, so state never leaks between iterations.
 *
 * The `txDb` spy is RESET here, not only in `afterEach`: `afterEach` runs once
 * per test, whereas fast-check runs the body hundreds of times inside it, so
 * without this the "handle never resolved" assertion below would see every
 * previous iteration's calls.
 */
function freshDb() {
  const fake = makeFakeTxDb()
  vi.mocked(txDb).mockReset()
  vi.mocked(txDb).mockResolvedValue(fake.db as never)
  return fake
}

const COLLECTIONS = [
  {
    label: 'service',
    run: (operation: 'create' | 'update') =>
      syncServiceToPublic({
        doc: SERVICE_DOC,
        operation,
        req: {},
      } as unknown as ServiceHookArgs),
  },
  {
    label: 'service_category',
    run: (operation: 'create' | 'update') =>
      syncServiceCategoryToPublic({
        doc: CATEGORY_DOC,
        operation,
        req: {},
      } as unknown as CategoryHookArgs),
  },
] as const

/**
 * Every flag value that matters: unset, the one disabling literal, its casing
 * and truthiness lookalikes (all of which must still SYNC), plus arbitrary
 * strings so the boundary is not merely sampled at hand-picked values.
 */
const flagValueArb = fc.oneof(
  fc.constant<string | undefined>(undefined),
  fc.constantFrom<string | undefined>(
    'false',
    'False',
    'FALSE',
    ' false',
    'false ',
    'true',
    '0',
    '1',
    '',
    'no',
    'off',
    'disabled',
  ),
  fc.string({ maxLength: 12 }),
)

const collectionArb = fc.constantFrom(...COLLECTIONS)
const operationArb = fc.constantFrom<'create' | 'update'>('create', 'update')

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(txDb).mockReset()
})

describe('Property 13: Sync Flag Gating — Requirements 3.12, 15.6', () => {
  it("writes public.* for every flag value EXCEPT the literal 'false', and never throws", async () => {
    await fc.assert(
      fc.asyncProperty(
        collectionArb,
        operationArb,
        flagValueArb,
        async ({ run }, operation, flagValue) => {
          const fake = freshDb()
          // `undefined` deletes the variable, which is the unset case.
          vi.stubEnv('SERVICE_SYNC_ENABLED', flagValue)

          // A gated sync must NOT throw — the cms.* write has to survive it.
          await expect(run(operation)).resolves.toBeDefined()

          const shouldSync = flagValue !== 'false'
          const writes = fake.insert.mock.calls.length + fake.update.mock.calls.length

          if (shouldSync) {
            // Exactly one write, on the builder matching the operation.
            expect(writes).toBe(1)
            expect(fake.insert).toHaveBeenCalledTimes(operation === 'create' ? 1 : 0)
            expect(fake.update).toHaveBeenCalledTimes(operation === 'update' ? 1 : 0)
          } else {
            // No write at all, and the transaction handle is never even resolved.
            expect(writes).toBe(0)
            expect(fake.rows.size).toBe(0)
            expect(vi.mocked(txDb)).not.toHaveBeenCalled()
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
