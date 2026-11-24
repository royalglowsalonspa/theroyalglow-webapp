/************************************************************
 * Module Name  : gems-ledger.integration.test
 * Scope        : Integration test — gems batches and their settlement (REAL db)
 *
 * Description  : The gems write paths against Neon dev with two throwaway
 *                branches A and B (multi-branch R10, settlement.md):
 *                  - ST-01: gems issued at A and spent on a free service
 *                    completed at B make A owe B ₹1.00 a gem; B's own gems
 *                    make an internal entry;
 *                  - ST-02: a redemption spends the earliest-expiring gems
 *                    first, with one entry per earning branch;
 *                  - ST-03: a rejected, cancelled or missed redemption gives
 *                    its gems back to the same batches, records no entry, and
 *                    expires straight away what came from a lapsed batch;
 *                  - ST-04: expiry takes only unspent gems, and a rerun
 *                    takes nothing;
 *                  - ST-05: changing the value per gem or the share changes
 *                    later entries only;
 *                  - ST-06: concurrent redemptions never spend the same gems;
 *                  - checkout redemptions spend batches before the invoice's
 *                    own gems are earned, and the database refuses any spend
 *                    a batch can't cover.
 *
 * Skip behaviour : Skips without packages/db/.env (CI). Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : Prefixed `gl_it_<run>` rows, deleted in one transaction in
 *                afterAll (ledger rows through the test fixture switch,
 *                migration 0022), then zero residue is proven. The branches
 *                reuse the primary branch's Owner.
 ************************************************************/

