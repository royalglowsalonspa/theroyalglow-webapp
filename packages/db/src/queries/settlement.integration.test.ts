/************************************************************
 * Module Name  : settlement.integration.test
 * Scope        : Integration test — the cross-branch settlement ledger (REAL db)
 *
 * Description  : Memberships and statements against Neon dev, with three
 *                throwaway branches A, B (one Owner) and C (another Owner),
 *                multi-branch R10:
 *                  - MS-20, MS-21: a session's value and GST share are its
 *                    membership's own rate, and every membership's entries
 *                    add up to its price and its purchase GST exactly;
 *                  - MS-22: a session where the membership was sold is an
 *                    internal entry, in no statement;
 *                  - MS-23: two sessions of one membership finishing at once
 *                    take distinct minutes and add up exactly (MS-24);
 *                  - ST-07, ST-08, TX-12: closing a month makes one statement
 *                    per pair, netted, with value and GST share totals, and
 *                    positions that add up to zero; closing twice changes
 *                    nothing, a later entry lands in the next month, and
 *                    nothing closed ever changes;
 *                  - MS-25: a payment is recorded once; an internal transfer
 *                    needs one Owner for both branches;
 *                  - MS-24: a correction is a reversing entry in the open
 *                    month, never an edit of a closed statement;
 *                  - a viewer reads only pairs with a branch they may see, and
 *                    each branch's report shows what it receives and pays.
 *
 * Skip behaviour : Skips without packages/db/.env (CI). Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : Prefixed `st_it_<run>` rows and a month of their own in the
 *                1990s for the closing tests, deleted in one transaction in
 *                afterAll (ledger rows through the test fixture switch,
 *                migration 0022), then zero residue is proven.
 ************************************************************/

import { addDaysISO, istTodayISO } from '@rgss/types'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { fixtureFinancialYear } from '../test/issued-invoice'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import {
  completeMembershipSession,
  createMembershipWithInvoice,
  recordMembershipSession,
} from './memberships'
import {
  closeSettlementMonths,
  getBranchSettlementReport,
  getOpenSettlementMonths,
  getSettlementStatement,
  getSettlementStatementEntries,
  listSettlementStatements,
  markSettlementPaid,
  reverseSettlementEntry,
} from './settlement'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `st_it_${RUN}`
const A = `${PREFIX}_a`
const B = `${PREFIX}_b`
const C = `${PREFIX}_c`
const OWNER_C = `${PREFIX}_owner_c`
const ACTOR = `${PREFIX}_actor`
const TIER = `${PREFIX}_tier`
const ACCOUNT = `${PREFIX}_acct`
const GEMS_CUSTOMER = `${PREFIX}_gems`
// A month of this run's own, long ended: the closing tests post into it.
const YEAR = 1990 + Math.floor(Math.random() * 10)
const MONTH_NUMBER = 1 + Math.floor(Math.random() * 11)
const MONTH = `${YEAR}-${String(MONTH_NUMBER).padStart(2, '0')}`
const NEXT_MONTH = `${YEAR}-${String(MONTH_NUMBER + 1).padStart(2, '0')}`
const ONLY_A = { all: false, branchIds: [A] } as const
const ONLY_C = { all: false, branchIds: [C] } as const

let serviceId = ''
let serviceSac = ''
let serial = 0

function next(): string {
  serial += 1
  return `${serial}`
}

