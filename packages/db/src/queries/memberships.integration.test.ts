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
  completeMembershipSession,
  createMembershipTier,
  createMembershipWithInvoice,
  getMembershipById,
  getMembershipSessions,
  getMemberships,
  getOwnMemberships,
  recordMembershipSession,
  updateMembershipTier,
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
// Every tier this suite writes is named from this prefix.
const TIER_NAMES = `ZZ Mem IT ${RUN}%`

let serviceId = ''
let serviceSac = ''
let membershipId = ''

/** The current Indian financial year on the IST calendar, "2627". */
function financialYearNow(): string {
  const wall = new Date(Date.now() + 330 * 60_000)
  const start = wall.getUTCMonth() >= 3 ? wall.getUTCFullYear() : wall.getUTCFullYear() - 1
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`
}

describe.skipIf(!LIVE)('memberships across branches against a live database', () => {
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
      // ₹14,000.00 at the provisional 5% the new branch copied (0018).
      invoice: {
        paymentMethod: 'upi',
        subtotalPaise: 1_400_000,
        discountAmountPaise: 0,
        taxableValuePaise: 1_333_333,
        gstAmountPaise: 66_667,
        cgstPaise: 33_333,
        sgstPaise: 33_334,
        totalAmountPaise: 1_400_000,
        taxPointAt: new Date(),
        financialYear: financialYearNow(),
        taxReviewStatus: 'provisional',
      },
      invoiceLine: {
        serviceNameSnapshot: 'SPA membership: 16 hours, valid until 31/12/2099',
        quantity: 1,
        unitPricePaise: 1_400_000,
        totalPricePaise: 1_400_000,
        sacCode: '999723',
        taxVersionId: `tax_${BRANCH_A}_999723`,
        rateBps: 500,
        discountPaise: 0,
        taxableValuePaise: 1_333_333,
        taxPaise: 66_667,
        cgstPaise: 33_333,
        sgstPaise: 33_334,
      },
    })
    membershipId = sold.membership.id

    // A membership written by the old code: no selling branch column, only its
    // purchase invoice at A.
    await db.batch([
      db.execute(sql`
        insert into invoice (id, invoice_number, branch_id, customer_id, invoice_type,
                             subtotal_paise, taxable_value_paise, gst_amount_paise, cgst_paise,
                             sgst_paise, total_amount_paise, payment_status, tax_point_at,
                             financial_year, sequence_number, tax_review_status, issuer_name,
                             issuer_address)
        values (${LEGACY_INVOICE}, ${`ZZ${RUN}L`}, ${BRANCH_A}, ${LEGACY_CUSTOMER},
                'membership_purchase', 1000000, 952381, 47619, 23809, 23810, 1000000, 'paid',
                now(), ${financialYearNow()}, 900001, 'provisional', 'ZZ Mem IT A', 'Test')`),
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
      // Settlement entries can't be deleted outside a test fixture (0022).
      db.execute(sql`select set_config('rgss.ledger_fixture', 'on', true)`),
      db.execute(
        sql`delete from settlement_entry where owing_branch_id like ${like} or owed_branch_id like ${like}`,
      ),
      db.execute(
        sql`delete from invoice_item where invoice_id in (select id from invoice where customer_id like ${like})`,
      ),
      db.execute(sql`delete from invoice where customer_id like ${like}`),
      // Membership holds go only under the fixture flag too (0026).
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
      // Tiers the tests created get generated ids, so match their names too.
      db.execute(
        sql`delete from spa_membership_tier where id like ${like} or name like ${TIER_NAMES}`,
      ),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from spa_membership where customer_id like ${like}) as memberships,
               (select count(*) from invoice where customer_id like ${like}) as invoices,
               (select count(*) from booking where customer_id like ${like}) as bookings,
               (select count(*) from spa_membership_tier
                 where id like ${like} or name like ${TIER_NAMES}) as tiers,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({
      memberships: '0',
      invoices: '0',
      bookings: '0',
      tiers: '0',
      branches: '0',
      users: '0',
    })
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

  it('stores the agreed deal and names it on the invoice, leaving the tier as it was (MS-14)', async () => {
    const found = await getMembershipById(membershipId)

    expect(found).toMatchObject({
      tierNameSnapshot: 'ZZ Gold',
      totalHoursMinutes: 960,
      pricePaidPaise: 1_400_000,
      createdBy: SELLER,
    })
    expect(
      await queryRow(sql`
        select service_name_snapshot, unit_price_paise, total_price_paise
        from invoice_item where invoice_id = ${found?.invoiceId}`),
    ).toEqual({
      service_name_snapshot: 'SPA membership: 16 hours, valid until 31/12/2099',
      unit_price_paise: 1_400_000,
      total_price_paise: 1_400_000,
    })
    expect(
      await queryRow(sql`
        select default_hours_minutes, default_price_paise, default_validity_days
        from spa_membership_tier where id = ${TIER}`),
    ).toEqual({
      default_hours_minutes: 900,
      default_price_paise: 1_500_000,
      default_validity_days: 90,
    })
  })

  it('keeps a sold membership’s values when the tier is edited later (MS-17, MS-19)', async () => {
    const before = await getMembershipById(membershipId)
    const edited = await updateMembershipTier(TIER, {
      name: `ZZ Mem IT ${RUN} edited`,
      defaultHoursMinutes: 1200,
      defaultPricePaise: 2_000_000,
      defaultValidityDays: 180,
    })
    expect(edited?.defaultHoursMinutes).toBe(1200)

    const after = await getMembershipById(membershipId)
    expect(after).toMatchObject({
      tierNameSnapshot: 'ZZ Gold',
      tierUsualHoursMinutes: 900,
      tierUsualPricePaise: 1_500_000,
      totalHoursMinutes: 960,
      pricePaidPaise: 1_400_000,
    })
    expect(after?.expiresAt.toISOString()).toBe(before?.expiresAt.toISOString())
  })

  it('shows the customer their own hours, price and expiry, never the tier (R9.1)', async () => {
    const { active, past } = await getOwnMemberships(CUSTOMER)

    expect(past).toEqual([])
    expect(active).toMatchObject({
      id: membershipId,
      totalHoursMinutes: 960,
      pricePaidPaise: 1_400_000,
      sellingBranchName: 'ZZ Mem IT A',
    })
    const text = JSON.stringify(active)
    expect(text).not.toMatch(/tier/i)
    expect(text).not.toContain('1500000')
  })

  it('creates and edits tiers, refusing a duplicate name and suffixing a taken slug', async () => {
    const values = {
      name: `ZZ Mem IT ${RUN} new`,
      defaultHoursMinutes: 600,
      defaultPricePaise: 900_000,
      defaultValidityDays: 60,
      sacCode: '999723',
      isActive: false,
      displayOrder: 990,
    }
    const created = await createMembershipTier({ ...values, slug: `${PREFIX}_slug` })
    expect(created).toMatchObject({ slug: `${PREFIX}_slug`, defaultHoursMinutes: 600 })

    // Same slug, another name: the slug gets a suffix.
    const second = await createMembershipTier({
      ...values,
      name: `${values.name} 2`,
      slug: `${PREFIX}_slug`,
    })
    expect(second.slug).toMatch(new RegExp(`^${PREFIX}_slug-[a-z0-9_-]{4}$`))

    await expect(
      createMembershipTier({ ...values, slug: `${PREFIX}_other` }),
    ).rejects.toMatchObject({ statusCode: 409 })
    await expect(updateMembershipTier(second.id, { name: values.name })).rejects.toMatchObject({
      statusCode: 409,
    })
    expect(await updateMembershipTier(`${PREFIX}_missing`, { isActive: true })).toBeNull()
  })

  it('refuses tier and membership values the checks rule out (0016)', async () => {
    await expect(
      db.execute(sql`update spa_membership_tier set sac_code = '9997' where id = ${TIER}`),
    ).rejects.toThrow()
    await expect(
      db.execute(sql`update spa_membership_tier set default_validity_days = 0 where id = ${TIER}`),
    ).rejects.toThrow()
    await expect(
      db.execute(sql`update spa_membership set expires_at = starts_at where id = ${membershipId}`),
    ).rejects.toThrow()
    await expect(
      db.execute(
        sql`update spa_membership set used_hours_minutes = total_hours_minutes + 1 where id = ${membershipId}`,
      ),
    ).rejects.toThrow()
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
      services: [{ serviceId, serviceNameSnapshot: 'ZZ IT spa', durationMinutes: 60 }],
      recordedById: SELLER,
    })
    expect(recorded).toMatchObject({ ok: true, remainingMinutes: 900 })
    if (!recorded.ok) {
      return
    }
    // In progress: the minutes are held, not yet used.
    expect(await getMembershipById(membershipId)).toMatchObject({
      usedHoursMinutes: 0,
      reservedMinutes: 60,
    })

    const completed = await completeMembershipSession({
      bookingId: recorded.booking.id,
      branchId: BRANCH_B,
      changedById: SELLER,
      invoice: {
        taxPointAt: new Date(),
        financialYear: financialYearNow(),
        taxReviewStatus: 'provisional',
        lineTax: [
          { sacCode: serviceSac, taxVersionId: `tax_${BRANCH_B}_${serviceSac}`, rateBps: 500 },
        ],
      },
      lines: [{ serviceId, serviceNameSnapshot: 'ZZ IT spa', staffNameSnapshot: null }],
      settlement: { shareBps: 10_000 },
    })
    expect(completed).toMatchObject({ ok: true, remainingMinutes: 900 })

    const [session] = await getMembershipSessions(membershipId)
    expect(session).toMatchObject({ branchId: BRANCH_B, branchName: 'ZZ Mem IT B' })
    expect(await getMembershipById(membershipId)).toMatchObject({
      usedHoursMinutes: 60,
      reservedMinutes: 0,
    })
    // A sold the membership, so A owes B the session's value without its GST
    // share: ₹14,000.00 for 960 minutes is ₹875.00 an hour, of which ₹41.66
    // was the GST A collected (TX-12).
    expect(
      await queryRow(sql`
        select kind, owing_branch_id, owed_branch_id, minutes, value_paise, gst_share_paise,
               amount_owed_paise, share_bps, created_by
          from settlement_entry where spa_membership_id = ${membershipId}`),
    ).toEqual({
      kind: 'membership_session',
      owing_branch_id: BRANCH_A,
      owed_branch_id: BRANCH_B,
      minutes: 60,
      value_paise: '87500',
      gst_share_paise: '4166',
      amount_owed_paise: '83334',
      share_bps: 10_000,
      created_by: SELLER,
    })
    // The ₹0 session invoice is B's first in its own series (R6.2, TX-07),
    // issued when the session completes.
    if (completed.ok) {
      expect(completed.invoice.invoiceNumber).toMatch(/^B[0-9A-Z]{1,3}\/\d{4}\/000001$/)
      expect(completed.invoice).toMatchObject({
        branchId: BRANCH_B,
        sequenceNumber: 1,
        totalAmountPaise: 0,
        issuerName: 'ZZ Mem IT B',
      })
    }
  })

  it('cancels only from the selling branch, and only once', async () => {
    const cancel = (sellingBranchId: string, reason: string) =>
      cancelMembership({ id: membershipId, sellingBranchId, reason, actorId: SELLER })

    expect(await cancel(BRANCH_B, 'Wrong branch')).toEqual({ ok: false, reason: 'not_active' })
    expect((await getMembershipById(membershipId))?.status).toBe('active')

    expect(await cancel(BRANCH_A, 'Moved abroad')).toEqual({
      ok: true,
      membership: { id: membershipId, status: 'cancelled' },
      cancelledSessions: 0,
    })
    expect(await cancel(BRANCH_A, 'Again')).toEqual({ ok: false, reason: 'not_active' })

    expect((await getMembershipById(membershipId))?.notes).toBe('Cancelled: Moved abroad')
  })

  it('cancels an older row through its purchase invoice’s branch', async () => {
    const cancel = (sellingBranchId: string, reason: string) =>
      cancelMembership({ id: LEGACY, sellingBranchId, reason, actorId: SELLER })

    expect(await cancel(BRANCH_B, 'x')).toEqual({ ok: false, reason: 'not_active' })
    expect(await cancel(BRANCH_A, 'Duplicate')).toMatchObject({
      ok: true,
      membership: { status: 'cancelled' },
    })
  })
})
