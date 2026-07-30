/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : sync-atomicity.test
 * Scope        : CMS Integration — Atomic cross-schema sync (INTEGRATION)
 *
 * Validates    : Requirements 4.1, 4.6, 3.5, 3.9
 *
 * Description  : END-TO-END integration test for the claim this whole feature
 *                rests on: `cms.*` and `public.*` are separate schemas in ONE
 *                Neon database, the sync write rides Payload's OWN
 *                request-scoped transaction, and therefore the two schemas
 *                COMMIT TOGETHER OR ROLL BACK TOGETHER. Runs against the live
 *                `dev` branch through the Payload Local API — no mocks.
 *
 * Responsibilities :
 * - Drive 22 sequential create/update operations through Payload and assert each
 *   produced a matching, field-accurate `public.*` row
 * - Force the mirrored `public` write to FAIL mid-hook and assert NEITHER schema
 *   retains the row (the no-divergence guarantee)
 * - Prove the accessor choice is load-bearing: a write on the BASE POOL survives
 *   a rollback that discards the transaction-bound write
 * - Leave the database byte-for-byte at the baseline it started from
 *
 * Features / Functionality :
 * - Skips cleanly when no live database is configured (CI has no Neon branch)
 * - Every row it writes uses the `zzsynctest` id prefix and `isActive: false`
 * - Cleanup runs in afterAll AND as an explicit final assertion, so a mid-test
 *   failure cannot leave residue behind
 *
 * Tech Stack   : Payload CMS v3, Drizzle ORM, PostgreSQL (Neon), Vitest
 * Layer        : CMS (Hooks — integration test)
 *
 * Dependencies : vitest, drizzle-orm, @rgss/types, ../../lib/sync-db,
 *                ../../test/live-payload
 *
 * Notes        :
 * - Why a forced FK violation rather than a stubbed throw: a stub would only
 *   prove Payload rolls back when a hook throws. Driving a REAL constraint
 *   failure out of the `public`-schema INSERT proves the specific thing that
 *   matters — that the mirrored write is inside Payload's transaction.
 * - The negative control is the decisive evidence. If `txDb()` resolved
 *   `adapter.drizzle` (as `req.payload.db.drizzle` would), the mirrored row
 *   would SURVIVE the rollback. This test shows both outcomes side by side.
 ************************************************************/

import { SERVICE_DURATION_MINUTES } from '@rgss/types'
import { sql } from 'drizzle-orm'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { service, txDb } from '../../lib/sync-db'
import { bootPayload, isLiveDbAvailable, pgAdapter, queryRows } from '../../test/live-payload'

/** Every id this suite writes starts here, so cleanup is a single LIKE match. */
const PREFIX = 'zzsynctest'
const HAPPY_CATEGORY_ID = `${PREFIX}_cat_happy`
const ORPHAN_CATEGORY_ID = `${PREFIX}_cat_orphan`
const CONTROL_CATEGORY_ID = `${PREFIX}_cat_control`
const ROLLBACK_SERVICE_ID = `${PREFIX}_svc_rollback`
const SESSION_SERVICE_ID = `${PREFIX}_svc_session`
const POOL_SERVICE_ID = `${PREFIX}_svc_pool`
/** 1 category create + 10 service creates + 10 service updates + 1 category update. */
const SERVICE_COUNT = 10

const serviceId = (n: number) => `${PREFIX}_svc_${n}`

type DurationOption = `${(typeof SERVICE_DURATION_MINUTES)[number]}`

/** Cycle through the whole fixed duration set across the 10 services. */
function durationFor(index: number): (typeof SERVICE_DURATION_MINUTES)[number] {
  return (
    SERVICE_DURATION_MINUTES[index % SERVICE_DURATION_MINUTES.length] ?? SERVICE_DURATION_MINUTES[0]
  )
}

/**
 * Flatten an error and its whole `cause` chain into one searchable string.
 *
 * Drizzle wraps a driver error in a `DrizzleQueryError` whose message is the SQL
 * it attempted, and puts the Postgres error (constraint name, `detail`) on
 * `cause`. Asserting on only one level would miss whichever half matters.
 */