/** ₹10,000.00 sold at A at the 5% the branch copied (0018), for `minutes`. */
async function sell(name: string, minutes: number): Promise<string> {
  const customerId = `${PREFIX}_m_${name}`
  await db.execute(sql`
    insert into "user" (id, name, email, email_verified, role)
    values (${customerId}, ${`ZZ Settle IT ${name}`}, ${`${customerId}@example.invalid`}, false, 'customer')`)
  const now = new Date()
  const sold = await createMembershipWithInvoice({
    membershipNumber: `${PREFIX}_M_${name}`,
    customerId,
    tierId: TIER,
    tierNameSnapshot: 'ZZ Settle',
    tierUsualHoursMinutes: minutes,
    tierUsualPricePaise: 1_000_000,
    totalHoursMinutes: minutes,
    pricePaidPaise: 1_000_000,
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    expiresAt: new Date('2099-12-31T00:00:00.000Z'),
    createdBy: ACTOR,
    branchId: A,
    invoice: {
      paymentMethod: 'upi',
      subtotalPaise: 1_000_000,
      discountAmountPaise: 0,
      taxableValuePaise: 952_381,
      gstAmountPaise: 47_619,
      cgstPaise: 23_809,
      sgstPaise: 23_810,
      totalAmountPaise: 1_000_000,
      taxPointAt: now,
      financialYear: fixtureFinancialYear(now),
      taxReviewStatus: 'provisional',
    },
    invoiceLine: {
      serviceNameSnapshot: `SPA membership: ${minutes / 60} hours`,
      quantity: 1,
      unitPricePaise: 1_000_000,
      totalPricePaise: 1_000_000,
      sacCode: '999723',
      taxVersionId: `tax_${A}_999723`,
      rateBps: 500,
      discountPaise: 0,
      taxableValuePaise: 952_381,
      taxPaise: 47_619,
      cgstPaise: 23_809,
      sgstPaise: 23_810,
    },
  })
  return sold.membership.id
}

/** One session of `minutes` at `branchId`. */
async function session(membershipId: string, branchId: string, minutes: number) {
  const customer = await queryRow<{ customer_id: string }>(
    sql`select customer_id from spa_membership where id = ${membershipId}`,
  )
  const now = new Date()
  // Record now (holds the minutes), then complete (consumes them and writes
  // the settlement entry).
  const recorded = await recordMembershipSession({
    membershipId,
    bookingNumber: `${PREFIX}_S${next()}`,
    branchId,
    customerId: customer?.customer_id ?? '',
    bookingDate: new Date('2026-10-30T00:00:00.000Z'),
    startTime: '11:00',
    endTime: '12:00',
    services: [{ serviceId, serviceNameSnapshot: 'ZZ Settle IT spa', durationMinutes: minutes }],
    recordedById: ACTOR,
  })
  if (!recorded.ok) {
    throw new Error(`session not recorded: ${recorded.reason}`)
  }
  const completed = await completeMembershipSession({
    bookingId: recorded.booking.id,
    branchId,
    changedById: ACTOR,
    invoice: {
      taxPointAt: now,
      financialYear: fixtureFinancialYear(now),
      taxReviewStatus: 'provisional',
      lineTax: [
        { sacCode: serviceSac, taxVersionId: `tax_${branchId}_${serviceSac}`, rateBps: 500 },
      ],
    },
    lines: [{ serviceId, serviceNameSnapshot: 'ZZ Settle IT spa', staffNameSnapshot: null }],
    settlement: { shareBps: 10_000 },
  })
  if (!completed.ok) {
    throw new Error(`session not completed: ${completed.reason}`)
  }
  return recorded.booking.id
}

async function sessionEntries(membershipId: string) {
  return queryRows<{
    owing_branch_id: string
    owed_branch_id: string
    minutes: number
    value_paise: string
    gst_share_paise: string
    amount_owed_paise: string
  }>(sql`
    select owing_branch_id, owed_branch_id, minutes, value_paise, gst_share_paise, amount_owed_paise
      from settlement_entry
     where spa_membership_id = ${membershipId} and kind = 'membership_session'
     order by created_at, id`)
}

/** Every membership's entries add up to floor(P × minutes used / T) (MS-24). */
async function addsUp(membershipId: string) {
  return queryRow(sql`
    select (select coalesce(sum(e.value_paise), 0) from settlement_entry e
             where e.spa_membership_id = m.id) as entries,
           (m.price_paid_paise::bigint * m.used_hours_minutes) / m.total_hours_minutes as expected
      from spa_membership m where m.id = ${membershipId}`)
}

