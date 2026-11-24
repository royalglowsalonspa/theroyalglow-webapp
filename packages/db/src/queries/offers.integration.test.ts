/************************************************************
 * Module Name  : offers.integration.test
 * Scope        : Integration test — offers at checkout (REAL db,
 *                multi-branch tasks §6, offers.md, migrations 0035–0036)
 *
 * Description  : Against Neon dev with two throwaway branches A and B and
 *                Payload offer mirrors (`cms_offer_<cms id>`):
 *                  - a completion with an offer records the redemption, the
 *                    booking's offer and the invoice's snapshot of the rule;
 *                  - an offer retired, or ended, before the write is refused
 *                    with OFFER_EXPIRED and nothing is written;
 *                  - a second offer the same IST day, at the other branch, is
 *                    refused with OFFER_NOT_APPLICABLE and rolled back;
 *                  - of two checkouts at the same moment, exactly one takes
 *                    an offer;
 *                  - an issued invoice's offer snapshot can't change, while
 *                    its notes still can;
 *                  - the database refuses a malformed mirror and a partial or
 *                    empty invoice snapshot.
 *
 * Skip behaviour : Skips without packages/db/.env (CI). Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : Prefixed `of_it_<run>` rows, plus mirrors whose cms ids are
 *                drawn at random above 900,000 (the mirror check ties a
 *                mirror's id to its cms id, so they can't carry the prefix).
 *                Deleted in one transaction in afterAll under the test
 *                fixture switch (migration 0022), then zero residue is
 *                proven. The branches reuse the primary branch's Owner.
 ************************************************************/

