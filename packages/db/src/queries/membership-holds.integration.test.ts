/************************************************************
 * Module Name  : membership-holds.integration.test
 * Scope        : Integration test — SPA membership minute holds (REAL db)
 *
 * Description  : The session lifecycle against Neon dev (migrations 0025,
 *                0026; membership-scheduling.md MS-01 to MS-06, MS-13):
 *                  - Record now holds the minutes; two branches racing for
 *                    the last hour get one session (MS-01);
 *                  - completing consumes them once, with one invoice and one
 *                    settlement entry (MS-02);
 *                  - cancelling, rejecting or missing a session releases its
 *                    minutes once, for reuse within validity; a session in
 *                    progress can't be cancelled (MS-03, MS-04);
 *                  - validity is checked at the session's start, inclusive of
 *                    the stored expiry instant (MS-05);
 *                  - the expiry job cancels sessions that never started and
 *                    leaves one in progress to complete (MS-06);
 *                  - a membership with a session in progress can't be
 *                    cancelled; otherwise its unstarted sessions go with it
 *                    (MS-13);
 *                  - Start moves a confirmed booking to in progress once, from
 *                    the database's clock, and refuses a session whose
 *                    membership isn't valid at that instant (MS-06);
 *                  - a session can't be rescheduled beyond its membership;
 *                  - direct SQL can't unbalance the totals or detach a hold.
 *
 * Skip behaviour : Skips without packages/db/.env (CI). Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : Prefixed `mh_it_<run>` rows, deleted in one transaction in
 *                afterAll under the fixture flag, then zero residue is proven.
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { fixtureFinancialYear } from '../test/issued-invoice'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import { startBooking } from './admin-bookings'
import { rescheduleBooking } from './bookings'
import { findDriverError } from './driver-errors'
import { jobMembershipAutoExpire, MEMBERSHIP_EXPIRED_SESSION_REASON } from './jobs'
import {
  cancelMembership,
  completeMembershipSession,
  createMembershipWithInvoice,
  getMembershipSessions,
  recordMembershipSession,
} from './memberships'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `mh_it_${RUN}`
const A = `${PREFIX}_a`
const B = `${PREFIX}_b`
const ACTOR = `${PREFIX}_actor`
const TIER = `${PREFIX}_tier`
const DAY_MS = 24 * 60 * 60 * 1000

let serviceId = ''
let serviceSac = ''
let counter = 0

function next(): number {
  counter += 1
  return counter
}

/** The constraint a refused write names, else its message. */
function refusal(error: unknown): string {
  const e = findDriverError(error, ['23514', '23001', '22012'])
  if (e && typeof e.constraint === 'string') {
    return e.constraint
  }
  return e && typeof e.message === 'string' ? e.message : String(error)
}

async function refused(write: Promise<unknown>): Promise<string> {
  try {
    await write
  } catch (error) {
    return refusal(error)
  }
  return 'accepted'
}

/** A customer with a membership of `minutes`, valid from `startsAt` to `expiresAt`, sold at A. */
async function sell(
  minutes: number,
  window: { startsAt?: Date; expiresAt?: Date } = {},
): Promise<{ id: string; customer: string }> {
  const n = next()
  const customer = `${PREFIX}_c${n}`
  await db.execute(sql`
    insert into "user" (id, name, email, email_verified, role)
    values (${customer}, ${`ZZ Holds IT ${n}`}, ${`${customer}@example.invalid`}, false, 'customer')`)
  const now = new Date()
  const sold = await createMembershipWithInvoice({
    membershipNumber: `${PREFIX}_M${n}`,
    customerId: customer,
    tierId: TIER,
    tierNameSnapshot: 'ZZ Holds',
    tierUsualHoursMinutes: minutes,
    tierUsualPricePaise: 600_000,
    totalHoursMinutes: minutes,
    pricePaidPaise: 600_000,
    startsAt: window.startsAt ?? new Date(now.getTime() - DAY_MS),
    expiresAt: window.expiresAt ?? new Date(now.getTime() + 30 * DAY_MS),
    createdBy: ACTOR,
    branchId: A,
    invoice: {
      paymentMethod: 'cash',
      subtotalPaise: 600_000,
      discountAmountPaise: 0,
      taxableValuePaise: 571_429,
      gstAmountPaise: 28_571,
      cgstPaise: 14_285,
      sgstPaise: 14_286,
      totalAmountPaise: 600_000,
      taxPointAt: now,
      financialYear: fixtureFinancialYear(now),
      taxReviewStatus: 'provisional',
    },
    invoiceLine: {
      serviceNameSnapshot: `SPA membership: ${minutes / 60} hours`,
      quantity: 1,
      unitPricePaise: 600_000,
      totalPricePaise: 600_000,
      sacCode: '999723',
      taxVersionId: `tax_${A}_999723`,
      rateBps: 500,
      discountPaise: 0,
      taxableValuePaise: 571_429,
      taxPaise: 28_571,
      cgstPaise: 14_285,
      sgstPaise: 14_286,
    },
  })
  return { id: sold.membership.id, customer }
}

