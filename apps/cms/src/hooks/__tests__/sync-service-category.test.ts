/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-service-category.test
 * Scope        : CMS Integration — Service Category Sync hook
 *
 * Validates    : Requirements 3.7, 3.8, 3.11, 3.12, 5.7, 12.1, 12.7
 *
 * Description  : Unit tests for `syncServiceCategoryToPublic`, the Payload
 *                afterChange hook mirroring `cms.service_category` into
 *                `public.service_category`. The transaction handle from
 *                `txDb(req)` is replaced with an in-memory double — no DB.
 *
 * Responsibilities :
 * - Assert the create path UPSERTs and converges on repeat application
 * - Assert the update path targets the row by id
 * - Assert createdAt preservation and updatedAt stamping
 * - Assert the SERVICE_SYNC_ENABLED=false short-circuit performs no write
 * - Assert a failed write is logged at error level AND re-thrown
 *
 * Features / Functionality :
 * - Mirrors sync-service.test.ts, targeting the category table
 *
 * Tech Stack   : TypeScript, Vitest, Drizzle ORM
 * Layer        : CMS (Hooks — test)
 *
 * Dependencies : vitest, drizzle-orm, ../sync-service-category, ../../lib/sync-db
 *
 * Notes        : Categories are seeded FIRST, so they hit the id collision the
 *                upsert exists for before services do — hence the dedicated
 *                idempotency case here as well.
 ************************************************************/

import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serviceCategory, txDb } from '../../lib/sync-db'
import type { PayloadServiceCategoryDoc } from '../mappers'
import { syncServiceCategoryToPublic } from '../sync-service-category'
import { type FakeRow, makeFakeTxDb } from './fake-tx-db'

// Real table defs, real isSyncEnabled(); only the Postgres seam is doubled.
vi.mock('../../lib/sync-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/sync-db')>()
  return { ...actual, txDb: vi.fn() }
})

const dialect = new PgDialect()
const CREATED_AT_ISO = '2026-06-01T10:00:00.000Z'
const CATEGORY_ID = 'p1StGXR8Z5jdHi6BmyT_9'

function categoryDoc(
  overrides: Partial<PayloadServiceCategoryDoc> = {},
): PayloadServiceCategoryDoc {
  return {
    id: CATEGORY_ID,
    name: 'Hair & Beauty',
    slug: 'hair-beauty',
    description: null,
    serviceType: 'salon',
    displayOrder: 1,
    isActive: true,
    createdAt: CREATED_AT_ISO,
    ...overrides,
  }
}

type HookArgs = Parameters<typeof syncServiceCategoryToPublic>[0]

function runHook(doc: PayloadServiceCategoryDoc, operation: 'create' | 'update') {
  return syncServiceCategoryToPublic({ doc, operation, req: {} } as unknown as HookArgs)
}

let fake: ReturnType<typeof makeFakeTxDb>

beforeEach(() => {
  fake = makeFakeTxDb()
  vi.mocked(txDb).mockResolvedValue(fake.db as never)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(txDb).mockReset()
})