/** A completed booking at A that fixture entries can name. */
async function fixtureBooking(): Promise<string> {
  const id = `${PREFIX}_fb${next()}`
  await db.execute(sql`
    insert into booking (id, booking_number, branch_id, customer_id, status, service_type,
                         booking_date, start_time, end_time, total_amount_paise,
                         total_duration_minutes)
    values (${id}, ${id}, ${A}, ${GEMS_CUSTOMER}, 'completed', 'spa', '2026-10-30', '10:00',
            '11:00', 0, 60)`)
  return id
}

// Each test makes many sequential HTTP round trips to Neon; with every live
// suite running at once, 5 seconds isn't enough.
describe.skipIf(!LIVE)(
  'the cross-branch settlement ledger against a live database',
  {
    timeout: 30_000,
  },
  () => {
    let m20 = ''
    let m21 = ''
    let m23 = ''
    const fixture: Record<string, string> = {}
    const statements: Record<string, string> = {}

    beforeAll(async () => {
      const owner = await queryRow<{ id: string }>(
        sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
      )
      const service = await queryRow<{ id: string; sac: string }>(
        sql`select s.id, coalesce(s.sac_code, c.sac_code) as sac
          from service s join service_category c on c.id = s.category_id
          where s.is_active = true and coalesce(s.sac_code, c.sac_code) is not null
          order by s.id limit 1`,
      )
      serviceId = service?.id ?? ''
      serviceSac = service?.sac ?? ''
      const number = 9500 + Math.floor(Math.random() * 90)

      await db.batch([
        db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${ACTOR}, 'ZZ Settle IT actor', ${`${ACTOR}@example.invalid`}, false, 'customer'),
               (${GEMS_CUSTOMER}, 'ZZ Settle IT gems', ${`${GEMS_CUSTOMER}@example.invalid`}, false, 'customer'),
               (${OWNER_C}, 'ZZ Settle IT owner C', ${`${OWNER_C}@example.invalid`}, false, 'owner')`),
        db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order, owner_user_id)
        values (${A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Settle IT A', 'Test', '560100', '0000000000', 940, ${owner?.id ?? ''}),
               (${B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Settle IT B', 'Test', '560100', '0000000000', 941, ${owner?.id ?? ''}),
               (${C}, ${number + 2}, ${`${PREFIX}_C`}, 'ZZ Settle IT C', 'Test', '560100', '0000000000', 942, ${OWNER_C})`),
        db.execute(sql`
        insert into spa_membership_tier (id, name, slug, default_hours_minutes, default_price_paise, default_validity_days, is_active)
        values (${TIER}, ${`ZZ Settle IT ${RUN}`}, ${TIER}, 600, 1000000, 90, false)`),
        db.execute(sql`
        insert into loyalty_account (id, customer_id, gems_balance, total_gems_earned, total_gems_redeemed)
        values (${ACCOUNT}, ${GEMS_CUSTOMER}, 0, 0, 0)`),
      ])
    })

    afterAll(async () => {
      const like = `${PREFIX}%`
      const months = sql`(${`${MONTH}-01`}::date, ${`${NEXT_MONTH}-01`}::date)`
      await db.batch([
        db.execute(sql`select set_config('rgss.ledger_fixture', 'on', true)`),
        db.execute(sql`delete from settlement_position where branch_id like ${like}`),
        db.execute(
          sql`delete from branch_settlement where branch_a_id like ${like} or branch_b_id like ${like}`,
        ),
        db.execute(sql`
        delete from settlement_entry
         where reverses_entry_id is not null
           and (owing_branch_id like ${like} or owed_branch_id like ${like})`),
        db.execute(
          sql`delete from settlement_entry where owing_branch_id like ${like} or owed_branch_id like ${like}`,
        ),
        db.execute(sql`
        delete from settlement_period p
         where p.month in ${months}
           and not exists (select 1 from settlement_entry e where e.posting_month = p.month)
           and not exists (select 1 from branch_settlement s where s.month = p.month)`),
        db.execute(sql`delete from loyalty_transaction where loyalty_account_id = ${ACCOUNT}`),
        db.execute(sql`delete from loyalty_account where id = ${ACCOUNT}`),
        db.execute(
          sql`delete from invoice_item where invoice_id in (select id from invoice where customer_id like ${like})`,
        ),
        db.execute(sql`delete from invoice where customer_id like ${like}`),
        // Membership holds, like ledger rows, go only under the fixture flag (0026).
        db.execute(
          sql`delete from membership_hold where booking_id in (select id from booking where customer_id like ${like})`,
        ),
        db.execute(
          sql`delete from booking_service where booking_id in (select id from booking where customer_id like ${like})`,
        ),
        db.execute(
          sql`delete from booking_status_log where booking_id in (select id from booking where customer_id like ${like})`,
        ),
        db.execute(sql`delete from booking where customer_id like ${like}`),
        db.execute(sql`delete from spa_membership where customer_id like ${like}`),
        db.execute(sql`delete from spa_membership_tier where id = ${TIER}`),
        db.execute(sql`delete from branch where id like ${like}`),
        db.execute(sql`delete from "user" where id like ${like}`),
      ])
      expect(
        await queryRow(sql`
        select (select count(*) from settlement_entry
                 where owing_branch_id like ${like} or owed_branch_id like ${like}) as entries,
               (select count(*) from branch_settlement
                 where branch_a_id like ${like} or branch_b_id like ${like}) as statements,
               (select count(*) from settlement_period where month in ${months}) as months,
               (select count(*) from booking where customer_id like ${like}) as bookings,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
      ).toEqual({
        entries: '0',
        statements: '0',
        months: '0',
        bookings: '0',
        branches: '0',
        users: '0',
      })
    })

    it('values each session at its membership’s rate, adding up to the price and GST (MS-20)', async () => {
      m20 = await sell('ms20', 600)
      for (let i = 0; i < 10; i += 1) {
        await session(m20, B, 60)
      }

      const rows = await sessionEntries(m20)
      expect(rows).toHaveLength(10)
      // ₹10,000.00 for 10 hours at 5%: ₹1,000.00 an hour, of which ₹47.61 is
      // GST the first time, so A owes B ₹952.39; ₹47.62 and ₹952.38 after.
      expect(rows[0]).toEqual({
        owing_branch_id: A,
        owed_branch_id: B,
        minutes: 60,
        value_paise: '100000',
        gst_share_paise: '4761',
        amount_owed_paise: '95239',
      })
      expect(rows[1]).toMatchObject({ gst_share_paise: '4762', amount_owed_paise: '95238' })
      const total = (key: 'value_paise' | 'gst_share_paise' | 'amount_owed_paise') =>
        rows.reduce((sum, row) => sum + Number(row[key]), 0)
      expect(total('value_paise')).toBe(1_000_000)
      expect(total('gst_share_paise')).toBe(47_619)
      // The amounts owed add up to the purchase invoice's taxable value.
      expect(total('amount_owed_paise')).toBe(952_381)
      expect(await addsUp(m20)).toEqual({ entries: '1000000', expected: '1000000' })
    })

    it('never lets rounding build up: nine hours for ₹10,000.00 end on the odd paisa (MS-21)', async () => {
      m21 = await sell('ms21', 540)
      for (let i = 0; i < 9; i += 1) {
        await session(m21, B, 60)
      }

      const values = (await sessionEntries(m21)).map((row) => Number(row.value_paise))
      expect(values).toEqual([...Array(8).fill(111_111), 111_112])
      const gst = (await sessionEntries(m21)).reduce(
        (sum, row) => sum + Number(row.gst_share_paise),
        0,
      )
      expect(gst).toBe(47_619)
    })

    it('gives concurrent sessions distinct minutes, and records the selling branch’s own as internal (MS-22, MS-23)', async () => {
      m23 = await sell('ms23', 900)
      // At 15 hours a racing pair, both valued from 0 minutes, would add up to
      // 99,999 paise instead of 1,00,000.
      await Promise.all([session(m23, A, 60), session(m23, B, 30)])

      const rows = await sessionEntries(m23)
      expect(rows).toHaveLength(2)
      expect(rows.reduce((sum, row) => sum + Number(row.value_paise), 0)).toBe(100_000)
      expect(
        rows.map((row) => [row.owing_branch_id, row.owed_branch_id, row.minutes]).sort(),
      ).toEqual(
        [
          [A, A, 60],
          [A, B, 30],
        ].sort(),
      )
      expect(await addsUp(m23)).toEqual({ entries: '100000', expected: '100000' })
    })

    it('closes a month into netted statements and positions that add up to zero (ST-07, ST-08, TX-12)', async () => {
      // A redemption for the gems entries to name.
      await db.batch([
        db.execute(sql`
        insert into loyalty_transaction (id, loyalty_account_id, type, gems_amount, branch_id, expires_at)
        values (${`${ACCOUNT}_earned`}, ${ACCOUNT}, 'earned', 1000, ${A}, now() + interval '100 days'),
               (${`${ACCOUNT}_r1`}, ${ACCOUNT}, 'redeemed', 600, ${A}, null),
               (${`${ACCOUNT}_r2`}, ${ACCOUNT}, 'redeemed', 100, ${B}, null)`),
        db.execute(
          sql`update loyalty_account set gems_balance = 300, total_gems_earned = 1000, total_gems_redeemed = 700 where id = ${ACCOUNT}`,
        ),
      ])
      const bookings = await Promise.all(Array.from({ length: 7 }, () => fixtureBooking()))
      const at = `${MONTH}-15T12:00:00+05:30`
      const posted = await db.batch([
        db.execute(sql`select set_config('rgss.ledger_fixture', 'on', true)`),
        db.execute<{ id: string; note: string }>(sql`
        insert into settlement_entry
          (kind, posting_month, owing_branch_id, owed_branch_id, spa_membership_id, booking_id,
           loyalty_transaction_id, minutes, gems, gem_value_paise, value_paise, gst_share_paise,
           amount_owed_paise, share_bps, note, created_at)
        values
          ('membership_session', ${`${MONTH}-01`}, ${A}, ${B}, ${m20}, ${bookings[0]}, null, 60, null, null, 100000, 4761, 95239, 10000, 'E1', ${at}),
          ('membership_session', ${`${MONTH}-01`}, ${B}, ${A}, ${m20}, ${bookings[1]}, null, 30, null, null, 50000, 2380, 47620, 10000, 'E2', ${at}),
          ('gems_redemption', ${`${MONTH}-01`}, ${A}, ${B}, null, ${bookings[2]}, ${`${ACCOUNT}_r1`}, null, 500, 100, 50000, 0, 50000, 10000, 'E3', ${at}),
          ('membership_session', ${`${MONTH}-01`}, ${A}, ${A}, ${m20}, ${bookings[3]}, null, 60, null, null, 100000, 4761, 95239, 10000, 'E4', ${at}),
          ('gems_redemption', ${`${MONTH}-01`}, ${C}, ${A}, null, ${bookings[4]}, ${`${ACCOUNT}_r1`}, null, 200, 100, 20000, 0, 20000, 10000, 'E5', ${at}),
          ('gems_redemption', ${`${MONTH}-01`}, ${B}, ${C}, null, ${bookings[5]}, ${`${ACCOUNT}_r1`}, null, 100, 100, 10000, 0, 10000, 10000, 'E6', ${at}),
          ('gems_redemption', ${`${MONTH}-01`}, ${C}, ${B}, null, ${bookings[6]}, ${`${ACCOUNT}_r2`}, null, 100, 100, 10000, 0, 10000, 10000, 'E7', ${at})
        returning id, note`),
      ])
      for (const row of (posted[1] as { rows: { id: string; note: string }[] }).rows) {
        fixture[row.note] = row.id
      }

      const closed = await closeSettlementMonths()
      expect(closed.months).toEqual(expect.arrayContaining([{ month: MONTH, statements: 3 }]))

      const listed = await listSettlementStatements({ all: true }, { month: MONTH })
      for (const statement of listed) {
        statements[`${statement.branchA.id}|${statement.branchB.id}`] = statement.id
      }
      const ab = listed.find((s) => s.branchA.id === A && s.branchB.id === B)
      expect(ab).toMatchObject({
        month: MONTH,
        aOwesB: {
          membershipPaise: 95_239,
          membershipValuePaise: 100_000,
          membershipGstSharePaise: 4_761,
          gemsPaise: 50_000,
          totalPaise: 145_239,
        },
        bOwesA: {
          membershipPaise: 47_620,
          membershipValuePaise: 50_000,
          membershipGstSharePaise: 2_380,
          gemsPaise: 0,
          totalPaise: 47_620,
        },
        net: {
          payingBranch: { id: A, name: 'ZZ Settle IT A' },
          receivingBranch: { id: B, name: 'ZZ Settle IT B' },
          amountPaise: 97_619,
        },
        entryCount: 3,
        paid: null,
        sameOwner: true,
      })
      expect(listed.find((s) => s.branchA.id === A && s.branchB.id === C)).toMatchObject({
        bOwesA: { gemsPaise: 20_000 },
        net: { payingBranch: { id: C }, receivingBranch: { id: A }, amountPaise: 20_000 },
        sameOwner: false,
      })
      expect(listed.find((s) => s.branchA.id === B && s.branchB.id === C)).toMatchObject({
        net: { payingBranch: null, receivingBranch: null, amountPaise: 0 },
        entryCount: 2,
      })
      expect(listed).toHaveLength(3)

      // The statement's entries are its month's entries between its branches;
      // the internal entry is in none.
      const entries = await getSettlementStatementEntries(
        ab ?? { month: MONTH, branchA: { id: A, name: '' }, branchB: { id: B, name: '' } },
      )
      expect(entries.map((e) => e.note).sort()).toEqual(['E1', 'E2', 'E3'])

      const positions = await queryRows<{
        branch_id: string
        receivable: string
        payable: string
        net: string
      }>(sql`
      select branch_id, receivable_paise as receivable, payable_paise as payable, net_paise as net
        from settlement_position where month = ${`${MONTH}-01`}::date order by branch_id`)
      expect(positions).toEqual([
        { branch_id: A, receivable: '67620', payable: '145239', net: '-77619' },
        { branch_id: B, receivable: '155239', payable: '57620', net: '97619' },
        { branch_id: C, receivable: '10000', payable: '30000', net: '-20000' },
      ])
    })

    it('closes nothing twice, posts a later entry into the next month, and keeps the closed month fixed (MS-24)', async () => {
      const before = await listSettlementStatements({ all: true }, { month: MONTH })
      const again = await closeSettlementMonths()
      expect(again.months.map((m) => m.month)).not.toContain(MONTH)
      expect(await listSettlementStatements({ all: true }, { month: MONTH })).toEqual(before)

      const booking = await fixtureBooking()
      const [, late] = await db.batch([
        db.execute(sql`select set_config('rgss.ledger_fixture', 'on', true)`),
        db.execute<{ month: string }>(sql`
        insert into settlement_entry
          (kind, posting_month, owing_branch_id, owed_branch_id, booking_id, loyalty_transaction_id,
           gems, gem_value_paise, value_paise, amount_owed_paise, share_bps, created_at)
        values ('gems_redemption', ${`${MONTH}-01`}, ${B}, ${A}, ${booking}, ${`${ACCOUNT}_r2`},
                10, 100, 1000, 1000, 10000, ${`${MONTH}-20T12:00:00+05:30`})
        returning to_char(posting_month, 'YYYY-MM') as month`),
      ])
      expect((late as { rows: { month: string }[] }).rows[0]?.month).toBe(NEXT_MONTH)

      const refusal = async (query: Promise<unknown>) =>
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
      const id = statements[`${A}|${B}`] ?? ''
      expect(
        await refusal(db.execute(sql`update branch_settlement set net_paise = 1 where id = ${id}`)),
      ).toMatch(/can't change except to record its payment/)
      expect(
        await refusal(db.execute(sql`delete from branch_settlement where id = ${id}`)),
      ).toMatch(/can't be deleted/)
      expect(
        await refusal(
          db.execute(
            sql`update settlement_entry set amount_owed_paise = 0 where id = ${fixture.E1 ?? ''}`,
          ),
        ),
      ).toMatch(/record a reversing entry/)
      expect(
        await refusal(
          db.execute(
            sql`update settlement_period set closed_at = now() where month = ${`${MONTH}-01`}::date`,
          ),
        ),
      ).toMatch(/can only be closed, once/)
      expect(
        await refusal(
          db.execute(
            sql`update settlement_period set closed_at = now() where month = settlement_month_of(now())`,
          ),
        ),
      ).toMatch(/has not ended yet/)
      expect(
        await refusal(
          db.execute(sql`
          insert into branch_settlement
            (month, branch_a_id, branch_b_id, a_owes_b_membership_paise,
             a_owes_b_membership_value_paise, a_owes_b_membership_gst_paise, a_owes_b_gems_paise,
             b_owes_a_membership_paise, b_owes_a_membership_value_paise,
             b_owes_a_membership_gst_paise, b_owes_a_gems_paise, net_paise, entry_count, closed_at)
          values (${`${NEXT_MONTH}-01`}, ${A}, ${B}, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, now())`),
        ),
      ).toMatch(/made only by closing/)
    })

    it('records a payment once, and an internal transfer only between one Owner’s branches (MS-25)', async () => {
      const ab = statements[`${A}|${B}`] ?? ''
      const ac = statements[`${A}|${C}`] ?? ''
      const bc = statements[`${B}|${C}`] ?? ''
      const paid = { paidOn: '2026-10-30', reference: 'UTR 4455', actorId: ACTOR }

      expect(await markSettlementPaid({ ...paid, id: ab, internalTransfer: true })).toEqual({
        ok: true,
      })
      expect(await markSettlementPaid({ ...paid, id: ab, internalTransfer: false })).toEqual({
        ok: false,
        reason: 'already_paid',
      })
      expect(await markSettlementPaid({ ...paid, id: ac, internalTransfer: true })).toEqual({
        ok: false,
        reason: 'not_same_owner',
      })
      expect(await markSettlementPaid({ ...paid, id: ac, internalTransfer: false })).toEqual({
        ok: true,
      })
      expect(await markSettlementPaid({ ...paid, id: bc, internalTransfer: false })).toEqual({
        ok: false,
        reason: 'nothing_owed',
      })
      expect(
        await markSettlementPaid({ ...paid, id: `${PREFIX}_missing`, internalTransfer: false }),
      ).toEqual({ ok: false, reason: 'not_found' })

      expect((await getSettlementStatement(ab, { all: true }))?.paid).toMatchObject({
        paidOn: '2026-10-30',
        reference: 'UTR 4455',
        internalTransfer: true,
        recordedByName: 'ZZ Settle IT actor',
      })
    })

    it('corrects an entry with a reversing entry in the open month, never by editing (MS-24)', async () => {
      const closedBefore = await getSettlementStatement(statements[`${A}|${B}`] ?? '', {
        all: true,
      })

      const reversed = await reverseSettlementEntry({
        entryId: fixture.E1 ?? '',
        note: 'The session was complimentary',
        actorId: ACTOR,
      })
      expect(reversed).toMatchObject({ ok: true })
      const reversal = reversed.ok ? reversed : null
      expect(
        await queryRow(sql`
        select to_char(posting_month, 'YYYY-MM') as month, owing_branch_id, owed_branch_id,
               minutes, value_paise, gst_share_paise, amount_owed_paise, share_bps
          from settlement_entry where id = ${reversal?.entryId ?? ''}`),
      ).toEqual({
        month: istTodayISO().slice(0, 7),
        owing_branch_id: A,
        owed_branch_id: B,
        minutes: -60,
        value_paise: '-100000',
        gst_share_paise: '-4761',
        amount_owed_paise: '-95239',
        share_bps: 10_000,
      })

      expect(
        await reverseSettlementEntry({ entryId: fixture.E1 ?? '', note: 'Twice', actorId: ACTOR }),
      ).toEqual({ ok: false, reason: 'already_reversed' })
      expect(
        await reverseSettlementEntry({
          entryId: reversal?.entryId ?? '',
          note: 'Undo',
          actorId: ACTOR,
        }),
      ).toEqual({ ok: false, reason: 'is_reversal' })
      expect(
        await reverseSettlementEntry({
          entryId: fixture.E4 ?? '',
          note: 'Internal',
          actorId: ACTOR,
        }),
      ).toEqual({ ok: false, reason: 'internal' })
      expect(
        await reverseSettlementEntry({
          entryId: `${PREFIX}_none`,
          note: 'Missing',
          actorId: ACTOR,
        }),
      ).toEqual({ ok: false, reason: 'not_found' })

      // The closed statement is unchanged; the open month carries the reversal.
      expect(await getSettlementStatement(statements[`${A}|${B}`] ?? '', { all: true })).toEqual(
        closedBefore,
      )
      const open = (await getOpenSettlementMonths(ONLY_A)).find(
        (m) => m.month === istTodayISO().slice(0, 7) && m.branchB.id === B,
      )
      const sessionsOwed = await queryRow<{ total: string }>(sql`
      select coalesce(sum(amount_owed_paise), 0) as total from settlement_entry
       where owing_branch_id = ${A} and owed_branch_id = ${B}
         and posting_month = settlement_month_of(now())`)
      expect(open?.aOwesB.membershipPaise).toBe(Number(sessionsOwed?.total))
    })

    it('shows a viewer only the pairs with a branch they may see', async () => {
      const ab = statements[`${A}|${B}`] ?? ''
      const forC = await listSettlementStatements(ONLY_C, { month: MONTH })
      expect(forC.map((s) => `${s.branchA.id}|${s.branchB.id}`).sort()).toEqual(
        [`${A}|${C}`, `${B}|${C}`].sort(),
      )
      expect(await getSettlementStatement(ab, ONLY_C)).toBeNull()
      expect((await getSettlementStatement(ab, ONLY_A))?.id).toBe(ab)
      expect(await listSettlementStatements({ all: false, branchIds: [] })).toEqual([])
    })

    it('reports what a branch delivers, receives and pays (settlement.md)', async () => {
      const today = istTodayISO()
      const range = { from: addDaysISO(today, -1), to: today }
      const atA = await getBranchSettlementReport(A, range)
      const atB = await getBranchSettlementReport(B, range)

      // Delivered at B today: 600 + 540 + 30 minutes, less the reversed hour.
      expect(atB.memberships.deliveredMinutes).toBe(1110)
      // Used by A's members today, anywhere: 600 + 540 + 90, less that hour.
      expect(atA.memberships.ownMembersMinutes).toBe(1170)
      // Only A and B settled today, so what A pays B is what B receives.
      expect(atA.memberships.toPayPaise).toBe(atB.memberships.toReceivePaise)
      expect(atA.memberships.toReceivePaise).toBe(0)
      // 1,000 gems issued at A; the backdated gems entries are not today's.
      expect(atA.gems).toEqual({ issued: 1000, redeemed: 0, toReceivePaise: 0, toPayPaise: 0 })
    })
  },
)
