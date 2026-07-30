/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-08-2026 & Updated - 04-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : redemptions.integration.test
 * Scope        : Integration test — Gems redemption against a REAL database
 *
 * Feature      : gems-redemption
 * Task         : 7.4 — Integration happy-path test (real DB)
 * Validates    : Requirements 1.5, 4.4
 *
 * Description  : Exercises `redeemServiceWithGems` and `getRedeemableServices`
 *                against a live Postgres, which is the ONLY way to verify the
 *                guarantees that depend on the database itself:
 *                  - Req 4.4 atomicity: the single guarded data-modifying CTE
 *                    persists the balance deduction, the totalGemsRedeemed
 *                    increment, the `redeemed` transaction and the booking +
 *                    booking_service TOGETHER on success, and persists NOTHING
 *                    after a forced guard failure
 *                  - the `booking_redemption_key_uidx` partial unique index
 *                    really de-dupes a replayed idempotency key
 *                  - Req 1.5 ordering: `ORDER BY gems_catalogue_order ASC NULLS
 *                    LAST` as executed by Postgres, not by a JS mirror
 *
 * Skip behaviour : CI has no Neon branch and no `packages/db/.env`, so
 *                `isLiveDbAvailable()` is false there and this whole suite SKIPS
 *                cleanly rather than failing the pipeline. Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : The dev catalogue has NO gems-redeemable services, so the suite
 *                seeds three throwaway ones. Every row it creates carries the
 *                `gems_it_` id prefix (plus a per-run suffix) and is deleted in
 *                `afterAll`, which then PROVES the end state: the dev baseline of
 *                57 public.service / 10 public.service_category rows is restored
 *                and zero prefixed rows remain in any table it touched.
 *
 * Tech Stack   : Vitest, Drizzle ORM, Neon PostgreSQL
 * Layer        : Data Access (Test)
 *
 * Dependencies : drizzle-orm, vitest, ../test/live-db, ./loyalty, ./redemptions
 *
 * Notes        : Money stays integer paise; gems stay whole integers. Statements
 *                autocommit (neon-http has no interactive transactions), which is
 *                exactly why the atomicity guarantee has to come from the single
 *                CTE and is worth asserting here.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import { getRedeemableServices } from './loyalty'
import { redeemServiceWithGems } from './redemptions'

const LIVE = isLiveDbAvailable()

// Per-run suffix so two concurrent local runs cannot collide.
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `gems_it_${RUN}`

const USER_ID = `${PREFIX}_user`
const ACCOUNT_ID = `${PREFIX}_account`
const SERVICE_A = `${PREFIX}_svc_a`
const SERVICE_B = `${PREFIX}_svc_b`
const SERVICE_UNORDERED = `${PREFIX}_svc_unordered`
const REDEMPTION_KEY = `${PREFIX}-idem-key`

// Existing dev rows the seeded services hang off — never modified.
const CATEGORY_ID = 'cat_haircut'
const BRANCH_ID = 'branch_rayasandra'

const START_BALANCE = 900
const COST_A = 300

type CountRow = { svc: string; cat: string; cms_svc: string; cms_cat: string }

async function catalogueCounts(): Promise<CountRow> {
  const row = await queryRow<CountRow>(sql`
    SELECT (SELECT count(*) FROM public.service)          AS svc,
           (SELECT count(*) FROM public.service_category) AS cat,
           (SELECT count(*) FROM cms.service)             AS cms_svc,
           (SELECT count(*) FROM cms.service_category)    AS cms_cat
  `)
  return row as CountRow
}

let baselineCounts: CountRow
let staffId: string | null = null
/** booking ids this suite created, so cleanup can be precise. */
const createdBookingIds: string[] = []

async function seedService(id: string, gemsRequired: number, order: number | null): Promise<void> {
  await queryRows(sql`
    INSERT INTO public.service
      (id, category_id, name, slug, duration_minutes, buffer_minutes, price_paise,
       is_active, display_order, gems_redeemable, gems_required, gems_catalogue_order)
    VALUES (${id}, ${CATEGORY_ID}, ${`ZZ Gems IT ${id}`}, ${id}, 30, 0, 100000,
            true, 999, true, ${gemsRequired}, ${order})
  `)
}

