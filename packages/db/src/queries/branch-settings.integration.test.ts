/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 30-10-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : branch-settings.integration.test
 * Scope        : Integration test — branch booking settings (REAL db)
 *
 * Description  : Against Neon dev, with migrations 0019 and 0020 and two
 *                throwaway branches (multi-branch R1.1, R6.3, TX-09):
 *                  - a new branch starts from the primary branch's current
 *                    settings as revision 1; the SQL defaults equal the
 *                    documented defaults in @rgss/types;
 *                  - a save adds the next revision with one section changed
 *                    and the other carried over; a stale save, and the loser
 *                    of two saves at once, are refused; numbers have no gaps;
 *                  - a revision can't be edited or deleted;
 *                  - one branch's save changes no other branch's decisions;
 *                  - an unreadable section stops bookings (409) and is
 *                    reported as unset, never defaulted, until saved again;
 *                  - a booking records a revision its own branch has;
 *                  - a late cancellation is counted once on the customer's
 *                    record and its log names the revision; a reschedule
 *                    records the revision that accepted the new slot;
 *                  - the booking limit counts only upcoming bookings there.
 *
 * Skip behaviour : Skips without packages/db/.env (CI). Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : Prefixed `bset_it_<run>` rows, deleted in one transaction in
 *                afterAll (the branches' revisions go with them), then zero
 *                residue is proven. The branches reuse the primary branch's
 *                Owner.
 ************************************************************/

import { ERROR_CODES } from '@rgss/errors'
import { DEFAULT_BOOKING_RULES, DEFAULT_BUSINESS_HOURS } from '@rgss/types'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import { cancelBooking, createBookingWithServices, rescheduleBooking } from './bookings'
import {
  countUpcomingBookingsAtBranch,
  getBranchPolicy,
  getBranchSettingsForAdmin,
  saveBranchSettingsSection,
} from './branch-settings'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `bset_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const CUSTOMER = `${PREFIX}_customer`
// Who saves; any user row will do (there is only one Developer).
const ACTOR = `${PREFIX}_dev`

let bookingSeq = 0

/** Every message down the error's cause chain (Drizzle wraps the Postgres error). */
async function failure(write: PromiseLike<unknown>): Promise<string> {
  try {
    await write
  } catch (error) {
    const messages: string[] = []
    let current: unknown = error
    for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
      messages.push(current.message)
      current = (current as { cause?: unknown }).cause
    }
    return messages.join(' | ')
  }
  return 'no error'
}

/** A branch's revisions, oldest first. */
async function revisionsOf(branchId: string) {
  return queryRows<{
    revision: number
    changed_section: string | null
    created_by: string | null
    business_hours: unknown
    booking_rules: unknown
  }>(sql`
    select revision, changed_section, created_by, business_hours, booking_rules
      from branch_setting where branch_id = ${branchId} order by revision`)
}

/** A confirmed booking for the suite's customer at the branch. */
async function book(branchId: string, bookingDate: string, settingsRevision: number | null) {
  bookingSeq += 1
  return createBookingWithServices(
    {
      bookingNumber: `${PREFIX}_bk${bookingSeq}`,
      branchId,
      customerId: CUSTOMER,
      status: 'confirmed',
      serviceType: 'salon',
      bookingDate: new Date(`${bookingDate}T00:00:00.000Z`),
      startTime: '14:00',
      endTime: '15:00',
      totalAmountPaise: 0,
      totalDurationMinutes: 60,
      settingsRevision,
    },
    [],
  )
}

/** 'YYYY-MM-DD' `days` from today on the IST calendar. */
function istDatePlus(days: number): string {
  return new Date(Date.now() + 5.5 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10)
}

describe.skipIf(!LIVE)('branch booking settings against a live database', () => {
  beforeAll(async () => {
    const owner = await queryRow<{ id: string }>(
      sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
    )
    const number = 9500 + Math.floor(Math.random() * 90)

    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${CUSTOMER}, 'ZZ Bset IT customer', ${`${CUSTOMER}@example.invalid`}, false, 'customer'),
               (${ACTOR}, 'ZZ Bset IT Developer', ${`${ACTOR}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into customer_profile (id, user_id) values (${`${CUSTOMER}_p`}, ${CUSTOMER})`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order, owner_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Bset IT A', 'Test', '560100', '0000000000', 990, ${owner?.id ?? ''}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Bset IT B', 'Test', '560100', '0000000000', 991, ${owner?.id ?? ''})`),
    ])
  })

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(
        sql`delete from booking_status_log where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(sql`delete from booking where booking_number like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from customer_profile where user_id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from branch_setting where branch_id like ${like}) as settings,
               (select count(*) from booking where booking_number like ${like}) as bookings,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from customer_profile where user_id like ${like}) as profiles,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({ settings: '0', bookings: '0', branches: '0', profiles: '0', users: '0' })
  })

  it("starts a new branch from the primary branch's current settings", async () => {
    const primary = await queryRow<{ business_hours: unknown; booking_rules: unknown }>(sql`
      select s.business_hours, s.booking_rules
        from branch_setting s join branch p on p.id = s.branch_id
       where p.is_primary and p.id not like ${`${PREFIX}%`}
       order by p.display_order, p.id, s.revision desc
       limit 1`)
    const [first, ...rest] = await revisionsOf(BRANCH_A)

    expect(rest).toEqual([])
    expect(first).toMatchObject({ revision: 1, changed_section: null, created_by: null })
    expect(first?.business_hours).toEqual(primary?.business_hours)
    expect(first?.booking_rules).toEqual(primary?.booking_rules)
  })

  it('keeps the SQL defaults equal to the documented defaults', async () => {
    const defaults = await queryRow<{ hours: unknown; rules: unknown }>(
      sql`select branch_default_business_hours() as hours, branch_default_booking_rules() as rules`,
    )
    expect(defaults?.hours).toEqual(DEFAULT_BUSINESS_HOURS)
    expect(defaults?.rules).toEqual(DEFAULT_BOOKING_RULES)
  })

  it('reads the current revision for a booking decision', async () => {
    const policy = await getBranchPolicy(BRANCH_A)

    expect(policy).toMatchObject({ branchId: BRANCH_A, branchName: 'ZZ Bset IT A', revision: 1 })
    expect(await getBranchPolicy(`${PREFIX}_nowhere`)).toBeNull()
  })

  it('saves a section as the next revision, carrying the other over', async () => {
    const before = await getBranchPolicy(BRANCH_A)
    const rules = {
      ...DEFAULT_BOOKING_RULES,
      cancellationCutoffHours: 6,
      maxReschedulesPerBooking: 1,
    }

    const saved = await saveBranchSettingsSection({
      branchId: BRANCH_A,
      section: 'bookingRules',
      value: rules,
      expectedRevision: 1,
      actorId: ACTOR,
    })

    expect(saved).toMatchObject({ ok: true, revision: 2 })
    const [, second] = await revisionsOf(BRANCH_A)
    expect(second).toMatchObject({
      revision: 2,
      changed_section: 'booking_rules',
      created_by: ACTOR,
    })
    expect(second?.booking_rules).toEqual(rules)
    expect(second?.business_hours).toEqual(before?.businessHours)

    const admin = await getBranchSettingsForAdmin(BRANCH_A)
    expect(admin?.current).toMatchObject({
      revision: 2,
      savedByName: 'ZZ Bset IT Developer',
      bookingRules: rules,
    })
    expect(admin?.history.map((h) => [h.revision, h.section])).toEqual([
      [2, 'bookingRules'],
      [1, null],
    ])
  })

  it('refuses a stale save, and the loser of two saves at once, without gaps', async () => {
    const stale = await saveBranchSettingsSection({
      branchId: BRANCH_A,
      section: 'businessHours',
      value: DEFAULT_BUSINESS_HOURS,
      expectedRevision: 1,
      actorId: ACTOR,
    })
    expect(stale).toEqual({ ok: false, reason: 'stale' })

    const both = await Promise.all(
      [10, 11].map((open) =>
        saveBranchSettingsSection({
          branchId: BRANCH_A,
          section: 'businessHours',
          value: {
            ...DEFAULT_BUSINESS_HOURS,
            mon: { open: `${open}:00`, close: '21:00', closed: false },
          },
          expectedRevision: 2,
          actorId: ACTOR,
        }),
      ),
    )
    expect(both.filter((r) => r.ok)).toHaveLength(1)
    expect(both.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'stale' }])
    expect((await revisionsOf(BRANCH_A)).map((r) => r.revision)).toEqual([1, 2, 3])

    expect(
      await saveBranchSettingsSection({
        branchId: `${PREFIX}_nowhere`,
        section: 'businessHours',
        value: DEFAULT_BUSINESS_HOURS,
        expectedRevision: 0,
        actorId: ACTOR,
      }),
    ).toEqual({ ok: false, reason: 'missing' })
  })

  it('never edits, deletes or skips a revision', async () => {
    expect(
      await failure(
        db.execute(sql`update branch_setting set booking_rules = '{}'::jsonb
          where branch_id = ${BRANCH_A} and revision = 1`),
      ),
    ).toMatch(/can't change; save a new revision/)
    expect(
      await failure(
        db.execute(sql`delete from branch_setting where branch_id = ${BRANCH_A} and revision = 1`),
      ),
    ).toMatch(/can't be deleted/)
    expect(
      await failure(
        db.execute(sql`insert into branch_setting (id, branch_id, revision, business_hours, booking_rules)
          values (${`${PREFIX}_gap`}, ${BRANCH_A}, 9, '{}'::jsonb, '{}'::jsonb)`),
      ),
    ).toMatch(/so the next one is 4, not 9/)
  })

  it("changes no other branch's decisions (TX-09)", async () => {
    const before = await getBranchPolicy(BRANCH_B)
    const closedTuesdays = {
      ...DEFAULT_BUSINESS_HOURS,
      tue: { open: null, close: null, closed: true },
    }

    const saved = await saveBranchSettingsSection({
      branchId: BRANCH_A,
      section: 'businessHours',
      value: closedTuesdays,
      expectedRevision: 3,
      actorId: ACTOR,
    })

    expect(saved).toMatchObject({ ok: true, revision: 4 })
    expect((await getBranchPolicy(BRANCH_A))?.businessHours.tue.closed).toBe(true)
    expect(await getBranchPolicy(BRANCH_B)).toEqual(before)
  })

  it('stops bookings on an unreadable section, and reports it unset until saved', async () => {
    await db.execute(sql`
      insert into branch_setting (id, branch_id, revision, business_hours, booking_rules, changed_section)
      select ${`${PREFIX}_bad`}, branch_id, 2, business_hours, '{"leadTime": "soon"}'::jsonb,
             'booking_rules'::branch_setting_section
        from branch_setting where branch_id = ${BRANCH_B} and revision = 1`)

    await expect(getBranchPolicy(BRANCH_B)).rejects.toMatchObject({
      code: ERROR_CODES.BRANCH_SETTINGS_INCOMPLETE,
      statusCode: 409,
      message:
        'ZZ Bset IT B has no valid booking settings. The Developer sets them under Settings.',
    })
    const admin = await getBranchSettingsForAdmin(BRANCH_B)
    expect(admin?.current.revision).toBe(2)
    expect(admin?.current.bookingRules).toBeNull()
    expect(admin?.current.businessHours).not.toBeNull()

    const fixed = await saveBranchSettingsSection({
      branchId: BRANCH_B,
      section: 'bookingRules',
      value: DEFAULT_BOOKING_RULES,
      expectedRevision: 2,
      actorId: ACTOR,
    })
    expect(fixed).toMatchObject({ ok: true, revision: 3 })
    expect(await getBranchPolicy(BRANCH_B)).toMatchObject({
      revision: 3,
      bookingRules: DEFAULT_BOOKING_RULES,
    })
  })

  it('stores the revision a booking used, only one its own branch has', async () => {
    const accepted = await book(BRANCH_A, istDatePlus(5), 4)
    expect(accepted.settingsRevision).toBe(4)

    // Branch B has revisions 1–3 only.
    expect(await failure(book(BRANCH_B, istDatePlus(5), 4))).toMatch(
      /booking_branch_settings_revision_fk/,
    )
    // Bookings from before branch settings keep no revision.
    expect((await book(BRANCH_A, istDatePlus(6), null)).settingsRevision).toBeNull()
  })

  it('counts a late cancellation once, logging the revision that decided it', async () => {
    const target = await book(BRANCH_A, istDatePlus(1), 4)
    const countOf = async () =>
      Number(
        (
          await queryRow<{ n: number }>(
            sql`select late_cancellation_count as n from customer_profile where user_id = ${CUSTOMER}`,
          )
        )?.n,
      )
    const before = await countOf()

    // A double submit: both read the booking as confirmed; one cancels it.
    const both = await Promise.allSettled([
      cancelBooking(target.id, CUSTOMER, 'Running late', { late: true, settingsRevision: 4 }),
      cancelBooking(target.id, CUSTOMER, 'Running late', { late: true, settingsRevision: 4 }),
    ])

    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const refused = both.find((r) => r.status === 'rejected')
    expect((refused as PromiseRejectedResult | undefined)?.reason).toMatchObject({
      code: ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
      statusCode: 409,
    })
    expect(await countOf()).toBe(before + 1)
    const logs = await queryRows<{
      to_status: string
      notes: string
      settings_revision: number
    }>(sql`
      select to_status, notes, settings_revision from booking_status_log where booking_id = ${target.id}`)
    expect(logs).toEqual([
      { to_status: 'cancelled', notes: 'Late cancellation: Running late', settings_revision: 4 },
    ])
  })

  it('leaves the count alone for a cancellation in time', async () => {
    const target = await book(BRANCH_A, istDatePlus(9), 4)
    const before = await queryRow<{ n: number }>(
      sql`select late_cancellation_count as n from customer_profile where user_id = ${CUSTOMER}`,
    )

    const cancelled = await cancelBooking(target.id, CUSTOMER, null, {
      late: false,
      settingsRevision: 4,
    })

    expect(cancelled?.status).toBe('cancelled')
    expect(
      await queryRow(
        sql`select late_cancellation_count as n from customer_profile where user_id = ${CUSTOMER}`,
      ),
    ).toEqual(before)
    expect(
      await queryRow(
        sql`select notes, settings_revision from booking_status_log where booking_id = ${target.id}`,
      ),
    ).toEqual({ notes: 'Cancelled', settings_revision: 4 })
  })

  it('records the revision that accepted a rescheduled slot', async () => {
    const target = await book(BRANCH_A, istDatePlus(2), 2)
    const newDate = istDatePlus(3)

    const moved = await rescheduleBooking(target.id, CUSTOMER, {
      bookingDate: new Date(`${newDate}T00:00:00.000Z`),
      startTime: '15:00',
      endTime: '16:00',
      settingsRevision: 4,
    })

    expect(moved).toMatchObject({ settingsRevision: 4, rescheduleCount: 1, startTime: '15:00:00' })
    expect(
      await queryRow(
        sql`select from_status, to_status, settings_revision from booking_status_log where booking_id = ${target.id}`,
      ),
    ).toEqual({ from_status: 'confirmed', to_status: 'confirmed', settings_revision: 4 })
  })

  it('counts only upcoming bookings at the branch for its limit', async () => {
    const today = istDatePlus(0)
    // Two confirmed bookings remain open at A from the cases above (days 2 → 3
    // moved, and day 5), plus the one with no revision (day 6).
    expect(await countUpcomingBookingsAtBranch(CUSTOMER, BRANCH_A, today)).toBe(3)
    expect(await countUpcomingBookingsAtBranch(CUSTOMER, BRANCH_B, today)).toBe(0)
    // From a later day, the earlier ones are past.
    expect(await countUpcomingBookingsAtBranch(CUSTOMER, BRANCH_A, istDatePlus(4))).toBe(2)
  })
})
