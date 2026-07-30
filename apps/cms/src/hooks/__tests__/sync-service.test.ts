/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-service.test
 * Scope        : CMS Integration — Service Sync hook
 *
 * Validates    : Requirements 3.7, 3.8, 3.11, 3.12, 5.7, 12.1, 12.7
 *
 * Description  : Unit tests for `syncServiceToPublic`, the Payload afterChange
 *                hook that mirrors `cms.service` into `public.service`. The
 *                transaction handle returned by `txDb(req)` is replaced with an
 *                in-memory double — these tests never touch a database.
 *
 * Responsibilities :
 * - Assert the create path UPSERTs (onConflictDoUpdate) and is idempotent
 * - Assert the update path targets the row by id
 * - Assert createdAt is preserved and updatedAt is stamped at sync time
 * - Assert SERVICE_SYNC_ENABLED=false short-circuits with NO write and no throw
 * - Assert a failed write is logged at error level AND re-thrown (rollback)
 *
 * Features / Functionality :
 * - Duration coercion covered for every member of SERVICE_DURATION_MINUTES
 * - The `where` clause is compiled with Drizzle's PgDialect and asserted on SQL
 *
 * Tech Stack   : TypeScript, Vitest, Drizzle ORM
 * Layer        : CMS (Hooks — test)
 *
 * Dependencies : vitest, drizzle-orm, @rgss/types, ../sync-service, ../../lib/sync-db
 *
 * Notes        : Only `txDb` is mocked. `isSyncEnabled()` runs for real against a
 *                stubbed env var, so the flag gate is tested as it behaves in
 *                production rather than through a stubbed boolean.
 ************************************************************/

import { SERVICE_DURATION_MINUTES } from '@rgss/types'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { service, txDb } from '../../lib/sync-db'
import type { PayloadServiceDoc } from '../mappers'
import { syncServiceToPublic } from '../sync-service'
import { type FakeRow, makeFakeTxDb } from './fake-tx-db'

// Keep the real table definitions and the real isSyncEnabled(); replace ONLY the
// transaction-handle resolver, which is the single seam that touches Postgres.
vi.mock('../../lib/sync-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sync-db')>()
  return { ...actual, txDb: vi.fn() }
})

const dialect = new PgDialect()
const CREATED_AT_ISO = '2026-06-01T10:00:00.000Z'
const SERVICE_ID = 'V1StGXR8Z5jdHi6BmyT_1'

function serviceDoc(overrides: Partial<PayloadServiceDoc> = {}): PayloadServiceDoc {
  return {
    id: SERVICE_ID,
    // Populated relationship object — what Payload sends at depth ≥ 1.
    categoryId: { id: 'p1StGXR8Z5jdHi6BmyT_9' },
    name: 'Haircut',
    slug: 'haircut',
    description: null,
    durationMinutes: '30',
    bufferMinutes: 5,
    pricePaise: 30_000,
    isActive: true,
    imageUrl: null,
    displayOrder: 2,
    gemsRedeemable: false,
    gemsRequired: null,
    gemsCatalogueOrder: null,
    createdAt: CREATED_AT_ISO,
    ...overrides,
  }
}

type HookArgs = Parameters<typeof syncServiceToPublic>[0]

function runHook(doc: PayloadServiceDoc, operation: 'create' | 'update') {
  return syncServiceToPublic({ doc, operation, req: {} } as unknown as HookArgs)
}

let fake: ReturnType<typeof makeFakeTxDb>

beforeEach(() => {
  fake = makeFakeTxDb()
  vi.mocked(txDb).mockResolvedValue(fake.db as never)
  // The hook logs on every path; silence it and keep the spies assertable.
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(txDb).mockReset()
})

describe('syncServiceToPublic: create', () => {
  it('upserts the mapped row into public.service', async () => {
    await runHook(serviceDoc(), 'create')

    expect(fake.insert).toHaveBeenCalledTimes(1)
    expect(fake.insert).toHaveBeenCalledWith(service)
    expect(fake.update).not.toHaveBeenCalled()

    const written = fake.values.mock.calls[0]?.[0] as FakeRow
    expect(written).toMatchObject({
      id: SERVICE_ID,
      // Normalised out of the populated relationship object.
      categoryId: 'p1StGXR8Z5jdHi6BmyT_9',
      name: 'Haircut',
      slug: 'haircut',
      // Coerced from Payload's select string.
      durationMinutes: 30,
      bufferMinutes: 5,
      pricePaise: 30_000,
      isActive: true,
      displayOrder: 2,
      gemsRedeemable: false,
    })
    // The Drizzle column is timestamp({ mode: 'date' }) — a real Date is required.
    expect(written.createdAt).toBeInstanceOf(Date)
    expect((written.createdAt as Date).toISOString()).toBe(CREATED_AT_ISO)
  })

  it('uses onConflictDoUpdate keyed on service.id, excluding id and createdAt', async () => {
    await runHook(serviceDoc(), 'create')

    expect(fake.onConflictDoUpdate).toHaveBeenCalledTimes(1)
    const config = fake.onConflictDoUpdate.mock.calls[0]?.[0] as {
      target: unknown
      set: FakeRow
    }

    expect(config.target).toBe(service.id)
    // Excluded so an existing row keeps its original creation timestamp.
    expect(config.set).not.toHaveProperty('id')
    expect(config.set).not.toHaveProperty('createdAt')
    expect(config.set.name).toBe('Haircut')
    expect(config.set.updatedAt).toBeInstanceOf(Date)
  })

  it('is idempotent: applying the create path twice converges to one row', async () => {
    await runHook(serviceDoc(), 'create')
    // Same id, changed mutable fields, and a LATER createdAt that must be ignored.
    await expect(
      runHook(
        serviceDoc({
          name: 'Haircut (Advanced)',
          pricePaise: 45_000,
          durationMinutes: '45',
          createdAt: '2026-07-15T08:00:00.000Z',
        }),
        'create',
      ),
    ).resolves.toBeDefined()

    // Exactly one row, no duplicate-key error.
    expect(fake.rows.size).toBe(1)
    const row = fake.rows.get(SERVICE_ID) as FakeRow
    // Mutable fields converged on the latest document...
    expect(row.name).toBe('Haircut (Advanced)')
    expect(row.pricePaise).toBe(45_000)
    expect(row.durationMinutes).toBe(45)
    // ...while createdAt stayed at the FIRST write (Property 10 / Property 12).
    expect((row.createdAt as Date).toISOString()).toBe(CREATED_AT_ISO)
  })

  it.each(SERVICE_DURATION_MINUTES.map((minutes) => ({ minutes })))(
    'writes the select string "$minutes" as the integer $minutes',
    async ({ minutes }) => {
      await runHook(serviceDoc({ durationMinutes: String(minutes) }), 'create')

      const written = fake.values.mock.calls[0]?.[0] as FakeRow
      expect(written.durationMinutes).toBe(minutes)
      expect(Number.isInteger(written.durationMinutes)).toBe(true)
      expect(Number.isNaN(written.durationMinutes)).toBe(false)
    },
  )
})

