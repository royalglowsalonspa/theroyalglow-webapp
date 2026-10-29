/************************************************************
 * Module Name  : memberships.integration.test
 * Scope        : Integration test — memberships across branches (REAL db)
 *
 * Description  : The membership queries against Neon dev with two throwaway
 *                branches A and B (multi-branch R9, route inventory gap 5):
 *                  - a sale at A records A as the selling branch, issues the
 *                    purchase invoice there and keeps the tier's usual hours
 *                    and price;
 *                  - the hours are used at B, whose session is a booking at B;
 *                  - only A can cancel, and only once;
 *                  - a row written before selling_branch_id existed still
 *                    resolves its selling branch from the purchase invoice.
 *
 * Skip behaviour : Skips without packages/db/.env (CI). Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : Prefixed `mem_it_<run>` rows, deleted in one transaction in
 *                afterAll, then zero residue is proven. The branches reuse the
 *                primary branch's Owner.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { isLiveDbAvailable, queryRow } from '../test/live-db'
import {
  cancelMembership,
  createMembershipWithInvoice,
  getMembershipById,
  getMembershipSessions,
  getMemberships,
  recordMembershipSession,
} from './memberships'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `mem_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const CUSTOMER = `${PREFIX}_customer`
const LEGACY_CUSTOMER = `${PREFIX}_legacy`
const SELLER = `${PREFIX}_seller`
const TIER = `${PREFIX}_tier`
const LEGACY = `${PREFIX}_legacy_m`
const LEGACY_INVOICE = `${PREFIX}_legacy_inv`

let serviceId = ''
let membershipId = ''

describe.skipIf(!LIVE)('memberships across branches against a live database', () => {
  beforeAll(async () => {
    const owner = await queryRow<{ id: string }>(
      sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
    )
    const service = await queryRow<{ id: string }>(
      sql`select id from service where is_active = true order by id limit 1`,
    )
    serviceId = service?.id ?? ''
    const number = 9900 + Math.floor(Math.random() * 90)

    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${CUSTOMER}, 'ZZ Mem IT customer', ${`${CUSTOMER}@example.invalid`}, false, 'customer'),
               (${LEGACY_CUSTOMER}, 'ZZ Mem IT legacy', ${`${LEGACY_CUSTOMER}@example.invalid`}, false, 'customer'),
               (${SELLER}, 'ZZ Mem IT seller', ${`${SELLER}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order, owner_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Mem IT A', 'Test', '560100', '0000000000', 980, ${owner?.id ?? ''}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Mem IT B', 'Test', '560100', '0000000000', 981, ${owner?.id ?? ''})`),
      db.execute(sql`
        insert into spa_membership_tier (id, name, slug, default_hours_minutes, default_price_paise, default_validity_days, is_active)
        values (${TIER}, ${`ZZ Mem IT ${RUN}`}, ${TIER}, 900, 1500000, 90, false)`),
    ])

    const sold = await createMembershipWithInvoice({
      membershipNumber: `${PREFIX}_M1`,
      customerId: CUSTOMER,
      tierId: TIER,
      tierNameSnapshot: 'ZZ Gold',
      tierUsualHoursMinutes: 900,
      tierUsualPricePaise: 1_500_000,
      totalHoursMinutes: 960,
      pricePaidPaise: 1_400_000,
      startsAt: new Date('2026-10-01T00:00:00.000Z'),
      expiresAt: new Date('2099-12-31T00:00:00.000Z'),
      createdBy: SELLER,
      branchId: BRANCH_A,
      invoiceNumber: `${PREFIX}_INV1`,
      subtotalPaise: 1_186_441,
      taxableValuePaise: 1_186_441,
      gstAmountPaise: 213_559,
      totalAmountPaise: 1_400_000,
      paymentMethod: 'upi',
    })
    membershipId = sold.membership.id

    // A membership written by the old code: no selling branch column, only its
    // purchase invoice at A.
    await db.batch([
      db.execute(sql`
        insert into invoice (id, invoice_number, branch_id, customer_id, invoice_type,
                             subtotal_paise, total_amount_paise, payment_status)
        values (${LEGACY_INVOICE}, ${`${PREFIX}_INV_L`}, ${BRANCH_A}, ${LEGACY_CUSTOMER},
                'membership_purchase', 847458, 1000000, 'paid')`),
      db.execute(sql`
        insert into spa_membership (id, membership_number, customer_id, tier_id, tier_name_snapshot,
                                    total_hours_minutes, price_paid_paise, starts_at, expires_at,
                                    created_by, invoice_id)
        values (${LEGACY}, ${`${PREFIX}_M_L`}, ${LEGACY_CUSTOMER}, ${TIER}, 'ZZ Silver', 480, 1000000,
                '2026-09-01T00:00:00Z', '2099-12-31T00:00:00Z', ${SELLER}, ${LEGACY_INVOICE})`),
    ])
  })

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(
        sql`delete from invoice_item where invoice_id in (select id from invoice where customer_id like ${like})`,
      ),
      db.execute(sql`delete from invoice where customer_id like ${like}`),
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where customer_id like ${like})`,
      ),
      db.execute(
        sql`delete from booking_status_log where booking_id in (select id from booking where customer_id like ${like})`,
      ),
      db.execute(sql`delete from booking where customer_id like ${like}`),
      db.execute(sql`delete from spa_membership where customer_id like ${like}`),
      db.execute(sql`delete from spa_membership_tier where id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from spa_membership where customer_id like ${like}) as memberships,
               (select count(*) from invoice where customer_id like ${like}) as invoices,
               (select count(*) from booking where customer_id like ${like}) as bookings,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({ memberships: '0', invoices: '0', bookings: '0', branches: '0', users: '0' })
  })

  it('records the selling branch, its invoice and the tier’s usual values', async () => {
    const found = await getMembershipById(membershipId)

    expect(found).toMatchObject({
      sellingBranchId: BRANCH_A,
      sellingBranch: { id: BRANCH_A, name: 'ZZ Mem IT A' },
      tierUsualHoursMinutes: 900,
      tierUsualPricePaise: 1_500_000,
      pricePaidPaise: 1_400_000,
    })
    expect(
      await queryRow(
        sql`select branch_id, invoice_type from invoice where id = ${found?.invoiceId}`,
      ),
    ).toEqual({ branch_id: BRANCH_A, invoice_type: 'membership_purchase' })
  })

  it('resolves an older row’s selling branch from its purchase invoice', async () => {
    const legacy = await getMembershipById(LEGACY)
    expect(legacy?.sellingBranch).toEqual({ id: BRANCH_A, name: 'ZZ Mem IT A' })

    const listed = (await getMemberships({ tier: TIER })).map((m) => [m.id, m.sellingBranchId])
    expect(listed).toEqual(
      expect.arrayContaining([
        [membershipId, BRANCH_A],
        [LEGACY, BRANCH_A],
      ]),
    )
  })

  it('uses the shared hours at another branch, as a booking there', async () => {
    const recorded = await recordMembershipSession({
      membershipId,
      bookingNumber: `${PREFIX}_S1`,
      branchId: BRANCH_B,
      customerId: CUSTOMER,
      bookingDate: new Date('2026-10-20T00:00:00.000Z'),
      startTime: '11:00',
      endTime: '12:00',
      invoiceNumber: `${PREFIX}_INV_S1`,
      services: [{ serviceId, serviceNameSnapshot: 'ZZ IT spa', durationMinutes: 60 }],
    })

    expect(recorded.ok).toBe(true)
    const [session] = await getMembershipSessions(membershipId)
    expect(session).toMatchObject({ branchId: BRANCH_B, branchName: 'ZZ Mem IT B' })
    expect((await getMembershipById(membershipId))?.usedHoursMinutes).toBe(60)
  })

  it('cancels only from the selling branch, and only once', async () => {
    expect(await cancelMembership(membershipId, BRANCH_B, 'Wrong branch')).toBeNull()
    expect((await getMembershipById(membershipId))?.status).toBe('active')

    expect(await cancelMembership(membershipId, BRANCH_A, 'Moved abroad')).toEqual({
      id: membershipId,
      status: 'cancelled',
    })
    expect(await cancelMembership(membershipId, BRANCH_A, 'Again')).toBeNull()

    expect((await getMembershipById(membershipId))?.notes).toBe('Cancelled: Moved abroad')
  })

  it('cancels an older row through its purchase invoice’s branch', async () => {
    expect(await cancelMembership(LEGACY, BRANCH_B, 'x')).toBeNull()
    expect((await cancelMembership(LEGACY, BRANCH_A, 'Duplicate'))?.status).toBe('cancelled')
  })
})