function describeError(error: unknown, depth = 0): string {
  if (!(error instanceof Error) || depth > 5) {
    return String(error)
  }
  const parts = [error.message]
  if (error.cause !== undefined) {
    parts.push(describeError(error.cause, depth + 1))
  }
  // `detail` carries the "Key (category_id)=(...) is not present" text on pg errors.
  const detail = (error as { detail?: unknown }).detail
  if (typeof detail === 'string') {
    parts.push(detail)
  }
  return parts.join('\n')
}

type Counts = {
  publicService: number
  publicCategory: number
  cmsService: number
  cmsCategory: number
}

const live = isLiveDbAvailable()

describe.skipIf(!live)('service sync atomicity (integration — live dev branch)', () => {
  let payload: Payload
  let baseline: Counts

  async function counts(): Promise<Counts> {
    const [row] = await queryRows(
      payload,
      sql`select
            (select count(*) from public.service)::int          as public_service,
            (select count(*) from public.service_category)::int as public_category,
            (select count(*) from cms.service)::int             as cms_service,
            (select count(*) from cms.service_category)::int    as cms_category`,
    )
    return {
      publicService: Number(row?.public_service),
      publicCategory: Number(row?.public_category),
      cmsService: Number(row?.cms_service),
      cmsCategory: Number(row?.cms_category),
    }
  }

  /** One row by id, or undefined. `table` is a trusted literal, never user input. */
  async function findRow(
    table: 'public.service' | 'public.service_category' | 'cms.service' | 'cms.service_category',
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    const from =
      table === 'public.service'
        ? sql`public.service`
        : table === 'public.service_category'
          ? sql`public.service_category`
          : table === 'cms.service'
            ? sql`cms.service`
            : sql`cms.service_category`
    const rows = await queryRows(payload, sql`select * from ${from} where id = ${id}`)
    return rows[0]
  }

  /**
   * Remove every row this suite could have written, children before parents so
   * the ON DELETE RESTRICT foreign keys are satisfied.
   */
  async function cleanup(): Promise<void> {
    const like = `${PREFIX}%`
    await queryRows(payload, sql`delete from public.service where id like ${like}`)
    await queryRows(payload, sql`delete from cms.service where id like ${like}`)
    await queryRows(payload, sql`delete from public.service_category where id like ${like}`)
    await queryRows(payload, sql`delete from cms.service_category where id like ${like}`)
  }

  beforeAll(async () => {
    payload = await bootPayload()
    // Clear any residue from an earlier interrupted run BEFORE the baseline is
    // captured, so the baseline is the real catalogue.
    await cleanup()
    baseline = await counts()
  }, 180_000)

  afterAll(async () => {
    // Belt and braces: runs even when a test above threw part-way through.
    if (payload) {
      await cleanup()
    }
  }, 120_000)

  it('mirrors 22 sequential Payload operations into public.* field-for-field', async () => {
    // ---- op 1: category create -------------------------------------------
    await payload.create({
      collection: 'service_category',
      data: {
        id: HAPPY_CATEGORY_ID,
        name: 'ZZ Sync Test Category',
        slug: `${PREFIX}-cat-happy`,
        serviceType: 'salon',
        displayOrder: 900,
        // Deliberately inactive: a throwaway row must never be bookable, even
        // for the seconds it exists.
        isActive: false,
      },
    })

    const publicCategory = await findRow('public.service_category', HAPPY_CATEGORY_ID)
    const cmsCategory = await findRow('cms.service_category', HAPPY_CATEGORY_ID)
    expect(publicCategory).toBeDefined()
    expect(publicCategory?.name).toBe('ZZ Sync Test Category')
    expect(publicCategory?.slug).toBe(`${PREFIX}-cat-happy`)
    expect(publicCategory?.service_type).toBe('salon')
    expect(publicCategory?.display_order).toBe(900)
    expect(publicCategory?.is_active).toBe(false)
    // createdAt is carried across, never regenerated (Property 10).
    expect(new Date(publicCategory?.created_at as string).toISOString()).toBe(
      new Date(cmsCategory?.created_at as string).toISOString(),
    )

    // ---- ops 2-11: ten service creates -----------------------------------
    const createdAtById = new Map<string, string>()

    for (let n = 1; n <= SERVICE_COUNT; n++) {
      const minutes = durationFor(n)

      await payload.create({
        collection: 'service',
        data: {
          id: serviceId(n),
          categoryId: HAPPY_CATEGORY_ID,
          name: `ZZ Sync Test Service ${n}`,
          slug: `${PREFIX}-svc-${n}`,
          description: n % 2 === 0 ? null : `throwaway ${n}`,
          durationMinutes: String(minutes) as DurationOption,
          bufferMinutes: n,
          pricePaise: 100_000 + n,
          isActive: false,
          displayOrder: n,
          gemsRedeemable: false,
        },
      })

      const row = await findRow('public.service', serviceId(n))
      expect(row, `public.service row missing for ${serviceId(n)}`).toBeDefined()
      expect(row?.category_id).toBe(HAPPY_CATEGORY_ID)
      expect(row?.name).toBe(`ZZ Sync Test Service ${n}`)
      expect(row?.slug).toBe(`${PREFIX}-svc-${n}`)
      // The Payload select serialises as a string; the column is integer.
      expect(row?.duration_minutes).toBe(minutes)
      expect(Number.isInteger(row?.duration_minutes)).toBe(true)
      expect(row?.buffer_minutes).toBe(n)
      expect(row?.price_paise).toBe(100_000 + n)
      expect(row?.is_active).toBe(false)
      expect(row?.display_order).toBe(n)
      expect(row?.description).toBe(n % 2 === 0 ? null : `throwaway ${n}`)

      createdAtById.set(serviceId(n), new Date(row?.created_at as string).toISOString())
    }

    // ---- ops 12-21: ten service updates ----------------------------------
    for (let n = 1; n <= SERVICE_COUNT; n++) {
      await payload.update({
        collection: 'service',
        id: serviceId(n),
        data: { name: `ZZ Sync Test Service ${n} (renamed)`, pricePaise: 200_000 + n },
      })

      const row = await findRow('public.service', serviceId(n))
      expect(row?.name).toBe(`ZZ Sync Test Service ${n} (renamed)`)
      expect(row?.price_paise).toBe(200_000 + n)
      // The update path must not disturb the original creation timestamp.
      expect(new Date(row?.created_at as string).toISOString()).toBe(
        createdAtById.get(serviceId(n)),
      )
    }

    // ---- op 22: category update ------------------------------------------
    await payload.update({
      collection: 'service_category',
      id: HAPPY_CATEGORY_ID,
      data: { displayOrder: 901 },
    })
    expect((await findRow('public.service_category', HAPPY_CATEGORY_ID))?.display_order).toBe(901)

    // 22 operations, every one mirrored — comfortably past the 20 required.
    const after = await counts()
    expect(after.publicService).toBe(baseline.publicService + SERVICE_COUNT)
    expect(after.cmsService).toBe(baseline.cmsService + SERVICE_COUNT)
    expect(after.publicCategory).toBe(baseline.publicCategory + 1)
    expect(after.cmsCategory).toBe(baseline.cmsCategory + 1)
  }, 300_000)

  it('rolls BOTH schemas back when the mirrored public write fails mid-hook', async () => {
    // Set up a category that exists in `cms.*` but NOT in `public.*`, by turning
    // the sync off for that one write. `public.service.category_id` carries an
    // ON DELETE RESTRICT foreign key to `public.service_category.id`, so the
    // mirrored INSERT for a service in this category is guaranteed to fail
    // INSIDE the hook — a real database error, not a stubbed throw.
    vi.stubEnv('SERVICE_SYNC_ENABLED', 'false')
    try {
      await payload.create({
        collection: 'service_category',
        data: {
          id: ORPHAN_CATEGORY_ID,
          name: 'ZZ Sync Test Orphan Category',
          slug: `${PREFIX}-cat-orphan`,
          serviceType: 'spa',
          isActive: false,
        },
      })
    } finally {
      vi.unstubAllEnvs()
    }

    // Precondition: cms has it, public does not. (Also a live re-proof of the
    // SERVICE_SYNC_ENABLED gate against a real database.)
    expect(await findRow('cms.service_category', ORPHAN_CATEGORY_ID)).toBeDefined()
    expect(await findRow('public.service_category', ORPHAN_CATEGORY_ID)).toBeUndefined()

    const before = await counts()

    // With the sync back ON, the cms write succeeds and the mirrored write blows
    // up on the foreign key. Payload must discard the whole transaction.
    //
    // The failure is IDENTIFIED, not merely counted. A rejection raised by
    // Payload's own validation BEFORE the hook ran would satisfy a bare
    // `.rejects.toThrow()` while proving nothing about atomicity — so the error
    // is pinned to the mirrored `public.service` INSERT and to the foreign-key
    // violation underneath it.
    const failure = await payload
      .create({
        collection: 'service',
        data: {
          id: ROLLBACK_SERVICE_ID,
          categoryId: ORPHAN_CATEGORY_ID,
          name: 'ZZ Sync Test Rollback Service',
          slug: `${PREFIX}-svc-rollback`,
          durationMinutes: '30',
          pricePaise: 123_400,
          isActive: false,
        },
      })
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(failure, 'the create should have failed').not.toBeNull()
    // Drizzle reports the statement it was running; this is the upsert the sync
    // hook issues against `public.service`, not anything Payload did to `cms.*`.
    expect(describeError(failure)).toMatch(/insert into "service"/i)
    // ...and the root cause is the foreign key it could not satisfy.
    expect(describeError(failure)).toMatch(/violates foreign key constraint/i)

    // THE assertion this feature exists for: NEITHER schema kept the row.
    expect(
      await findRow('cms.service', ROLLBACK_SERVICE_ID),
      'cms.service kept a row the transaction rolled back',
    ).toBeUndefined()
    expect(
      await findRow('public.service', ROLLBACK_SERVICE_ID),
      'public.service kept a row cms.service does not have — the exact divergence this design prevents',
    ).toBeUndefined()

    // No collateral damage either: the counts are exactly where they were.
    expect(await counts()).toEqual(before)
  }, 180_000)

  it('proves the accessor is load-bearing: a base-pool write survives a rollback, the transaction-bound write does not', async () => {
    // A committed category so both candidate writes satisfy the foreign key.
    await payload.create({
      collection: 'service_category',
      data: {
        id: CONTROL_CATEGORY_ID,
        name: 'ZZ Sync Test Control Category',
        slug: `${PREFIX}-cat-control`,
        serviceType: 'salon',
        isActive: false,
      },
    })

    const adapter = pgAdapter(payload)
    const txID = await adapter.beginTransaction()

    // The handle the sync hooks actually use — resolved by the REAL txDb().
    const transactionBound = await txDb({ payload, transactionID: txID })
    // The handle `req.payload.db.drizzle` would hand back: the base pool.
    const basePool = adapter.drizzle

    const row = (id: string, slug: string) => ({
      id,
      categoryId: CONTROL_CATEGORY_ID,
      name: `ZZ Sync Test ${slug}`,
      slug,
      durationMinutes: 30,
      pricePaise: 999_00,
      isActive: false,
    })

    await transactionBound.insert(service).values(row(SESSION_SERVICE_ID, `${PREFIX}-svc-session`))
    await basePool.insert(service).values(row(POOL_SERVICE_ID, `${PREFIX}-svc-pool`))

    await adapter.rollbackTransaction(txID)

    // Written on Payload's transaction → discarded with it. This is what makes
    // the two schemas inseparable.
    expect(await findRow('public.service', SESSION_SERVICE_ID)).toBeUndefined()
    // Written on the base pool → committed independently and STILL THERE after
    // the rollback. Had txDb() returned this handle, the previous test's row
    // would have survived in public.service with no cms.service counterpart.
    expect(
      await findRow('public.service', POOL_SERVICE_ID),
      'base-pool write should have committed independently of the rolled-back transaction',
    ).toBeDefined()
  }, 180_000)

  it('leaves the database exactly at the baseline it started from', async () => {
    await cleanup()

    const after = await counts()
    expect(after).toEqual(baseline)

    // And no `zz`-prefixed residue anywhere in either schema.
    const [residue] = await queryRows(
      payload,
      sql`select
            (select count(*) from public.service where id like ${'zz%'})::int          as public_service,
            (select count(*) from public.service_category where id like ${'zz%'})::int as public_category,
            (select count(*) from cms.service where id like ${'zz%'})::int             as cms_service,
            (select count(*) from cms.service_category where id like ${'zz%'})::int    as cms_category`,
    )
    expect(residue).toEqual({
      public_service: 0,
      public_category: 0,
      cms_service: 0,
      cms_category: 0,
    })
  }, 120_000)
})