import type { SettlementSetting } from '@rgss/types'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { fixtureFinancialYear, splitFixtureTax } from '../test/issued-invoice'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import {
  approveBooking,
  completeBookingWithInvoice,
  markBookingNoShow,
  rejectBooking,
} from './admin-bookings'
import { cancelBooking } from './bookings'
import { expireLapsedGems } from './gems-ledger'
import { redeemServiceWithGems } from './redemptions'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `gl_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const ACTOR = `${PREFIX}_actor`
const STYLIST_A = `${PREFIX}_sty_a`
const STYLIST_B = `${PREFIX}_sty_b`
const PROFILE_A = `${STYLIST_A}_p`
const PROFILE_B = `${STYLIST_B}_p`
const DEFAULT: SettlementSetting = { shareBps: 10_000, gemValuePaise: 100 }

/** The stylist who works at the branch. */
function staffAt(branchId: string): string {
  return branchId === BRANCH_A ? PROFILE_A : PROFILE_B
}

let serviceId = ''
let serial = 0

function next(): string {
  serial += 1
  return `${serial}`
}

/** A customer with an empty loyalty account. */
async function customer(name: string): Promise<{ id: string; account: string }> {
  const id = `${PREFIX}_c_${name}`
  const account = `${id}_acct`
  await db.batch([
    db.execute(sql`
      insert into "user" (id, name, email, email_verified, role)
      values (${id}, ${`ZZ Gems Ledger IT ${name}`}, ${`${id}@example.invalid`}, false, 'customer')`),
    db.execute(sql`
      insert into loyalty_account (id, customer_id, gems_balance, total_gems_earned, total_gems_redeemed)
      values (${account}, ${id}, 0, 0, 0)`),
  ])
  return { id, account }
}

/** An earned batch at `branchId`, expiring `days` from now (negative: lapsed). */
async function batch(account: string, branchId: string, gems: number, days: number) {
  const id = `${account}_b${next()}`
  await db.batch([
    db.execute(sql`
      insert into loyalty_transaction
        (id, loyalty_account_id, type, gems_amount, branch_id, description, expires_at, created_at)
      values (${id}, ${account}, 'earned', ${gems}, ${branchId}, 'ZZ batch',
              now() + make_interval(days => ${days}::int), now() - interval '1 day')`),
    db.execute(sql`
      update loyalty_account
         set gems_balance = gems_balance + ${gems}::int,
             total_gems_earned = total_gems_earned + ${gems}::int
       where id = ${account}`),
  ])
  return id
}

/** A pending ₹0 booking at `branchId` paid with `gems`. */
async function redeem(c: { id: string; account: string }, branchId: string, gems: number) {
  const n = next()
  const result = await redeemServiceWithGems({
    accountId: c.account,
    customerId: c.id,
    branchId,
    bookingNumber: `${PREFIX}_R${n}`,
    serviceType: 'salon',
    bookingDate: new Date('2099-02-01T00:00:00.000Z'),
    startTime: '10:00',
    endTime: '10:30',
    durationMinutes: 30,
    gemsRequired: gems,
    serviceId,
    serviceName: 'ZZ Gems Ledger IT service',
    staffId: staffAt(branchId),
    idempotencyKey: `${PREFIX}-key-${n}`,
    description: 'Redeemed: ZZ Gems Ledger IT',
    settingsRevision: 1,
  })
  if ('duplicate' in result) {
    throw new Error('unexpected replay')
  }
  return result.bookingId
}

async function taxVersion(branchId: string) {
  const version = await queryRow<{ id: string; rate_bps: number }>(sql`
    select id, rate_bps from branch_tax_version
     where branch_id = ${branchId} and sac_code = '999721'
     order by effective_from desc limit 1`)
  if (!version) {
    throw new Error(`${branchId} has no 999721 tax version`)
  }
  return version
}

/** Approve and complete a ₹0 redemption booking at its branch. */
async function completeFree(
  bookingId: string,
  branchId: string,
  customerId: string,
  settlement = DEFAULT,
) {
  await approveBooking(bookingId, branchId, ACTOR, staffAt(branchId))
  const version = await taxVersion(branchId)
  const now = new Date()
  return completeBookingWithInvoice({
    bookingId,
    changedById: ACTOR,
    settlement,
    invoice: {
      branchId,
      customerId,
      invoiceType: 'service',
      paymentMethod: 'cash',
      subtotalPaise: 0,
      discountAmountPaise: 0,
      taxableValuePaise: 0,
      gstAmountPaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      totalAmountPaise: 0,
      gemsEarned: 0,
      gemsRedemption: null,
      taxPointAt: now,
      financialYear: fixtureFinancialYear(now),
      taxReviewStatus: 'provisional',
    },
    items: [
      {
        serviceId,
        serviceNameSnapshot: 'ZZ Gems Ledger IT service',
        staffNameSnapshot: 'ZZ stylist',
        quantity: 1,
        unitPricePaise: 0,
        totalPricePaise: 0,
        displayOrder: 0,
        sacCode: '999721',
        taxVersionId: version.id,
        rateBps: version.rate_bps,
        discountPaise: 0,
        taxableValuePaise: 0,
        taxPaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
      },
    ],
  })
}

async function allocations(bookingId: string) {
  return queryRows<{ batch_id: string; gems: number; released: boolean }>(sql`
    select a.batch_id, a.gems, a.released_at is not null as released
      from loyalty_allocation a
      join loyalty_transaction r on r.id = a.redemption_id
     where r.booking_id = ${bookingId}
     order by a.created_at, a.batch_id`)
}

async function entries(bookingId: string) {
  return queryRows(sql`
    select kind, owing_branch_id, owed_branch_id, gems, gem_value_paise, value_paise,
           gst_share_paise, amount_owed_paise, share_bps
      from settlement_entry
     where booking_id = ${bookingId}
     order by owing_branch_id`)
}

async function account(id: string) {
  return queryRow<{ gems_balance: number; total_gems_redeemed: number }>(sql`
    select gems_balance, total_gems_redeemed from loyalty_account where id = ${id}`)
}

// Each test makes many sequential HTTP round trips to Neon; with every live
// suite running at once, 5 seconds isn't enough.
describe.skipIf(!LIVE)(
  'gems batches and their settlement against a live database',
  {
    timeout: 30_000,
  },
  () => {
    beforeAll(async () => {
      const owner = await queryRow<{ id: string }>(
        sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
      )
      const service = await queryRow<{ id: string }>(
        sql`select id from service where is_active = true order by id limit 1`,
      )
      serviceId = service?.id ?? ''
      const number = 9600 + Math.floor(Math.random() * 90)

      // People, branches and profiles together: the deferred role triggers check
      // them as a whole when the batch commits.
      await db.batch([
        db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${ACTOR}, 'ZZ Gems Ledger IT actor', ${`${ACTOR}@example.invalid`}, false, 'customer'),
               (${STYLIST_A}, 'ZZ Gems Ledger IT stylist A', ${`${STYLIST_A}@example.invalid`}, false, 'staff'),
               (${STYLIST_B}, 'ZZ Gems Ledger IT stylist B', ${`${STYLIST_B}@example.invalid`}, false, 'staff')`),
        db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order, owner_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Gems Ledger IT A', 'Test', '560100', '0000000000', 950, ${owner?.id ?? ''}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Gems Ledger IT B', 'Test', '560100', '0000000000', 951, ${owner?.id ?? ''})`),
        db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, role_witness, branch_id)
        values (${PROFILE_A}, ${STYLIST_A}, 'stylist', true, 'staff', ${BRANCH_A}),
               (${PROFILE_B}, ${STYLIST_B}, 'stylist', true, 'staff', ${BRANCH_B})`),
      ])
    })

    afterAll(async () => {
      const like = `${PREFIX}%`
      await db.batch([
        // Ledger rows can only be deleted in a test fixture (0022).
        db.execute(sql`select set_config('rgss.ledger_fixture', 'on', true)`),
        db.execute(
          sql`delete from settlement_entry where owing_branch_id like ${like} or owed_branch_id like ${like}`,
        ),
        db.execute(sql`
        delete from loyalty_allocation
         where batch_id in (select id from loyalty_transaction where loyalty_account_id like ${like})`),
        db.execute(sql`
        delete from loyalty_transaction
         where loyalty_account_id like ${like}
           and (batch_id is not null or redemption_id is not null)`),
        db.execute(sql`delete from loyalty_transaction where loyalty_account_id like ${like}`),
        db.execute(
          sql`delete from invoice_item where invoice_id in (select id from invoice where customer_id like ${like})`,
        ),
        db.execute(sql`delete from invoice where customer_id like ${like}`),
        db.execute(
          sql`delete from booking_status_log where booking_id in (select id from booking where customer_id like ${like})`,
        ),
        db.execute(
          sql`delete from booking_service where booking_id in (select id from booking where customer_id like ${like})`,
        ),
        db.execute(sql`delete from booking where customer_id like ${like}`),
        db.execute(sql`delete from loyalty_account where id like ${like}`),
        db.execute(sql`delete from staff_profile where id like ${like}`),
        db.execute(sql`delete from branch where id like ${like}`),
        db.execute(sql`delete from "user" where id like ${like}`),
      ])
      expect(
        await queryRow(sql`
        select (select count(*) from settlement_entry
                 where owing_branch_id like ${like} or owed_branch_id like ${like}) as entries,
               (select count(*) from loyalty_transaction where loyalty_account_id like ${like}) as transactions,
               (select count(*) from booking where customer_id like ${like}) as bookings,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
      ).toEqual({ entries: '0', transactions: '0', bookings: '0', branches: '0', users: '0' })
    })

    it('makes A owe B ₹1.00 a gem for gems issued at A and spent at B; B’s own gems are internal (ST-01)', async () => {
      const c = await customer('st01')
      await batch(c.account, BRANCH_A, 500, 100)
      const first = await redeem(c, BRANCH_B, 500)
      expect(await entries(first)).toEqual([])

      await completeFree(first, BRANCH_B, c.id)
      expect(await entries(first)).toEqual([
        {
          kind: 'gems_redemption',
          owing_branch_id: BRANCH_A,
          owed_branch_id: BRANCH_B,
          gems: 500,
          gem_value_paise: 100,
          value_paise: '50000',
          gst_share_paise: '0',
          amount_owed_paise: '50000',
          share_bps: 10_000,
        },
      ])

      await batch(c.account, BRANCH_B, 200, 100)
      const second = await redeem(c, BRANCH_B, 200)
      await completeFree(second, BRANCH_B, c.id)
      expect(await entries(second)).toEqual([
        expect.objectContaining({ owing_branch_id: BRANCH_B, owed_branch_id: BRANCH_B, gems: 200 }),
      ])
    })

    it('spends the earliest-expiring gems first, with one entry per earning branch (ST-02)', async () => {
      const c = await customer('st02')
      const a1 = await batch(c.account, BRANCH_A, 300, 100)
      const b1 = await batch(c.account, BRANCH_B, 400, 50)
      await batch(c.account, BRANCH_A, 500, 200)

      const booking = await redeem(c, BRANCH_B, 600)
      expect(await allocations(booking)).toEqual([
        { batch_id: a1, gems: 200, released: false },
        { batch_id: b1, gems: 400, released: false },
      ])
      expect(await account(c.account)).toEqual({ gems_balance: 600, total_gems_redeemed: 600 })

      await completeFree(booking, BRANCH_B, c.id)
      expect(await entries(booking)).toEqual([
        expect.objectContaining({ owing_branch_id: BRANCH_A, owed_branch_id: BRANCH_B, gems: 200 }),
        expect.objectContaining({ owing_branch_id: BRANCH_B, owed_branch_id: BRANCH_B, gems: 400 }),
      ])
    })

    it('gives back the gems of a rejected, cancelled or missed redemption, with no entry (ST-03)', async () => {
      const c = await customer('st03')
      const a1 = await batch(c.account, BRANCH_A, 300, 100)

      const rejected = await redeem(c, BRANCH_A, 300)
      expect(await account(c.account)).toEqual({ gems_balance: 0, total_gems_redeemed: 300 })
      await rejectBooking(rejected, BRANCH_A, ACTOR, 'Fully booked')
      expect(await allocations(rejected)).toEqual([{ batch_id: a1, gems: 300, released: true }])
      expect(await account(c.account)).toEqual({ gems_balance: 300, total_gems_redeemed: 0 })

      const cancelled = await redeem(c, BRANCH_A, 300)
      await cancelBooking(cancelled, c.id, 'Changed plans')
      expect(await account(c.account)).toEqual({ gems_balance: 300, total_gems_redeemed: 0 })

      const missed = await redeem(c, BRANCH_A, 300)
      await approveBooking(missed, BRANCH_A, ACTOR, PROFILE_A)
      await markBookingNoShow(missed, BRANCH_A, ACTOR)
      expect(await account(c.account)).toEqual({ gems_balance: 300, total_gems_redeemed: 0 })

      // Each return is one 'returned' row naming its redemption; none settles.
      expect(
        await queryRow(sql`
        select count(*) filter (where type = 'returned') as returned,
               coalesce(sum(gems_amount) filter (where type = 'returned'), 0) as returned_gems
          from loyalty_transaction where loyalty_account_id = ${c.account}`),
      ).toEqual({ returned: '3', returned_gems: '900' })
      for (const booking of [rejected, cancelled, missed]) {
        expect(await entries(booking)).toEqual([])
      }

      // A second rejection of the same booking returns nothing again.
      await expect(rejectBooking(rejected, BRANCH_A, ACTOR, 'Again')).rejects.toMatchObject({
        statusCode: 409,
      })
      expect(await account(c.account)).toEqual({ gems_balance: 300, total_gems_redeemed: 0 })
    })

    it('expires straight away the returned gems of a batch that lapsed meanwhile (ST-03)', async () => {
      const c = await customer('st03b')
      const a1 = await batch(c.account, BRANCH_A, 300, 100)
      const booking = await redeem(c, BRANCH_A, 300)
      await db.execute(
        sql`update loyalty_transaction set expires_at = now() - interval '1 minute' where id = ${a1}`,
      )

      await rejectBooking(booking, BRANCH_A, ACTOR, 'Closed that day')
      expect(await account(c.account)).toEqual({ gems_balance: 0, total_gems_redeemed: 0 })
      expect(
        await queryRows(sql`
        select type, gems_amount, batch_id, branch_id from loyalty_transaction
         where loyalty_account_id = ${c.account} and type in ('returned', 'expired')
         order by type desc`),
      ).toEqual([
        { type: 'returned', gems_amount: 300, batch_id: null, branch_id: BRANCH_A },
        { type: 'expired', gems_amount: -300, batch_id: a1, branch_id: BRANCH_A },
      ])
    })

    it('expires only unspent gems and keeps the balance right; a rerun expires nothing (ST-04)', async () => {
      const c = await customer('st04')
      const spent = await batch(c.account, BRANCH_A, 200, 1)
      const unspent = await batch(c.account, BRANCH_B, 100, -1)
      await redeem(c, BRANCH_A, 200)
      // The fully spent batch lapses after it was spent.
      await db.execute(
        sql`update loyalty_transaction set expires_at = now() - interval '1 minute' where id = ${spent}`,
      )
      expect(await account(c.account)).toEqual({ gems_balance: 100, total_gems_redeemed: 200 })

      const run = await expireLapsedGems()
      expect(run.gems).toBeGreaterThanOrEqual(100)
      expect(await account(c.account)).toEqual({ gems_balance: 0, total_gems_redeemed: 200 })
      expect(
        await queryRows(sql`
        select batch_id, gems_amount, branch_id from loyalty_transaction
         where loyalty_account_id = ${c.account} and type = 'expired'`),
      ).toEqual([{ batch_id: unspent, gems_amount: -100, branch_id: BRANCH_B }])

      await expireLapsedGems()
      expect(await account(c.account)).toEqual({ gems_balance: 0, total_gems_redeemed: 200 })
      expect(
        await queryRow(sql`
        select count(*) as n from loyalty_transaction
         where loyalty_account_id = ${c.account} and type = 'expired'`),
      ).toEqual({ n: '1' })
    })

    it('stores the value per gem and share on each entry, so later changes leave it alone (ST-05)', async () => {
      const c = await customer('st05')
      await batch(c.account, BRANCH_A, 1000, 100)
      const before = await redeem(c, BRANCH_B, 500)
      await completeFree(before, BRANCH_B, c.id)
      const after = await redeem(c, BRANCH_B, 500)
      await completeFree(after, BRANCH_B, c.id, { shareBps: 8000, gemValuePaise: 150 })

      expect(await entries(before)).toEqual([
        expect.objectContaining({
          gem_value_paise: 100,
          share_bps: 10_000,
          amount_owed_paise: '50000',
        }),
      ])
      expect(await entries(after)).toEqual([
        expect.objectContaining({
          gem_value_paise: 150,
          share_bps: 8000,
          value_paise: '75000',
          amount_owed_paise: '60000',
        }),
      ])
    })

    it('never lets two concurrent redemptions spend the same gems (ST-06)', async () => {
      const c = await customer('st06')
      await batch(c.account, BRANCH_A, 500, 100)

      const contested = await Promise.allSettled([
        redeem(c, BRANCH_A, 300),
        redeem(c, BRANCH_A, 300),
      ])
      expect(contested.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const refused = contested.find((r) => r.status === 'rejected')
      expect((refused as PromiseRejectedResult).reason).toMatchObject({
        code: 'GEMS_INSUFFICIENT_BALANCE',
      })

      const both = await Promise.allSettled([redeem(c, BRANCH_A, 100), redeem(c, BRANCH_A, 100)])
      expect(both.every((r) => r.status === 'fulfilled')).toBe(true)

      expect(await account(c.account)).toEqual({ gems_balance: 0, total_gems_redeemed: 500 })
      expect(
        await queryRow(sql`
        select coalesce(sum(a.gems), 0) as allocated, loyalty_batch_unspent(min(a.batch_id)) as unspent
          from loyalty_allocation a
          join loyalty_transaction r on r.id = a.redemption_id
         where r.loyalty_account_id = ${c.account} and a.released_at is null`),
      ).toEqual({ allocated: '500', unspent: '0' })
    })

    it('spends checkout gems from batches before the invoice’s own gems are earned', async () => {
      const c = await customer('checkout')
      const a1 = await batch(c.account, BRANCH_A, 500, 100)
      const created = await db.execute<{ id: string }>(sql`
      insert into booking (id, booking_number, branch_id, customer_id, status, service_type,
                           booking_date, start_time, end_time, total_amount_paise,
                           total_duration_minutes)
      values (${`${PREFIX}_bk_checkout`}, ${`${PREFIX}_CO`}, ${BRANCH_B}, ${c.id}, 'confirmed', 'salon',
              '2099-02-02', '10:00', '11:00', 150000, 60)
      returning id`)
      const bookingId = created.rows[0]?.id ?? ''
      await db.execute(sql`
      insert into booking_service (id, booking_id, service_id, staff_id, service_name_snapshot,
                                   price_at_booking_paise, duration_minutes, display_order)
      values (${`${bookingId}_s1`}, ${bookingId}, ${serviceId}, ${PROFILE_B}, 'ZZ redeemed', 50000, 30, 0),
             (${`${bookingId}_s2`}, ${bookingId}, ${serviceId}, ${PROFILE_B}, 'ZZ paid', 100000, 30, 1)`)

      const version = await taxVersion(BRANCH_B)
      const paid = splitFixtureTax(100_000, version.rate_bps)
      const now = new Date()
      const line = (index: number, gross: number, tax: ReturnType<typeof splitFixtureTax>) => ({
        serviceId,
        serviceNameSnapshot: index === 0 ? 'ZZ redeemed' : 'ZZ paid',
        staffNameSnapshot: 'ZZ stylist',
        quantity: 1,
        unitPricePaise: index === 0 ? 50_000 : 100_000,
        totalPricePaise: gross,
        displayOrder: index,
        sacCode: '999721',
        taxVersionId: version.id,
        rateBps: version.rate_bps,
        discountPaise: 0,
        taxableValuePaise: tax.taxablePaise,
        taxPaise: tax.taxPaise,
        cgstPaise: tax.cgstPaise,
        sgstPaise: tax.sgstPaise,
      })
      const zero = { taxablePaise: 0, taxPaise: 0, cgstPaise: 0, sgstPaise: 0 }
      await completeBookingWithInvoice({
        bookingId,
        changedById: ACTOR,
        settlement: DEFAULT,
        invoice: {
          branchId: BRANCH_B,
          customerId: c.id,
          invoiceType: 'service',
          paymentMethod: 'upi',
          subtotalPaise: 100_000,
          discountAmountPaise: 0,
          taxableValuePaise: paid.taxablePaise,
          gstAmountPaise: paid.taxPaise,
          cgstPaise: paid.cgstPaise,
          sgstPaise: paid.sgstPaise,
          totalAmountPaise: 100_000,
          gemsEarned: 10,
          gemsRedemption: { serviceId, gemsRequired: 500 },
          taxPointAt: now,
          financialYear: fixtureFinancialYear(now),
          taxReviewStatus: 'provisional',
        },
        items: [line(0, 0, zero), line(1, 100_000, paid)],
      })

      expect(await allocations(bookingId)).toEqual([{ batch_id: a1, gems: 500, released: false }])
      expect(await entries(bookingId)).toEqual([
        expect.objectContaining({ owing_branch_id: BRANCH_A, owed_branch_id: BRANCH_B, gems: 500 }),
      ])
      // The 10 gems earned on the invoice are a new batch at B, untouched.
      expect(
        await queryRow(sql`
        select branch_id, gems_amount, loyalty_batch_unspent(id) as unspent
          from loyalty_transaction
         where loyalty_account_id = ${c.account} and type = 'earned' and id <> ${a1}`),
      ).toEqual({ branch_id: BRANCH_B, gems_amount: 10, unspent: '10' })
      expect(await account(c.account)).toEqual({ gems_balance: 10, total_gems_redeemed: 500 })
    })

    it('refuses gems a lapsed batch still shows in the balance, writing nothing', async () => {
      const c = await customer('lapsed')
      await batch(c.account, BRANCH_A, 300, -1)
      expect(await account(c.account)).toEqual({ gems_balance: 300, total_gems_redeemed: 0 })

      await expect(redeem(c, BRANCH_A, 300)).rejects.toMatchObject({
        code: 'GEMS_INSUFFICIENT_BALANCE',
        statusCode: 409,
      })
      expect(await account(c.account)).toEqual({ gems_balance: 300, total_gems_redeemed: 0 })
      expect(
        await queryRow(sql`select count(*) as n from booking where customer_id = ${c.id}`),
      ).toEqual({ n: '0' })
    })

    it('refuses at the database any spend or expiry a batch can’t cover', async () => {
      const c = await customer('guards')
      const a1 = await batch(c.account, BRANCH_A, 100, 100)
      const lapsed = await batch(c.account, BRANCH_A, 100, -1)
      const booking = await redeem(c, BRANCH_A, 100)
      const redemption = await queryRow<{ id: string }>(
        sql`select id from loyalty_transaction where booking_id = ${booking} and type = 'redeemed'`,
      )
      const message = async (query: Promise<unknown>) =>
        query.then(
          () => 'no error',
          (error: unknown) => {
            let current = error as { message?: string; cause?: unknown }
            let text = current.message ?? ''
            while (current.cause) {
              current = current.cause as { message?: string; cause?: unknown }
              text += ` | ${current.message ?? ''}`
            }
            return text
          },
        )

      // The batch is fully spent: one more gem from it is refused.
      expect(
        await message(
          db.execute(sql`
          insert into loyalty_allocation (redemption_id, batch_id, gems)
          values (${redemption?.id ?? ''}, ${lapsed}, 1)`),
        ),
      ).toMatch(/had expired/)
      expect(
        await message(
          db.execute(sql`
          update loyalty_allocation set released_at = now() - interval '1 day', gems = 99
           where batch_id = ${a1}`),
        ),
      ).toMatch(/only be released/)
      expect(
        await message(db.execute(sql`delete from loyalty_allocation where batch_id = ${a1}`)),
      ).toMatch(/can't be deleted/)
      expect(
        await message(
          db.execute(sql`
          insert into loyalty_transaction (id, loyalty_account_id, type, gems_amount, batch_id)
          values (${`${c.account}_x1`}, ${c.account}, 'expired', -1, ${a1})`),
        ),
      ).toMatch(/not expired yet/)
      expect(
        await message(
          db.execute(sql`
          insert into loyalty_transaction (id, loyalty_account_id, type, gems_amount, batch_id)
          values (${`${c.account}_x2`}, ${c.account}, 'expired', -101, ${lapsed})`),
        ),
      ).toMatch(/fewer unspent gems/)
      expect(
        await message(
          db.execute(sql`update loyalty_account set gems_balance = -1 where id = ${c.account}`),
        ),
      ).toMatch(/loyalty_account_balance_check/)
    })
  },
)