describe.skipIf(!LIVE)('gems redemption against a live database (Task 7.4)', () => {
  beforeAll(async () => {
    baselineCounts = await catalogueCounts()

    const staff = await queryRow<{ id: string }>(sql`
      SELECT id FROM public.staff_profile WHERE is_active = true LIMIT 1
    `)
    staffId = staff?.id ?? null

    await queryRows(sql`
      INSERT INTO public."user" (id, name, email, email_verified, role)
      VALUES (${USER_ID}, 'ZZ Gems IT Customer', ${`${PREFIX}@example.invalid`}, false, 'customer')
    `)
    await queryRows(sql`
      INSERT INTO public.loyalty_account
        (id, customer_id, gems_balance, total_gems_earned, total_gems_redeemed)
      VALUES (${ACCOUNT_ID}, ${USER_ID}, ${START_BALANCE}, ${START_BALANCE}, 0)
    `)

    await seedService(SERVICE_A, COST_A, 1)
    await seedService(SERVICE_B, 400, 2)
    await seedService(SERVICE_UNORDERED, 500, null)
  })

  afterAll(async () => {
    // Ordered to respect the FKs: transactions (RESTRICT on the account) →
    // bookings (booking_service CASCADEs) → account → user → services (RESTRICT
    // from booking_service).
    await queryRows(
      sql`DELETE FROM public.loyalty_transaction WHERE loyalty_account_id = ${ACCOUNT_ID}`,
    )
    await queryRows(sql`DELETE FROM public.booking WHERE customer_id = ${USER_ID}`)
    await queryRows(sql`DELETE FROM public.loyalty_account WHERE customer_id = ${USER_ID}`)
    await queryRows(sql`DELETE FROM public."user" WHERE id = ${USER_ID}`)
    await queryRows(
      sql`DELETE FROM public.service WHERE id IN (${SERVICE_A}, ${SERVICE_B}, ${SERVICE_UNORDERED})`,
    )
    // Belt-and-braces: the seeded ids are authored ONLY in `public.service`, but
    // sweep the CMS-side table for the same prefix too so no path can leave the
    // two schemas divergent (the drift gate treats a CMS-only row as drift).
    await queryRows(sql`DELETE FROM cms.service WHERE id LIKE ${`${PREFIX}%`}`)

    // PROVE the end state: zero residue and the dev catalogue baseline restored.
    const residue = await queryRow<{
      services: string
      cms_services: string
      users: string
      accounts: string
      bookings: string
      booking_services: string
      transactions: string
    }>(sql`
      SELECT (SELECT count(*) FROM public.service  WHERE id LIKE ${`${PREFIX}%`}) AS services,
             (SELECT count(*) FROM cms.service     WHERE id LIKE ${`${PREFIX}%`}) AS cms_services,
             (SELECT count(*) FROM public."user"   WHERE id LIKE ${`${PREFIX}%`}) AS users,
             (SELECT count(*) FROM public.loyalty_account WHERE id LIKE ${`${PREFIX}%`}) AS accounts,
             (SELECT count(*) FROM public.booking WHERE redemption_key LIKE ${`${PREFIX}%`}) AS bookings,
             (SELECT count(*) FROM public.booking_service bs
                JOIN public.service s ON s.id = bs.service_id
               WHERE s.id LIKE ${`${PREFIX}%`}) AS booking_services,
             (SELECT count(*) FROM public.loyalty_transaction
               WHERE loyalty_account_id = ${ACCOUNT_ID}) AS transactions
    `)
    expect(residue).toEqual({
      services: '0',
      cms_services: '0',
      users: '0',
      accounts: '0',
      bookings: '0',
      booking_services: '0',
      transactions: '0',
    })
    expect(await catalogueCounts()).toEqual(baselineCounts)
  })

  it('persists all four writes together on a successful redemption (Req 4.4)', async () => {
    const result = await redeemServiceWithGems({
      accountId: ACCOUNT_ID,
      customerId: USER_ID,
      branchId: BRANCH_ID,
      bookingNumber: `BK-RS-2608-H-${RUN.slice(0, 5)}`,
      serviceType: 'salon',
      bookingDate: new Date('2026-08-10T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '10:30',
      durationMinutes: 30,
      gemsRequired: COST_A,
      serviceId: SERVICE_A,
      serviceName: `ZZ Gems IT ${SERVICE_A}`,
      staffId: staffId as string,
      idempotencyKey: REDEMPTION_KEY,
      description: 'Redeemed: ZZ Gems IT service',
    })

    expect('duplicate' in result).toBe(false)
    if ('duplicate' in result) {
      return
    }
    createdBookingIds.push(result.bookingId)

    // (1) balance deducted + (2) lifetime total incremented
    expect(result.gemsSpent).toBe(COST_A)
    expect(result.newBalance).toBe(START_BALANCE - COST_A)
    const account = await queryRow<{ gems_balance: number; total_gems_redeemed: number }>(sql`
      SELECT gems_balance, total_gems_redeemed
      FROM public.loyalty_account WHERE id = ${ACCOUNT_ID}
    `)
    expect(account).toEqual({
      gems_balance: START_BALANCE - COST_A,
      total_gems_redeemed: COST_A,
    })

    // (3) the ₹0 redemption booking
    const booking = await queryRow<{
      id: string
      status: string
      total_amount_paise: number
      is_gems_redemption: boolean
      gems_redeemed: number
      offer_id: string | null
      redemption_key: string
      is_walkin: boolean
      is_membership_session: boolean
    }>(sql`
      SELECT id, status, total_amount_paise, is_gems_redemption, gems_redeemed, offer_id,
             redemption_key, is_walkin, is_membership_session
      FROM public.booking WHERE id = ${result.bookingId}
    `)
    expect(booking).toEqual({
      id: result.bookingId,
      status: 'pending',
      total_amount_paise: 0,
      is_gems_redemption: true,
      gems_redeemed: COST_A,
      offer_id: null,
      redemption_key: REDEMPTION_KEY,
      is_walkin: false,
      is_membership_session: false,
    })

    // (3b) the snapshotted booking_service at ₹0
    const bookingService = await queryRow<{
      service_id: string
      price_at_booking_paise: number
      duration_minutes: number
      service_name_snapshot: string
    }>(sql`
      SELECT service_id, price_at_booking_paise, duration_minutes, service_name_snapshot
      FROM public.booking_service WHERE booking_id = ${result.bookingId}
    `)
    expect(bookingService).toEqual({
      service_id: SERVICE_A,
      price_at_booking_paise: 0,
      duration_minutes: 30,
      service_name_snapshot: `ZZ Gems IT ${SERVICE_A}`,
    })

    // (4) exactly one `redeemed` transaction, stored POSITIVE and linked
    const transactions = await queryRows<{
      type: string
      gems_amount: number
      booking_id: string | null
    }>(sql`
      SELECT type, gems_amount, booking_id
      FROM public.loyalty_transaction WHERE loyalty_account_id = ${ACCOUNT_ID}
    `)
    expect(transactions).toEqual([
      { type: 'redeemed', gems_amount: COST_A, booking_id: result.bookingId },
    ])
  })

  it('persists NOTHING after a forced guard failure (Req 4.4 atomicity)', async () => {
    const before = await queryRow<{ gems_balance: number; total_gems_redeemed: number }>(sql`
      SELECT gems_balance, total_gems_redeemed
      FROM public.loyalty_account WHERE id = ${ACCOUNT_ID}
    `)
    const failedKey = `${PREFIX}-guard-fail`

    // Ask for one more gem than the account holds → the guarded UPDATE matches
    // zero rows, so every downstream INSERT … SELECT FROM guard inserts nothing.
    await expect(
      redeemServiceWithGems({
        accountId: ACCOUNT_ID,
        customerId: USER_ID,
        branchId: BRANCH_ID,
        bookingNumber: `BK-RS-2608-H-${RUN.slice(0, 4)}9`,
        serviceType: 'salon',
        bookingDate: new Date('2026-08-11T00:00:00.000Z'),
        startTime: '11:00',
        endTime: '11:30',
        durationMinutes: 30,
        gemsRequired: (before?.gems_balance ?? 0) + 1,
        serviceId: SERVICE_B,
        serviceName: `ZZ Gems IT ${SERVICE_B}`,
        staffId: staffId as string,
        idempotencyKey: failedKey,
        description: 'Redeemed: should never persist',
      }),
    ).rejects.toMatchObject({ code: 'GEMS_INSUFFICIENT_BALANCE', statusCode: 409 })

    // Balance and totals untouched.
    expect(
      await queryRow(sql`
        SELECT gems_balance, total_gems_redeemed
        FROM public.loyalty_account WHERE id = ${ACCOUNT_ID}
      `),
    ).toEqual(before)

    // No booking, no booking_service, no extra transaction.
    expect(
      await queryRow<{ count: string }>(sql`
        SELECT count(*) AS count FROM public.booking WHERE redemption_key = ${failedKey}
      `),
    ).toEqual({ count: '0' })
    expect(
      await queryRow<{ count: string }>(sql`
        SELECT count(*) AS count FROM public.booking_service WHERE service_id = ${SERVICE_B}
      `),
    ).toEqual({ count: '0' })
    expect(
      await queryRow<{ count: string }>(sql`
        SELECT count(*) AS count FROM public.loyalty_transaction
        WHERE loyalty_account_id = ${ACCOUNT_ID}
      `),
    ).toEqual({ count: '1' })
  })

  it('resolves a replayed idempotency key to the original booking without deducting again', async () => {
    const before = await queryRow<{ gems_balance: number; total_gems_redeemed: number }>(sql`
      SELECT gems_balance, total_gems_redeemed
      FROM public.loyalty_account WHERE id = ${ACCOUNT_ID}
    `)

    // The remaining balance (600) still covers the cost (300), so the guard
    // matches and the partial unique index on redemption_key is what stops the
    // second write.
    const replay = await redeemServiceWithGems({
      accountId: ACCOUNT_ID,
      customerId: USER_ID,
      branchId: BRANCH_ID,
      bookingNumber: `BK-RS-2608-H-${RUN.slice(0, 4)}8`,
      serviceType: 'salon',
      bookingDate: new Date('2026-08-10T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '10:30',
      durationMinutes: 30,
      gemsRequired: COST_A,
      serviceId: SERVICE_A,
      serviceName: `ZZ Gems IT ${SERVICE_A}`,
      staffId: staffId as string,
      idempotencyKey: REDEMPTION_KEY,
      description: 'Redeemed: replay',
    })

    expect(replay).toMatchObject({ duplicate: true, bookingId: createdBookingIds[0] })
    // Rolled back in full — no second deduction.
    expect(
      await queryRow(sql`
        SELECT gems_balance, total_gems_redeemed
        FROM public.loyalty_account WHERE id = ${ACCOUNT_ID}
      `),
    ).toEqual(before)
    expect(
      await queryRow<{ count: string }>(sql`
        SELECT count(*) AS count FROM public.booking WHERE redemption_key = ${REDEMPTION_KEY}
      `),
    ).toEqual({ count: '1' })
  })

  it('returns the catalogue ordered by gemsCatalogueOrder ascending, nulls last (Req 1.5)', async () => {
    const catalogue = await getRedeemableServices()

    // Postgres did the ordering; assert the seeded rows come back in the order
    // the requirement mandates, with the null-order row last.
    const seeded = catalogue.filter((s) => s.id.startsWith(PREFIX)).map((s) => s.id)
    expect(seeded).toEqual([SERVICE_A, SERVICE_B, SERVICE_UNORDERED])

    // And globally: every non-null order is non-decreasing and precedes the nulls.
    const orders = await queryRows<{ gems_catalogue_order: number | null }>(sql`
      SELECT s.gems_catalogue_order
      FROM public.service s
      WHERE s.gems_redeemable = true AND s.is_active = true
      ORDER BY s.gems_catalogue_order ASC NULLS LAST
    `)
    let seenNull = false
    let previous: number | null = null
    for (const { gems_catalogue_order: order } of orders) {
      if (order === null) {
        seenNull = true
        continue
      }
      expect(seenNull).toBe(false)
      if (previous !== null) {
        expect(order).toBeGreaterThanOrEqual(previous)
      }
      previous = order
    }
  })
})