describe('syncServiceToPublic: update', () => {
  it('updates public.service WHERE id = the document id', async () => {
    await runHook(serviceDoc({ name: 'Haircut Deluxe' }), 'update')

    expect(fake.update).toHaveBeenCalledTimes(1)
    expect(fake.update).toHaveBeenCalledWith(service)
    expect(fake.insert).not.toHaveBeenCalled()

    // Compile the Drizzle condition to SQL rather than trusting its shape.
    const condition = fake.where.mock.calls[0]?.[0] as SQL
    const compiled = dialect.sqlToQuery(condition)
    expect(compiled.sql).toBe('"service"."id" = $1')
    expect(compiled.params).toEqual([SERVICE_ID])

    const patch = fake.set.mock.calls[0]?.[0] as FakeRow
    expect(patch.name).toBe('Haircut Deluxe')
  })

  it('preserves createdAt and stamps updatedAt at sync time', async () => {
    const before = Date.now()
    await runHook(serviceDoc(), 'update')
    const after = Date.now()

    const patch = fake.set.mock.calls[0]?.[0] as FakeRow
    expect((patch.createdAt as Date).toISOString()).toBe(CREATED_AT_ISO)

    const updatedAt = patch.updatedAt as Date
    expect(updatedAt).toBeInstanceOf(Date)
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(updatedAt.getTime()).toBeLessThanOrEqual(after)
  })
})

describe('syncServiceToPublic: SERVICE_SYNC_ENABLED flag gate', () => {
  it('performs NO write and does not throw when the flag is "false"', async () => {
    vi.stubEnv('SERVICE_SYNC_ENABLED', 'false')

    await expect(runHook(serviceDoc(), 'create')).resolves.toBeDefined()

    // Short-circuited BEFORE the transaction handle was even resolved.
    expect(txDb).not.toHaveBeenCalled()
    expect(fake.insert).not.toHaveBeenCalled()
    expect(fake.update).not.toHaveBeenCalled()
    expect(fake.rows.size).toBe(0)
  })

  it('syncs when the flag is unset (default enabled)', async () => {
    vi.stubEnv('SERVICE_SYNC_ENABLED', undefined)

    await runHook(serviceDoc(), 'create')

    expect(fake.insert).toHaveBeenCalledTimes(1)
  })

  it('syncs for any other flag value', async () => {
    vi.stubEnv('SERVICE_SYNC_ENABLED', 'true')

    await runHook(serviceDoc(), 'create')

    expect(fake.insert).toHaveBeenCalledTimes(1)
  })
})

describe('syncServiceToPublic: failure path', () => {
  it('logs at error level and RE-THROWS so Payload rolls the transaction back', async () => {
    const boom = new Error('duplicate key value violates unique constraint')
    fake.failWritesWith(boom)

    // Re-throwing is what makes cms.* and public.* impossible to diverge.
    await expect(runHook(serviceDoc(), 'create')).rejects.toThrow(boom)

    expect(console.error).toHaveBeenCalledTimes(1)
    const [message, context] = vi.mocked(console.error).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(message).toBe('[sync] service sync failed')
    expect(context).toMatchObject({
      operation: 'create',
      documentId: SERVICE_ID,
      error: boom.message,
    })
    expect(context.stack).toBeDefined()
    expect(typeof context.durationMs).toBe('number')
    // Nothing was persisted.
    expect(fake.rows.size).toBe(0)
  })

  it('re-throws on the update path too', async () => {
    fake.failWritesWith(new Error('connection terminated'))

    await expect(runHook(serviceDoc(), 'update')).rejects.toThrow('connection terminated')
    expect(console.error).toHaveBeenCalledWith('[sync] service sync failed', expect.any(Object))
  })

  it('re-throws when the transaction handle cannot be resolved', async () => {
    vi.mocked(txDb).mockRejectedValue(new Error('no active transaction'))

    await expect(runHook(serviceDoc(), 'create')).rejects.toThrow('no active transaction')
    expect(console.error).toHaveBeenCalledTimes(1)
  })
})