describe('syncServiceCategoryToPublic: create', () => {
  it('upserts the mapped row into public.service_category', async () => {
    await runHook(categoryDoc(), 'create')

    expect(fake.insert).toHaveBeenCalledTimes(1)
    expect(fake.insert).toHaveBeenCalledWith(serviceCategory)
    expect(fake.update).not.toHaveBeenCalled()

    const written = fake.values.mock.calls[0]?.[0] as FakeRow
    expect(written).toMatchObject({
      id: CATEGORY_ID,
      name: 'Hair & Beauty',
      slug: 'hair-beauty',
      description: null,
      serviceType: 'salon',
      displayOrder: 1,
      isActive: true,
    })
    expect(written.createdAt).toBeInstanceOf(Date)
    expect((written.createdAt as Date).toISOString()).toBe(CREATED_AT_ISO)
  })

  it('uses onConflictDoUpdate keyed on serviceCategory.id, excluding id and createdAt', async () => {
    await runHook(categoryDoc(), 'create')

    const config = fake.onConflictDoUpdate.mock.calls[0]?.[0] as {
      target: unknown
      set: FakeRow
    }

    expect(config.target).toBe(serviceCategory.id)
    expect(config.set).not.toHaveProperty('id')
    expect(config.set).not.toHaveProperty('createdAt')
    expect(config.set.name).toBe('Hair & Beauty')
    expect(config.set.updatedAt).toBeInstanceOf(Date)
  })

  it('is idempotent: re-applying the create path converges to one row', async () => {
    await runHook(categoryDoc(), 'create')
    await expect(
      runHook(
        categoryDoc({ name: 'Hair', displayOrder: 3, createdAt: '2026-07-15T08:00:00.000Z' }),
        'create',
      ),
    ).resolves.toBeDefined()

    expect(fake.rows.size).toBe(1)
    const row = fake.rows.get(CATEGORY_ID) as FakeRow
    expect(row.name).toBe('Hair')
    expect(row.displayOrder).toBe(3)
    expect((row.createdAt as Date).toISOString()).toBe(CREATED_AT_ISO)
  })
})

describe('syncServiceCategoryToPublic: update', () => {
  it('updates public.service_category WHERE id = the document id', async () => {
    await runHook(categoryDoc({ isActive: false }), 'update')

    expect(fake.update).toHaveBeenCalledWith(serviceCategory)
    expect(fake.insert).not.toHaveBeenCalled()

    const compiled = dialect.sqlToQuery(fake.where.mock.calls[0]?.[0] as SQL)
    expect(compiled.sql).toBe('"service_category"."id" = $1')
    expect(compiled.params).toEqual([CATEGORY_ID])

    const patch = fake.set.mock.calls[0]?.[0] as FakeRow
    expect(patch.isActive).toBe(false)
  })

  it('preserves createdAt and stamps updatedAt at sync time', async () => {
    const before = Date.now()
    await runHook(categoryDoc(), 'update')
    const after = Date.now()

    const patch = fake.set.mock.calls[0]?.[0] as FakeRow
    expect((patch.createdAt as Date).toISOString()).toBe(CREATED_AT_ISO)

    const updatedAt = patch.updatedAt as Date
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(updatedAt.getTime()).toBeLessThanOrEqual(after)
  })
})

describe('syncServiceCategoryToPublic: SERVICE_SYNC_ENABLED flag gate', () => {
  it('performs NO write and does not throw when the flag is "false"', async () => {
    vi.stubEnv('SERVICE_SYNC_ENABLED', 'false')

    await expect(runHook(categoryDoc(), 'create')).resolves.toBeDefined()

    expect(txDb).not.toHaveBeenCalled()
    expect(fake.insert).not.toHaveBeenCalled()
    expect(fake.rows.size).toBe(0)
  })

  it('syncs when the flag is unset (default enabled)', async () => {
    vi.stubEnv('SERVICE_SYNC_ENABLED', undefined)

    await runHook(categoryDoc(), 'create')

    expect(fake.insert).toHaveBeenCalledTimes(1)
  })
})

describe('syncServiceCategoryToPublic: failure path', () => {
  it('logs at error level and RE-THROWS so Payload rolls the transaction back', async () => {
    const boom = new Error('null value in column "service_type" violates not-null constraint')
    fake.failWritesWith(boom)

    await expect(runHook(categoryDoc(), 'create')).rejects.toThrow(boom)

    expect(console.error).toHaveBeenCalledTimes(1)
    const [message, context] = vi.mocked(console.error).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ]
    expect(message).toBe('[sync] service_category sync failed')
    expect(context).toMatchObject({
      operation: 'create',
      documentId: CATEGORY_ID,
      error: boom.message,
    })
    expect(context.stack).toBeDefined()
    expect(fake.rows.size).toBe(0)
  })
})