import type { SettlementSetting } from '@rgss/types'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { fixtureFinancialYear, splitFixtureTax } from '../test/issued-invoice'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import { completeBookingWithInvoice } from './admin-bookings'
import { findDriverError, SQLSTATE } from './driver-errors'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `of_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const ACTOR = `${PREFIX}_actor`
const STYLIST_A = `${PREFIX}_sty_a`
const STYLIST_B = `${PREFIX}_sty_b`
const PROFILE_A = `${STYLIST_A}_p`
const PROFILE_B = `${STYLIST_B}_p`
const DEFAULT: SettlementSetting = { shareBps: 10_000, gemValuePaise: 100 }
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const LINE_PAISE = 100_000

// Ten cms ids for this run: CMS to CMS + 9.
const CMS = 900_000 + Math.floor(Math.random() * 90_000)

/** An offer as checkout applies it, with what it takes off the one line. */
type Applied = {
  id: string
  name: string
  type: 'percentage' | 'flat' | 'combo_price'
  value: number
  savesPaise: number
}

const FLAT: Applied = {
  id: `cms_offer_${CMS}`,
  name: 'ZZ Offers IT ₹200 off',
  type: 'flat',
  value: 20_000,
  savesPaise: 20_000,
}
const PERCENT: Applied = {
  id: `cms_offer_${CMS + 1}`,
  name: 'ZZ Offers IT 10% off',
  type: 'percentage',
  value: 10,
  savesPaise: 10_000,
}
const RETIRED: Applied = {
  id: `cms_offer_${CMS + 2}`,
  name: 'ZZ Offers IT retired',
  type: 'flat',
  value: 5000,
  savesPaise: 5000,
}
const ENDED: Applied = {
  id: `cms_offer_${CMS + 3}`,
  name: 'ZZ Offers IT ended',
  type: 'flat',
  value: 5000,
  savesPaise: 5000,
}

let serviceId = ''
let serial = 0

function next(): number {
  serial += 1
  return serial
}

/** The IST calendar day `days` from today, as `YYYY-MM-DD`. */
function istDay(days = 0): string {
  return new Date(Date.now() + IST_OFFSET_MS + days * DAY_MS).toISOString().slice(0, 10)
}

/** The stylist who works at the branch. */
function staffAt(branchId: string): string {
  return branchId === BRANCH_A ? PROFILE_A : PROFILE_B
}

async function customer(name: string): Promise<string> {
  const id = `${PREFIX}_c_${name}`
  await db.execute(sql`
    insert into "user" (id, name, email, email_verified, role)
    values (${id}, ${`ZZ Offers IT ${name}`}, ${`${id}@example.invalid`}, false, 'customer')`)
  return id
}

type Booked = { id: string; branchId: string; customerId: string }

/**
 * A confirmed salon booking at `branchId` with one ₹1,000 line, each on its
 * own day so the stylist is never booked twice at once (0028).
 */
async function book(customerId: string, branchId: string): Promise<Booked> {
  const n = next()
  const id = `${PREFIX}_bk${n}`
  await db.batch([
    db.execute(sql`
      insert into booking (id, booking_number, branch_id, customer_id, status, service_type,
                           booking_date, start_time, end_time, total_amount_paise,
                           total_duration_minutes)
      values (${id}, ${`${PREFIX}_N${n}`}, ${branchId}, ${customerId}, 'confirmed', 'salon',
              ${`2099-04-${String(n).padStart(2, '0')}`}, '10:00', '11:00', ${LINE_PAISE}, 60)`),
    db.execute(sql`
      insert into booking_service (id, booking_id, service_id, staff_id, service_name_snapshot,
                                   price_at_booking_paise, duration_minutes, display_order)
      values (${`${id}_s1`}, ${id}, ${serviceId}, ${staffAt(branchId)}, 'ZZ Offers IT service',
              ${LINE_PAISE}, 60, 0)`),
  ])
  return { id, branchId, customerId }
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

/**
 * Complete `booked` with `applied` (or no offer), its saving taken off the one
 * line and the tax worked out inside what is left, as checkout computes it.
 */
async function complete(booked: Booked, applied: Applied | null) {
  const version = await taxVersion(booked.branchId)
  const discountPaise = applied?.savesPaise ?? 0
  const net = LINE_PAISE - discountPaise
  const tax = splitFixtureTax(net, version.rate_bps)
  const now = new Date()
  return completeBookingWithInvoice({
    bookingId: booked.id,
    changedById: ACTOR,
    settlement: DEFAULT,
    invoice: {
      branchId: booked.branchId,
      customerId: booked.customerId,
      invoiceType: 'service',
      paymentMethod: 'cash',
      subtotalPaise: LINE_PAISE,
      discountAmountPaise: discountPaise,
      taxableValuePaise: tax.taxablePaise,
      gstAmountPaise: tax.taxPaise,
      cgstPaise: tax.cgstPaise,
      sgstPaise: tax.sgstPaise,
      totalAmountPaise: net,
      gemsEarned: 0,
      gemsRedemption: null,
      taxPointAt: now,
      financialYear: fixtureFinancialYear(now),
      taxReviewStatus: 'provisional',
      offer: applied
        ? {
            id: applied.id,
            name: applied.name,
            type: applied.type,
            value: applied.value,
            redeemedOn: istDay(),
          }
        : null,
    },
    items: [
      {
        serviceId,
        serviceNameSnapshot: 'ZZ Offers IT service',
        staffNameSnapshot: 'ZZ stylist',
        quantity: 1,
        unitPricePaise: LINE_PAISE,
        totalPricePaise: LINE_PAISE,
        displayOrder: 0,
        sacCode: '999721',
        taxVersionId: version.id,
        rateBps: version.rate_bps,
        discountPaise,
        taxableValuePaise: tax.taxablePaise,
        taxPaise: tax.taxPaise,
        cgstPaise: tax.cgstPaise,
        sgstPaise: tax.sgstPaise,
      },
    ],
  })
}

/** What became of `booked`: its status and offer, its invoices, the customer's redemptions. */
async function outcome(booked: Booked) {
  return queryRow<{
    status: string
    offer_id: string | null
    invoices: string
    redemptions: string
  }>(
    sql`
    select b.status, b.offer_id,
           (select count(*) from invoice i where i.booking_id = b.id) as invoices,
           (select count(*) from offer_redemption r where r.customer_id = b.customer_id) as redemptions
      from booking b
     where b.id = ${booked.id}`,
  )
}

/** `SQLSTATE constraint` (or the message, for a trigger) the database refused `write` with, or 'written'. */
async function refusedBy(write: Promise<unknown>): Promise<string> {
  try {
    await write
  } catch (error) {
    const found = findDriverError(error, [SQLSTATE.checkViolation])
    if (found) {
      return `${String(found.code)} ${String(found.constraint ?? found.message)}`
    }
    throw error
  }
  return 'written'
}

/** A mirror the CMS would never write; `id` and `cmsId` disagree unless given alike. */
function mirror(
  label: string,
  row: {
    id: string
    cmsId: number
    type: 'percentage' | 'flat' | 'combo_price'
    percentage?: number | null
    amount?: number | null
    combo?: number | null
    start?: string
    end?: string
  },
) {
  return db.execute(sql`
    insert into offer (id, name, slug, offer_type, discount_percentage, discount_amount_paise,
                       combo_price_paise, start_date, end_date, cms_id)
    values (${row.id}, 'ZZ Offers IT malformed', ${`${PREFIX}-bad-${label}`}, ${row.type},
            ${row.percentage ?? null}, ${row.amount ?? null}, ${row.combo ?? null},
            ${row.start ?? istDay()}, ${row.end ?? istDay(1)}, ${row.cmsId})`)
}

// Each test makes many sequential HTTP round trips to Neon; with every live
// suite running at once, 5 seconds isn't enough.
describe.skipIf(!LIVE)('offers at checkout against a live database', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    const owner = await queryRow<{ id: string }>(
      sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
    )
    // A salon service every branch offers, so the new branches do too (0034).
    const service = await queryRow<{ id: string }>(sql`
      select s.id from service s join service_category c on c.id = s.category_id
       where s.is_active and c.is_active and s.all_branches and c.all_branches
         and c.service_type = 'salon'
       order by s.id limit 1`)
    serviceId = service?.id ?? ''
    const number = 9700 + Math.floor(Math.random() * 90)

    // People, branches and profiles together: the deferred role triggers check
    // them as a whole when the batch commits.
    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${ACTOR}, 'ZZ Offers IT actor', ${`${ACTOR}@example.invalid`}, false, 'customer'),
               (${STYLIST_A}, 'ZZ Offers IT stylist A', ${`${STYLIST_A}@example.invalid`}, false, 'staff'),
               (${STYLIST_B}, 'ZZ Offers IT stylist B', ${`${STYLIST_B}@example.invalid`}, false, 'staff')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order, owner_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Offers IT A', 'Test', '560100', '0000000000', 960, ${owner?.id ?? ''}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Offers IT B', 'Test', '560100', '0000000000', 961, ${owner?.id ?? ''})`),
      db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, role_witness, branch_id)
        values (${PROFILE_A}, ${STYLIST_A}, 'stylist', true, 'staff', ${BRANCH_A}),
               (${PROFILE_B}, ${STYLIST_B}, 'stylist', true, 'staff', ${BRANCH_B})`),
    ])

    // The mirrors as the CMS sync writes them, each linked to the service.
    await db.batch([
      db.execute(sql`
        insert into offer (id, name, slug, offer_type, discount_percentage, discount_amount_paise,
                           start_date, end_date, is_active, cms_id)
        values (${FLAT.id}, ${FLAT.name}, ${`cms-offer-${CMS}`}, 'flat', null, ${FLAT.value},
                ${istDay(-1)}, ${istDay(30)}, true, ${CMS}),
               (${PERCENT.id}, ${PERCENT.name}, ${`cms-offer-${CMS + 1}`}, 'percentage', ${PERCENT.value}, null,
                ${istDay(-1)}, ${istDay(30)}, true, ${CMS + 1}),
               (${RETIRED.id}, ${RETIRED.name}, ${`cms-offer-${CMS + 2}`}, 'flat', null, ${RETIRED.value},
                ${istDay(-1)}, ${istDay(30)}, true, ${CMS + 2}),
               (${ENDED.id}, ${ENDED.name}, ${`cms-offer-${CMS + 3}`}, 'flat', null, ${ENDED.value},
                ${istDay(-10)}, ${istDay(-1)}, true, ${CMS + 3})`),
      db.execute(sql`
        insert into offer_service (offer_id, service_id)
        values (${FLAT.id}, ${serviceId}), (${PERCENT.id}, ${serviceId}),
               (${RETIRED.id}, ${serviceId}), (${ENDED.id}, ${serviceId})`),
    ])
  }, 60_000)

  afterAll(async () => {
    const like = `${PREFIX}%`
    const mirrors = sql`(select id from offer where cms_id between ${CMS} and ${CMS + 9} or id like ${like})`
    await db.batch([
      // Ledger and invoice rows can only be deleted in a test fixture (0022).
      db.execute(sql`select set_config('rgss.ledger_fixture', 'on', true)`),
      db.execute(
        sql`delete from invoice_item where invoice_id in (select id from invoice where customer_id like ${like})`,
      ),
      db.execute(sql`delete from invoice where customer_id like ${like}`),
      db.execute(sql`delete from offer_redemption where customer_id like ${like}`),
      db.execute(
        sql`delete from booking_status_log where booking_id in (select id from booking where customer_id like ${like})`,
      ),
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where customer_id like ${like})`,
      ),
      db.execute(sql`delete from booking where customer_id like ${like}`),
      db.execute(sql`delete from offer_service where offer_id in ${mirrors}`),
      db.execute(sql`delete from offer where id in ${mirrors}`),
      db.execute(sql`delete from staff_profile where id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from invoice where customer_id like ${like}) as invoices,
               (select count(*) from offer_redemption where customer_id like ${like}) as redemptions,
               (select count(*) from booking where customer_id like ${like}) as bookings,
               (select count(*) from offer where cms_id between ${CMS} and ${CMS + 9} or id like ${like}) as offers,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({
      invoices: '0',
      redemptions: '0',
      bookings: '0',
      offers: '0',
      branches: '0',
      users: '0',
    })
  }, 60_000)

  it('records the redemption, the booking’s offer and the invoice’s snapshot of the rule', async () => {
    const c = await customer('records')
    const booked = await book(c, BRANCH_A)
    const done = await complete(booked, FLAT)
    expect(done?.booking?.status).toBe('completed')

    expect(await outcome(booked)).toEqual({
      status: 'completed',
      offer_id: FLAT.id,
      invoices: '1',
      redemptions: '1',
    })
    expect(
      await queryRows(sql`
        select offer_id, booking_id, to_char(redeemed_date, 'YYYY-MM-DD') as day
          from offer_redemption where customer_id = ${c}`),
    ).toEqual([{ offer_id: FLAT.id, booking_id: booked.id, day: istDay() }])

    const version = await taxVersion(BRANCH_A)
    const tax = splitFixtureTax(80_000, version.rate_bps)
    expect(
      await queryRow(sql`
        select offer_id, offer_name_snapshot, offer_type_snapshot::text as offer_type_snapshot,
               offer_value_snapshot, subtotal_paise, discount_amount_paise, taxable_value_paise,
               gst_amount_paise, total_amount_paise
          from invoice where booking_id = ${booked.id}`),
    ).toEqual({
      offer_id: FLAT.id,
      offer_name_snapshot: FLAT.name,
      offer_type_snapshot: 'flat',
      offer_value_snapshot: 20_000,
      subtotal_paise: 100_000,
      discount_amount_paise: 20_000,
      taxable_value_paise: tax.taxablePaise,
      gst_amount_paise: tax.taxPaise,
      total_amount_paise: 80_000,
    })
    expect(
      await queryRow(sql`
        select ii.total_price_paise, ii.discount_paise, ii.taxable_value_paise, ii.tax_paise
          from invoice_item ii join invoice i on i.id = ii.invoice_id
         where i.booking_id = ${booked.id}`),
    ).toEqual({
      total_price_paise: 100_000,
      discount_paise: 20_000,
      taxable_value_paise: tax.taxablePaise,
      tax_paise: tax.taxPaise,
    })
    // At the seeded 5%, ₹800.00 holds ₹761.90 taxable and ₹38.10 tax.
    if (version.rate_bps === 500) {
      expect(tax).toEqual({
        taxablePaise: 76_190,
        taxPaise: 3810,
        cgstPaise: 1905,
        sgstPaise: 1905,
      })
    }
  })

  it('refuses an offer retired or ended before the write with OFFER_EXPIRED, writing nothing', async () => {
    const c = await customer('expired')
    const booked = await book(c, BRANCH_A)
    // Retired in the CMS after the route offered it.
    await db.execute(sql`update offer set is_active = false where id = ${RETIRED.id}`)

    await expect(complete(booked, RETIRED)).rejects.toMatchObject({
      code: 'OFFER_EXPIRED',
      statusCode: 409,
    })
    await expect(complete(booked, ENDED)).rejects.toMatchObject({
      code: 'OFFER_EXPIRED',
      statusCode: 409,
    })
    expect(await outcome(booked)).toEqual({
      status: 'confirmed',
      offer_id: null,
      invoices: '0',
      redemptions: '0',
    })
  })

  it('refuses a second offer the same IST day at the other branch, rolling that checkout back', async () => {
    const c = await customer('twice')
    const first = await book(c, BRANCH_A)
    const second = await book(c, BRANCH_B)
    await complete(first, FLAT)

    await expect(complete(second, PERCENT)).rejects.toMatchObject({
      code: 'OFFER_NOT_APPLICABLE',
      statusCode: 409,
    })
    expect(await outcome(second)).toEqual({
      status: 'confirmed',
      offer_id: null,
      invoices: '0',
      redemptions: '1',
    })

    // Nothing was left half-written: it completes without the offer.
    const done = await complete(second, null)
    expect(done?.invoice?.totalAmountPaise).toBe(LINE_PAISE)
    expect(await outcome(second)).toEqual({
      status: 'completed',
      offer_id: null,
      invoices: '1',
      redemptions: '1',
    })
  })

  it('lets exactly one of two simultaneous checkouts take an offer', async () => {
    const c = await customer('race')
    const atA = await book(c, BRANCH_A)
    const atB = await book(c, BRANCH_B)

    const results = await Promise.allSettled([complete(atA, FLAT), complete(atB, PERCENT)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(refused).toHaveLength(1)
    expect(refused[0]?.reason).toMatchObject({ code: 'OFFER_NOT_APPLICABLE', statusCode: 409 })

    expect(
      await queryRow(sql`
        select (select count(*) from offer_redemption where customer_id = ${c}) as redemptions,
               (select count(*) from invoice where customer_id = ${c}) as invoices,
               (select count(*) from booking where customer_id = ${c} and status = 'completed') as completed`),
    ).toEqual({ redemptions: '1', invoices: '1', completed: '1' })
  })

  it('keeps an issued invoice’s offer snapshot fixed, while its notes may still be recorded', async () => {
    const c = await customer('fixed')
    const done = await complete(await book(c, BRANCH_A), FLAT)
    const id = done?.invoice?.id ?? ''
    const fixed = /^23514 invoice .+ is issued; its facts can't change$/

    expect(
      await refusedBy(
        db.execute(sql`update invoice set offer_name_snapshot = 'ZZ renamed' where id = ${id}`),
      ),
    ).toMatch(fixed)
    expect(
      await refusedBy(
        db.execute(sql`update invoice set offer_value_snapshot = 1 where id = ${id}`),
      ),
    ).toMatch(fixed)
    expect(
      await refusedBy(
        db.execute(sql`
          update invoice
             set offer_id = null, offer_name_snapshot = null, offer_type_snapshot = null,
                 offer_value_snapshot = null
           where id = ${id}`),
      ),
    ).toMatch(fixed)
    expect(
      await refusedBy(db.execute(sql`update invoice set notes = 'ZZ note' where id = ${id}`)),
    ).toBe('written')
  })

  it('refuses a malformed mirror', async () => {
    const free = `cms_offer_${CMS + 9}`
    const refusals = await Promise.all([
      // Its id names another cms id.
      refusedBy(
        mirror('id', { id: `cms_offer_${CMS + 8}`, cmsId: CMS + 9, type: 'flat', amount: 100 }),
      ),
      // A percentage with an amount besides.
      refusedBy(
        mirror('both', {
          id: free,
          cmsId: CMS + 9,
          type: 'percentage',
          percentage: 10,
          amount: 100,
        }),
      ),
      // More than all of it, or none.
      refusedBy(mirror('over', { id: free, cmsId: CMS + 9, type: 'percentage', percentage: 101 })),
      refusedBy(mirror('none', { id: free, cmsId: CMS + 9, type: 'flat', amount: 0 })),
      // A combo with no price.
      refusedBy(mirror('combo', { id: free, cmsId: CMS + 9, type: 'combo_price' })),
      // Ending before it starts.
      refusedBy(
        mirror('dates', {
          id: free,
          cmsId: CMS + 9,
          type: 'flat',
          amount: 100,
          start: istDay(1),
          end: istDay(),
        }),
      ),
    ])
    expect(refusals).toEqual(Array.from({ length: 6 }, () => '23514 offer_cms_rule_check'))
  })

  it('refuses an invoice snapshot with nothing off, or with part of the rule missing', async () => {
    const c = await customer('snapshot')
    const booked = await book(c, BRANCH_A)
    // A rule taking nothing off, through the checkout write.
    expect(await refusedBy(complete(booked, { ...FLAT, value: 0 }))).toBe(
      '23514 invoice_offer_snapshot_check',
    )
    expect(await outcome(booked)).toEqual({
      status: 'confirmed',
      offer_id: null,
      invoices: '0',
      redemptions: '0',
    })

    // An issued ₹0 invoice naming its offer but not the offer's name.
    const now = new Date()
    expect(
      await refusedBy(
        db.execute(sql`
          insert into invoice (id, invoice_number, branch_id, booking_id, customer_id, invoice_type,
                               subtotal_paise, discount_amount_paise, taxable_value_paise,
                               gst_amount_paise, cgst_paise, sgst_paise, total_amount_paise,
                               payment_status, paid_at, created_at, tax_point_at, financial_year,
                               sequence_number, tax_review_status, issuer_name, issuer_gstin,
                               issuer_address, issuer_state, offer_id, offer_type_snapshot,
                               offer_value_snapshot)
          values (${`${PREFIX}_inv_partial`}, ${`OF${RUN}`}, ${BRANCH_A}, ${null}, ${c}, 'service',
                  0, 0, 0, 0, 0, 0, 0, 'paid', ${now}, ${now}, ${now}, ${fixtureFinancialYear(now)},
                  ${900_000 + next()}, 'provisional',
                  (select name from branch where id = ${BRANCH_A}), ${null},
                  (select address_line1 from branch where id = ${BRANCH_A}),
                  (select state from branch where id = ${BRANCH_A}),
                  ${FLAT.id}, 'flat', ${FLAT.value})`),
      ),
    ).toBe('23514 invoice_offer_snapshot_check')
  })
})