/** Record now: a session of `minutes` at `branchId`, in progress from now. */
async function recordNow(m: { id: string; customer: string }, branchId: string, minutes = 60) {
  return recordMembershipSession({
    membershipId: m.id,
    bookingNumber: `${PREFIX}_R${next()}`,
    branchId,
    customerId: m.customer,
    bookingDate: new Date(),
    startTime: '11:00',
    endTime: '12:00',
    services: [{ serviceId, serviceNameSnapshot: 'ZZ Holds IT spa', durationMinutes: minutes }],
    recordedById: ACTOR,
  })
}

async function complete(bookingId: string, branchId: string) {
  const now = new Date()
  return completeMembershipSession({
    bookingId,
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
    lines: [{ serviceId, serviceNameSnapshot: 'ZZ Holds IT spa', staffNameSnapshot: null }],
    settlement: { shareBps: 10_000 },
  })
}

/** 'YYYY-MM-DD' on the IST calendar, `days` from today. */
function istDay(days: number): string {
  return new Date(Date.now() + 330 * 60_000 + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * A session booked ahead and confirmed, written directly, so a case can pick
 * any slot (recordMembershipSession with `when: 'ahead'` is tested on its
 * own). Its minutes are held when it is written.
 */
async function bookAhead(
  m: { id: string; customer: string },
  branchId: string,
  options: { day?: string; at?: string; minutes?: number } = {},
): Promise<string> {
  const id = `${PREFIX}_bk${next()}`
  const minutes = options.minutes ?? 60
  await db.execute(sql`
    insert into booking (id, booking_number, branch_id, customer_id, status, service_type,
                         booking_date, start_time, end_time, total_amount_paise,
                         total_duration_minutes, is_membership_session, spa_membership_id,
                         confirmed_at)
    values (${id}, ${id}, ${branchId}, ${m.customer}, 'confirmed', 'spa',
            ${options.day ?? istDay(1)}, ${options.at ?? '11:00'}, '12:00', 0, ${minutes}::int,
            true, ${m.id}, now())`)
  return id
}

async function totals(membershipId: string) {
  return queryRow<{ used: number; reserved: number; status: string }>(sql`
    select used_hours_minutes as used, reserved_minutes as reserved, status
      from spa_membership where id = ${membershipId}`)
}

async function holdOf(bookingId: string) {
  return queryRow<{ state: string; minutes: number }>(
    sql`select state, minutes from membership_hold where booking_id = ${bookingId}`,
  )
}

async function statusOf(bookingId: string) {
  return (
    await queryRow<{ status: string; reason: string | null }>(
      sql`select status, cancellation_reason as reason from booking where id = ${bookingId}`,
    )
  )?.status
}

// Each test makes many sequential HTTP round trips to Neon; with every live
// suite running at once, 5 seconds isn't enough.
describe.skipIf(!LIVE)(
  'SPA membership minute holds against a live database',
  { timeout: 30_000 },
  () => {
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
      const number = 9600 + Math.floor(Math.random() * 90)
      await db.batch([
        db.execute(sql`
          insert into "user" (id, name, email, email_verified, role)
          values (${ACTOR}, 'ZZ Holds IT actor', ${`${ACTOR}@example.invalid`}, false, 'customer')`),
        db.execute(sql`
          insert into branch (id, number, code, name, address_line1, pincode, phone, display_order, owner_user_id)
          values (${A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Holds IT A', 'Test', '560100', '0000000000', 960, ${owner?.id ?? ''}),
                 (${B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Holds IT B', 'Test', '560100', '0000000000', 961, ${owner?.id ?? ''})`),
        db.execute(sql`
          insert into spa_membership_tier (id, name, slug, default_hours_minutes, default_price_paise, default_validity_days, is_active)
          values (${TIER}, ${`ZZ Holds IT ${RUN}`}, ${TIER}, 600, 600000, 90, false)`),
      ])
    })

    afterAll(async () => {
      const like = `${PREFIX}%`
      await db.batch([
        // Holds and ledger rows go only under the fixture flag (0022, 0026).
        db.execute(sql`select set_config('rgss.ledger_fixture', 'on', true)`),
        db.execute(
          sql`delete from settlement_entry where owing_branch_id like ${like} or owed_branch_id like ${like}`,
        ),
        db.execute(
          sql`delete from membership_hold where booking_id in (select id from booking where customer_id like ${like})`,
        ),
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
        db.execute(sql`delete from spa_membership_tier where id = ${TIER}`),
        db.execute(sql`delete from branch where id like ${like}`),
        db.execute(sql`delete from "user" where id like ${like}`),
      ])
      expect(
        await queryRow(sql`
          select (select count(*) from membership_hold h join booking b on b.id = h.booking_id
                   where b.customer_id like ${like}) as holds,
                 (select count(*) from booking where customer_id like ${like}) as bookings,
                 (select count(*) from spa_membership where customer_id like ${like}) as memberships,
                 (select count(*) from branch where id like ${like}) as branches`),
      ).toEqual({ holds: '0', bookings: '0', memberships: '0', branches: '0' })
    })

    it('holds the minutes of a session recorded now; two branches racing for the last hour get one (MS-01)', async () => {
      const m = await sell(120)
      const first = await recordNow(m, A)
      expect(first).toMatchObject({ ok: true, remainingMinutes: 60 })
      expect(await totals(m.id)).toMatchObject({ used: 0, reserved: 60 })

      const raced = await Promise.all([recordNow(m, A), recordNow(m, B)])
      expect(raced.filter((r) => r.ok)).toHaveLength(1)
      expect(raced.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'unavailable' }])
      expect(await totals(m.id)).toMatchObject({ used: 0, reserved: 120 })
      // No orphan booking: only the two sessions that hold minutes exist.
      expect(
        await queryRows(sql`select id from booking where spa_membership_id = ${m.id}`),
      ).toHaveLength(2)
    })

    it('books a session ahead: confirmed, its minutes held, validity at its planned start', async () => {
      // Valid until the end of the IST day four days from now.
      const m = await sell(120, {
        expiresAt: new Date(`${istDay(4)}T23:59:59.999+05:30`),
      })
      const ahead = (day: string) =>
        recordMembershipSession({
          membershipId: m.id,
          bookingNumber: `${PREFIX}_A${next()}`,
          branchId: A,
          customerId: m.customer,
          bookingDate: new Date(`${day}T00:00:00.000Z`),
          startTime: '15:00',
          endTime: '16:00',
          services: [{ serviceId, serviceNameSnapshot: 'ZZ Holds IT spa', durationMinutes: 60 }],
          recordedById: ACTOR,
          when: 'ahead',
        })

      const booked = await ahead(istDay(2))
      expect(booked).toMatchObject({ ok: true, remainingMinutes: 60 })
      if (!booked.ok) {
        throw new Error('not booked')
      }
      expect(booked.booking).toMatchObject({ status: 'confirmed', startedAt: null })
      expect(await holdOf(booked.booking.id)).toEqual({ state: 'held', minutes: 60 })
      expect(await totals(m.id)).toMatchObject({ used: 0, reserved: 60 })
      expect(
        await queryRow(sql`select to_status::text as status, notes from booking_status_log
                            where booking_id = ${booked.booking.id}`),
      ).toEqual({ status: 'confirmed', notes: 'Membership session booked ahead' })

      // After the expiry the database refuses the hold, and nothing is written.
      expect(await ahead(istDay(6))).toEqual({ ok: false, reason: 'unavailable' })
      expect(await totals(m.id)).toMatchObject({ used: 0, reserved: 60 })
      expect(
        await queryRows(sql`select id from booking where spa_membership_id = ${m.id}`),
      ).toHaveLength(1)

      // It starts from its booking, keeping its hold.
      expect(
        (await startBooking({ bookingId: booked.booking.id, branchId: A, changedById: ACTOR })).ok,
      ).toBe(true)
      expect(await holdOf(booked.booking.id)).toEqual({ state: 'held', minutes: 60 })
      expect((await complete(booked.booking.id, A)).ok).toBe(true)
      expect(await totals(m.id)).toMatchObject({ used: 60, reserved: 0 })
    })

    it('consumes a session’s minutes once, with one invoice and one entry (MS-02)', async () => {
      const m = await sell(120)
      const recorded = await recordNow(m, B)
      if (!recorded.ok) {
        throw new Error('not recorded')
      }

      const done = await Promise.all([
        complete(recorded.booking.id, B),
        complete(recorded.booking.id, B),
      ])
      expect(done.filter((r) => r.ok)).toHaveLength(1)
      expect(done.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'not_in_progress' }])
      expect(await complete(recorded.booking.id, B)).toEqual({
        ok: false,
        reason: 'not_in_progress',
      })

      expect(await totals(m.id)).toMatchObject({ used: 60, reserved: 0 })
      expect(await holdOf(recorded.booking.id)).toEqual({ state: 'consumed', minutes: 60 })
      expect(
        await queryRow(sql`
          select (select count(*) from invoice where booking_id = ${recorded.booking.id}
                   and invoice_type = 'membership_session') as invoices,
                 (select count(*) from settlement_entry where booking_id = ${recorded.booking.id}) as entries`),
      ).toEqual({ invoices: '1', entries: '1' })
    })

    it('releases the minutes of a session that doesn’t happen, once, for reuse (MS-03, MS-04)', async () => {
      const m = await sell(60)
      const cancelled = await bookAhead(m, A)
      expect(await totals(m.id)).toMatchObject({ reserved: 60 })
      expect((await recordNow(m, A)).ok).toBe(false)

      await db.execute(sql`update booking set status = 'cancelled', cancelled_at = now()
                            where id = ${cancelled}`)
      expect(await holdOf(cancelled)).toMatchObject({ state: 'released' })
      expect(await totals(m.id)).toMatchObject({ used: 0, reserved: 0 })
      // A later no-show of the same booking releases nothing twice.
      await db.execute(sql`update booking set status = 'no_show' where id = ${cancelled}`)
      expect(await totals(m.id)).toMatchObject({ used: 0, reserved: 0 })

      // The minutes are back for another session within validity.
      const missed = await bookAhead(m, A)
      await db.execute(sql`update booking set status = 'no_show' where id = ${missed}`)
      expect(await holdOf(missed)).toMatchObject({ state: 'released' })
      const reused = await recordNow(m, A)
      expect(reused).toMatchObject({ ok: true, remainingMinutes: 0 })

      // A session in progress isn't cancelled, rejected or missed.
      if (reused.ok) {
        for (const status of ['cancelled', 'rejected', 'no_show']) {
          expect(
            await refused(
              db.execute(sql`update booking set status = ${status}::booking_status
                              where id = ${reused.booking.id}`),
            ),
          ).toBe('membership_session_started')
        }
      }
    })

    it('completes a session only after it started', async () => {
      const m = await sell(60)
      const ahead = await bookAhead(m, A)

      expect(await complete(ahead, A)).toEqual({ ok: false, reason: 'not_in_progress' })
      expect(
        await refused(db.execute(sql`update booking set status = 'completed' where id = ${ahead}`)),
      ).toBe('membership_session_started')

      await db.execute(sql`update booking set status = 'in_progress', started_at = now()
                            where id = ${ahead}`)
      expect((await complete(ahead, A)).ok).toBe(true)
      expect(await totals(m.id)).toMatchObject({ used: 60, reserved: 0 })
    })

    it('checks validity at the session’s start, including the expiry instant (MS-05)', async () => {
      const startsAt = new Date(Date.now() - DAY_MS)
      const expiresAt = new Date(Date.now() + DAY_MS)
      const m = await sell(240, { startsAt, expiresAt })
      const startedAt = async (at: Date) => {
        const id = `${PREFIX}_v${next()}`
        return refused(
          db.execute(sql`
            insert into booking (id, booking_number, branch_id, customer_id, status, service_type,
                                 booking_date, start_time, end_time, total_amount_paise,
                                 total_duration_minutes, is_membership_session, spa_membership_id,
                                 started_at)
            values (${id}, ${id}, ${A}, ${m.customer}, 'in_progress', 'spa', ${istDay(0)}, '11:00',
                    '12:00', 0, 60, true, ${m.id}, ${at.toISOString()}::timestamptz)`),
        )
      }

      expect(await startedAt(expiresAt)).toBe('accepted')
      expect(await startedAt(new Date(expiresAt.getTime() + 1))).toBe('membership_hold_validity')
      expect(await startedAt(startsAt)).toBe('accepted')
      expect(await startedAt(new Date(startsAt.getTime() - 1))).toBe('membership_hold_validity')

      // A booking ahead must start within validity too, and stay within it.
      expect(await refused(bookAhead(m, A, { day: istDay(3) }))).toBe('membership_hold_validity')
      const ahead = await bookAhead(m, A, { day: istDay(0), at: '23:00' })
      expect(
        await refused(
          db.execute(sql`update booking set booking_date = ${istDay(5)} where id = ${ahead}`),
        ),
      ).toBe('membership_hold_validity')
    })

    it('cancels sessions that never started when the membership expires, and completes one in progress (MS-06)', async () => {
      const m = await sell(180)
      const running = await recordNow(m, B)
      const ahead = await bookAhead(m, A, { day: istDay(0), at: '23:30' })
      if (!running.ok) {
        throw new Error('not recorded')
      }
      // The membership has just expired.
      await db.execute(sql`update spa_membership set expires_at = now() - interval '1 minute'
                            where id = ${m.id}`)

      const result = await jobMembershipAutoExpire()
      expect(result.expired).toBeGreaterThanOrEqual(1)
      expect(result.cancelledSessions).toBeGreaterThanOrEqual(1)

      expect(
        await queryRow(
          sql`select status, cancellation_reason as reason from booking where id = ${ahead}`,
        ),
      ).toEqual({ status: 'cancelled', reason: MEMBERSHIP_EXPIRED_SESSION_REASON })
      expect(await holdOf(ahead)).toMatchObject({ state: 'released' })
      expect(await totals(m.id)).toMatchObject({ status: 'expired', used: 0, reserved: 60 })

      // The session that started in time still completes.
      expect((await complete(running.booking.id, B)).ok).toBe(true)
      expect(await totals(m.id)).toMatchObject({ used: 60, reserved: 0 })
      // A rerun changes nothing.
      expect(await jobMembershipAutoExpire()).toMatchObject({ cancelledSessions: 0 })
    })

    it('refuses to cancel a membership with a session in progress, then cancels its unstarted ones with it (MS-13)', async () => {
      const m = await sell(180)
      const running = await recordNow(m, A)
      const ahead = await bookAhead(m, A)
      if (!running.ok) {
        throw new Error('not recorded')
      }
      const cancel = () =>
        cancelMembership({ id: m.id, sellingBranchId: A, reason: 'Moved away', actorId: ACTOR })

      expect(await cancel()).toEqual({ ok: false, reason: 'session_in_progress' })
      expect(await statusOf(ahead)).toBe('confirmed')
      expect(await totals(m.id)).toMatchObject({ status: 'active', reserved: 120 })

      expect((await complete(running.booking.id, A)).ok).toBe(true)
      expect(await cancel()).toMatchObject({ ok: true, cancelledSessions: 1 })
      expect(await statusOf(ahead)).toBe('cancelled')
      expect(await holdOf(ahead)).toMatchObject({ state: 'released' })
      expect(await totals(m.id)).toMatchObject({ status: 'cancelled', used: 60, reserved: 0 })
      expect(
        await queryRow(sql`select to_status, changed_by_id from booking_status_log
                            where booking_id = ${ahead} order by created_at desc limit 1`),
      ).toEqual({ to_status: 'cancelled', changed_by_id: ACTOR })
    })

    it('resizes a confirmed session’s hold with its services, never one in progress', async () => {
      const m = await sell(180)
      const ahead = await bookAhead(m, A)
      await db.execute(sql`update booking set total_duration_minutes = 90 where id = ${ahead}`)
      expect(await holdOf(ahead)).toEqual({ state: 'held', minutes: 90 })
      expect(await totals(m.id)).toMatchObject({ reserved: 90 })
      expect(
        await refused(
          db.execute(sql`update booking set total_duration_minutes = 200 where id = ${ahead}`),
        ),
      ).toBe('spa_membership_reserved_check')

      await db.execute(sql`update booking set status = 'in_progress', started_at = now()
                            where id = ${ahead}`)
      expect(
        await refused(
          db.execute(sql`update booking set total_duration_minutes = 60 where id = ${ahead}`),
        ),
      ).toBe('membership_hold_fixed')
    })

    it('keeps the totals and holds consistent against direct SQL', async () => {
      const m = await sell(120)
      const ahead = await bookAhead(m, A)

      expect(
        await refused(
          db.execute(sql`update spa_membership set reserved_minutes = 0 where id = ${m.id}`),
        ),
      ).toBe('membership_minutes_balanced')
      expect(
        await refused(
          db.execute(sql`update spa_membership set used_hours_minutes = 30 where id = ${m.id}`),
        ),
      ).toBe('membership_minutes_balanced')
      expect(
        await refused(
          db.execute(sql`update membership_hold set state = 'released', released_at = now()
                          where booking_id = ${ahead}`),
        ),
      ).toBe('membership_hold_booking_match')
      expect(
        await refused(db.execute(sql`delete from membership_hold where booking_id = ${ahead}`)),
      ).toMatch(/never deleted/)
      expect(
        await refused(
          db.execute(sql`update booking set is_membership_session = false where id = ${ahead}`),
        ),
      ).toBe('membership_hold_fixed')
      // The old way of recording a session, a completed booking plus a direct
      // deduction, no longer balances.
      const id = `${PREFIX}_old${next()}`
      expect(
        await refused(
          db.batch([
            db.execute(sql`
              insert into booking (id, booking_number, branch_id, customer_id, status, service_type,
                                   booking_date, start_time, end_time, total_amount_paise,
                                   total_duration_minutes, is_membership_session, spa_membership_id,
                                   completed_at)
              values (${id}, ${id}, ${A}, ${m.customer}, 'completed', 'spa', ${istDay(0)}, '10:00',
                      '11:00', 0, 60, true, ${m.id}, now())`),
            db.execute(sql`update spa_membership set used_hours_minutes = used_hours_minutes + 60
                            where id = ${m.id}`),
          ]),
        ),
      ).toMatch(/spa_membership_reserved_check|membership_minutes_balanced/)
      expect(await totals(m.id)).toMatchObject({ used: 0, reserved: 60 })
    })

    it('starts a confirmed session once, from the database’s clock; its minutes stay held', async () => {
      const m = await sell(120)
      const ahead = await bookAhead(m, A, { day: istDay(0), at: '00:00' })
      const before = Date.now()

      const raced = await Promise.all([
        startBooking({ bookingId: ahead, branchId: A, changedById: ACTOR }),
        startBooking({ bookingId: ahead, branchId: A, changedById: ACTOR }),
      ])
      expect(raced.filter((r) => r.ok)).toHaveLength(1)
      expect(raced.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'not_confirmed' }])

      const started = await queryRow<{ status: string; started_at: string }>(
        sql`select status, started_at::text from booking where id = ${ahead}`,
      )
      expect(started?.status).toBe('in_progress')
      // The server's clock, not a client's.
      expect(new Date(started?.started_at ?? 0).getTime()).toBeGreaterThan(before - 60_000)
      expect(await holdOf(ahead)).toEqual({ state: 'held', minutes: 60 })
      expect(await totals(m.id)).toMatchObject({ used: 0, reserved: 60 })
      expect(
        await queryRows(sql`select from_status, to_status, changed_by_id from booking_status_log
                             where booking_id = ${ahead}`),
      ).toEqual([{ from_status: 'confirmed', to_status: 'in_progress', changed_by_id: ACTOR }])
      // Another branch can't start it: the booking isn't there.
      expect(await startBooking({ bookingId: ahead, branchId: B, changedById: ACTOR })).toEqual({
        ok: false,
        reason: 'not_confirmed',
      })
      expect((await complete(ahead, A)).ok).toBe(true)
    })

    it('won’t start a session once its membership expired, or before it starts (MS-06)', async () => {
      const m = await sell(120)
      const ahead = await bookAhead(m, A, { day: istDay(0), at: '23:30' })
      // The appointment ran late: the membership expired before it started.
      await db.execute(sql`update spa_membership set expires_at = now() - interval '1 minute'
                            where id = ${m.id}`)

      expect(await startBooking({ bookingId: ahead, branchId: A, changedById: ACTOR })).toEqual({
        ok: false,
        reason: 'membership_unavailable',
      })
      // Nothing changed: still confirmed, still held, no log entry.
      expect(await statusOf(ahead)).toBe('confirmed')
      expect(await holdOf(ahead)).toMatchObject({ state: 'held' })
      expect(
        await queryRows(sql`select 1 from booking_status_log where booking_id = ${ahead}`),
      ).toHaveLength(0)

      // Sold to start in two days: a session booked for then can't start today.
      const later = await sell(120, {
        startsAt: new Date(Date.now() + 2 * DAY_MS),
        expiresAt: new Date(Date.now() + 30 * DAY_MS),
      })
      const early = await bookAhead(later, A, { day: istDay(3) })
      expect(await startBooking({ bookingId: early, branchId: A, changedById: ACTOR })).toEqual({
        ok: false,
        reason: 'membership_unavailable',
      })
      expect(await statusOf(early)).toBe('confirmed')
    })

    it('starts an ordinary booking with no hold', async () => {
      const m = await sell(60)
      const id = `${PREFIX}_ord${next()}`
      await db.execute(sql`
        insert into booking (id, booking_number, branch_id, customer_id, status, service_type,
                             booking_date, start_time, end_time, total_amount_paise,
                             total_duration_minutes, confirmed_at)
        values (${id}, ${id}, ${A}, ${m.customer}, 'confirmed', 'salon', ${istDay(0)}, '10:00',
                '11:00', 150000, 60, now())`)

      const started = await startBooking({ bookingId: id, branchId: A, changedById: ACTOR })

      expect(started).toMatchObject({ ok: true, booking: { id, status: 'in_progress' } })
      expect(started.ok && started.booking.startedAt).toBeInstanceOf(Date)
      expect(await holdOf(id)).toBeNull()
      expect(await totals(m.id)).toMatchObject({ used: 0, reserved: 0 })
    })

    it('lists the sessions holding or using minutes, not those that released them', async () => {
      const m = await sell(240)
      const running = await recordNow(m, A)
      const ahead = await bookAhead(m, B)
      const cancelled = await bookAhead(m, A)
      await db.execute(sql`update booking set status = 'cancelled', cancelled_at = now()
                            where id = ${cancelled}`)
      const done = await recordNow(m, B)
      if (!(running.ok && done.ok)) {
        throw new Error('not recorded')
      }
      expect((await complete(done.booking.id, B)).ok).toBe(true)

      const sessions = await getMembershipSessions(m.id)

      expect(sessions.map((s) => [s.id, s.status]).sort()).toEqual(
        [
          [running.booking.id, 'in_progress'],
          [ahead, 'confirmed'],
          [done.booking.id, 'completed'],
        ].sort(),
      )
      expect(sessions.find((s) => s.id === ahead)).toMatchObject({ branchName: 'ZZ Holds IT B' })
    })

    it('refuses to reschedule a session beyond its membership, keeping its slot', async () => {
      const m = await sell(120, {
        startsAt: new Date(Date.now() - DAY_MS),
        expiresAt: new Date(Date.now() + 2 * DAY_MS),
      })
      const ahead = await bookAhead(m, A, { day: istDay(1) })

      const moved = rescheduleBooking(ahead, ACTOR, {
        bookingDate: new Date(`${istDay(10)}T00:00:00.000Z`),
        startTime: '11:00',
        endTime: '12:00',
      })

      await expect(moved).rejects.toMatchObject({ code: ERROR_CODES.MEMBERSHIP_EXPIRED })
      expect(
        await queryRow(sql`select booking_date::text as day, reschedule_count as count
                            from booking where id = ${ahead}`),
      ).toEqual({ day: istDay(1), count: 0 })
      expect(await holdOf(ahead)).toMatchObject({ state: 'held' })
    })
  },
)
