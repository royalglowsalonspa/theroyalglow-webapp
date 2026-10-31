/************************************************************
 * Module Name  : schedule-revalidation.integration.test
 * Scope        : Integration test — schedule, leave and closure changes
 *                revalidate future assignments (REAL db, MS-09)
 *
 * Description  : Against Neon dev, with migrations 0031–0032:
 *                - saving a person's week takes them off the bookings still
 *                  to come it no longer covers, at every branch: confirmed
 *                  ones are listed for reassignment ('off_schedule'), pending
 *                  ones only lose their tentative assignee, and a booking
 *                  under way keeps its person;
 *                - the database refuses an assignee the schedule rules out on
 *                  a confirmed booking, never on work under way, and a person
 *                  without weekly rows works the branch's hours;
 *                - at commit it refuses a confirmed booking written onto a
 *                  day or time its person can't take (day off, outside the
 *                  hours, approved leave), unless they are taken off it in
 *                  the same transaction;
 *                - a move keeps the person when they can take the new time
 *                  and otherwise takes them off it with the reason, and a
 *                  salon move needn't count against the customer's limit;
 *                - availability says who isn't scheduled then, and the
 *                  default pick skips them;
 *                - the dashboard lists each branch's bookings on its closed
 *                  days, naming the branch's own closure first.
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Prefixed `srv_it_<run>` rows, deleted in one transaction in
 *                afterAll, then zero residue is proven. Bookings are dated
 *                March 2099. Every-branch closures carry the prefix in their
 *                name and apply to the real branches on those 2099 dates,
 *                harmlessly, until afterAll removes them.
 *
 * Order matters : the cases run in order and build on each other's weekly
 *                schedules, as stated at the top of each.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { booking, bookingService } from '../schema/booking'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import { approveBooking, assignStaff, startBooking } from './admin-bookings'
import { getDefaultStaffForBooking, rescheduleBooking } from './bookings'
import { getBookingsOnClosedDays } from './closures'
import { findDriverError, SQLSTATE } from './driver-errors'
import { getOpenReassignments, getOpenReassignmentsFor } from './reassignments'
import { upsertStaffSchedule } from './schedule'
import { getStaffAvailability } from './staff-occupancy'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `srv_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const OWNER = `${PREFIX}_owner`
const MANAGER = `${PREFIX}_mgr`
// Named so the Stylist sorts before the Therapist among equals.
const STYLIST = `${PREFIX}_a_sty`
const THERAPIST = `${PREFIX}_b_ther`
const CUSTOMER = `${PREFIX}_cust`
const MANAGER_P = `${MANAGER}_p`
const STYLIST_P = `${STYLIST}_p`
const THERAPIST_P = `${THERAPIST}_p`

const TIMEOUT = { timeout: 60_000 }

const OFF_SCHEDULE_MESSAGE = 'That staff member isn’t scheduled to work then. Choose someone else.'

let salonServiceId = ''

type Status = 'pending' | 'confirmed' | 'cancelled'

/** A raw salon booking with one line per entry of `staff`; errors surface as the driver's. */
async function book(
  key: string,
  params: {
    branchId?: string
    status: Status
    date: string
    start: string
    end: string
    staff: readonly (string | null)[]
  },
): Promise<string> {
  const id = `${PREFIX}_${key}`
  await db.batch([
    db.insert(booking).values({
      id,
      bookingNumber: id,
      branchId: params.branchId ?? BRANCH_A,
      customerId: CUSTOMER,
      status: params.status,
      serviceType: 'salon',
      bookingDate: new Date(`${params.date}T00:00:00.000Z`),
      startTime: params.start,
      endTime: params.end,
      totalAmountPaise: 50_000 * params.staff.length,
      totalDurationMinutes: 60,
    }),
    db.insert(bookingService).values(
      params.staff.map((staffId, index) => ({
        bookingId: id,
        serviceId: salonServiceId,
        staffId,
        serviceNameSnapshot: `ZZ Srv IT ${key} ${index}`,
        priceAtBookingPaise: 50_000,
        durationMinutes: 60,
        displayOrder: index,
      })),
    ),
  ])
  return id
}

/** A week working the given weekdays (0 = Sunday) for the given hours; the rest off. */
function week(working: Partial<Record<number, readonly [string, string]>>) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const hours = working[dayOfWeek]
    return {
      dayOfWeek,
      isWorking: hours !== undefined,
      startTime: hours?.[0] ?? null,
      endTime: hours?.[1] ?? null,
    }
  })
}

/** The weekday of an ISO date (0 = Sunday), as the database reads it. */
function weekday(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay()
}

/** `SQLSTATE constraint` the database refused `write` with, or 'written'. */
async function refusedBy(write: Promise<unknown>): Promise<string> {
  try {
    await write
  } catch (error) {
    const found = findDriverError(error, [SQLSTATE.exclusionViolation, SQLSTATE.checkViolation])
    if (found) {
      return `${String(found.code)} ${String(found.constraint)}`
    }
    throw error
  }
  return 'written'
}

/** The message `write` failed with, or 'no error'. */
async function messageOf(write: Promise<unknown>): Promise<string> {
  try {
    await write
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return 'no error'
}

/** The one person every line of the booking names, null for nobody, 'mixed' otherwise. */
async function assigneeOf(bookingId: string): Promise<string | null> {
  const rows = await queryRows<{ staff_id: string | null }>(
    sql`select distinct staff_id from booking_service where booking_id = ${bookingId}`,
  )
  if (rows.length !== 1) {
    return 'mixed'
  }
  return rows[0]?.staff_id ?? null
}

/** The booking's date, start time, status and reschedule count. */
function slotOf(bookingId: string) {
  return queryRow<{ date: string; start: string; status: string; reschedules: number }>(sql`
    select to_char(booking_date, 'YYYY-MM-DD') as date, to_char(start_time, 'HH24:MI') as start,
           status::text as status, reschedule_count as reschedules
      from booking where id = ${bookingId}`)
}

/** The open entry's reason, whom it took off, and who made the change, or null. */
function openFlagOf(bookingId: string) {
  return queryRow<{ reason: string; previous: string | null; actor: string | null }>(sql`
    select reason::text as reason, previous_staff_id as previous, created_by_id as actor
      from booking_reassignment where booking_id = ${bookingId} and resolved_at is null`)
}

/** An approved day of leave, written as the decision leaves it. */
async function approvedLeave(staffId: string, date: string) {
  await db.execute(sql`
    insert into staff_time_off (id, staff_id, date, approval_status)
    values (${`${PREFIX}_leave_${staffId}_${date}`}, ${staffId}, ${date}, 'approved')`)
}

/** Complete a running booking the way checkout does, without an invoice. */
async function complete(bookingId: string) {
  await db.execute(sql`
    update booking set status = 'completed', completed_at = now(), updated_at = now()
     where id = ${bookingId} and status = 'in_progress'`)
}

describe.skipIf(!LIVE)('schedule, leave and closure revalidation against a live database', () => {
  beforeAll(async () => {
    const service = await queryRow<{ id: string | null }>(sql`
      select s.id from service s join service_category c on c.id = s.category_id
       where s.is_active and c.service_type = 'salon' order by s.id limit 1`)
    salonServiceId = service?.id ?? ''
    expect(salonServiceId).not.toBe('')
    const number = 9200 + Math.floor(Math.random() * 90)

    // One transaction: the deferred role checks see every relationship at commit.
    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${OWNER}, 'ZZ Srv IT Owner', ${`${OWNER}@example.invalid`}, false, 'owner'),
               (${MANAGER}, 'ZZ Srv IT Manager', ${`${MANAGER}@example.invalid`}, false, 'manager'),
               (${STYLIST}, 'ZZ Srv IT Ravi', ${`${STYLIST}@example.invalid`}, false, 'staff'),
               (${THERAPIST}, 'ZZ Srv IT Meera', ${`${THERAPIST}@example.invalid`}, false, 'staff'),
               (${CUSTOMER}, 'ZZ Srv IT Customer', ${`${CUSTOMER}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order,
                            owner_user_id, manager_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Srv IT A', 'Test', '560100', '0000000000', 980, ${OWNER}, ${MANAGER}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Srv IT B', 'Test', '560100', '0000000000', 981, ${OWNER}, ${MANAGER})`),
      db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, branch_id, role_witness)
        values (${MANAGER_P}, ${MANAGER}, 'manager', true, null, 'manager'),
               (${STYLIST_P}, ${STYLIST}, 'stylist', true, ${BRANCH_A}, 'staff'),
               (${THERAPIST_P}, ${THERAPIST}, 'therapist', true, ${BRANCH_A}, 'staff')`),
      // Both perform the salon service; the Manager doesn't.
      db.execute(sql`
        insert into staff_service (staff_id, service_id)
        values (${STYLIST_P}, ${salonServiceId}), (${THERAPIST_P}, ${salonServiceId})`),
    ])
  }, 60_000)

  afterAll(async () => {
    const like = `${PREFIX}%`
    const bookings = sql`(select id from booking where id like ${like})`
    await db.batch([
      db.execute(sql`delete from booking_reassignment where booking_id in ${bookings}`),
      db.execute(sql`delete from booking_status_log where booking_id in ${bookings}`),
      db.execute(sql`delete from booking_service where booking_id in ${bookings}`),
      db.execute(sql`delete from booking where id like ${like}`),
      db.execute(sql`delete from holiday where name like ${like} or branch_id like ${like}`),
      db.execute(sql`delete from staff_time_off where staff_id like ${like}`),
      db.execute(sql`delete from staff_schedule where staff_id like ${like}`),
      db.execute(sql`delete from staff_service where staff_id like ${like}`),
      db.execute(sql`delete from audit_log where actor_id like ${like}`),
      db.execute(sql`delete from staff_profile where user_id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from booking where id like ${like}) as bookings,
               (select count(*) from booking_reassignment where booking_id like ${like}) as flags,
               (select count(*) from staff_occupancy where booking_id like ${like}) as occupancy,
               (select count(*) from staff_work where booking_id like ${like}) as work,
               (select count(*) from staff_schedule where staff_id like ${like}) as schedules,
               (select count(*) from staff_time_off where staff_id like ${like}) as time_off,
               (select count(*) from holiday where name like ${like} or branch_id like ${like}) as closures,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({
      bookings: '0',
      flags: '0',
      occupancy: '0',
      work: '0',
      schedules: '0',
      time_off: '0',
      closures: '0',
      branches: '0',
      users: '0',
    })
  }, 60_000)

  it('reads March 2099 on the weekdays the cases assume', () => {
    expect(['2099-03-02', '2099-03-03', '2099-03-04', '2099-03-05'].map(weekday)).toEqual([
      1, 2, 3, 4,
    ])
    expect(['2099-03-16', '2099-03-17', '2099-03-18', '2099-03-30'].map(weekday)).toEqual([
      1, 2, 3, 1,
    ])
  })

  // Nobody has weekly rows yet. After: the Stylist works Tuesdays and
  // Thursdays 10:00–18:00 at A.
  it(
    'takes the person off the bookings their new week no longer covers, keeping the rest',
    TIMEOUT,
    async () => {
      const monday = await book('mon_conf', {
        status: 'confirmed',
        date: '2099-03-02',
        start: '10:00',
        end: '11:00',
        staff: [STYLIST_P],
      })
      const inside = await book('tue_in', {
        status: 'confirmed',
        date: '2099-03-03',
        start: '11:00',
        end: '12:00',
        staff: [STYLIST_P],
      })
      const early = await book('tue_early', {
        status: 'confirmed',
        date: '2099-03-03',
        start: '09:00',
        end: '10:00',
        staff: [STYLIST_P],
      })
      const late = await book('tue_late', {
        status: 'confirmed',
        date: '2099-03-03',
        start: '17:30',
        end: '18:30',
        staff: [STYLIST_P],
      })
      const request = await book('mon_pend', {
        status: 'pending',
        date: '2099-03-02',
        start: '12:00',
        end: '13:00',
        staff: [STYLIST_P],
      })
      const thursday = await book('thu_run', {
        status: 'confirmed',
        date: '2099-03-05',
        start: '10:00',
        end: '11:00',
        staff: [STYLIST_P],
      })

      const saved = await upsertStaffSchedule(
        STYLIST_P,
        BRANCH_A,
        week({ 2: ['10:00', '18:00'], 4: ['10:00', '18:00'] }),
        OWNER,
      )

      expect(saved.ok).toBe(true)
      expect(saved.ok ? [...saved.reassignedBookingIds].sort() : []).toEqual(
        [early, late, monday].sort(),
      )
      // A day off, before the day's hours, after them: each taken off and
      // listed, as the Owner's change.
      for (const id of [monday, early, late]) {
        expect(await assigneeOf(id)).toBeNull()
        expect(await openFlagOf(id)).toEqual({
          reason: 'off_schedule',
          previous: STYLIST_P,
          actor: OWNER,
        })
      }
      expect((await getOpenReassignmentsFor([monday])).get(monday)).toMatchObject({
        reason: 'off_schedule',
        previousStaffName: 'ZZ Srv IT Ravi',
        heldUp: false,
      })
      // A pending request only loses its tentative assignee.
      expect(await assigneeOf(request)).toBeNull()
      expect(await openFlagOf(request)).toBeNull()
      // Within the new week: unchanged.
      expect(await assigneeOf(inside)).toBe(STYLIST_P)
      expect(await assigneeOf(thursday)).toBe(STYLIST_P)
      expect(await openFlagOf(inside)).toBeNull()
    },
  )

  it(
    'refuses an assignee their schedule rules out, and lets someone without one take it',
    TIMEOUT,
    async () => {
      const monday = `${PREFIX}_mon_conf`
      const request = `${PREFIX}_mon_pend`

      expect(await messageOf(assignStaff(monday, BRANCH_A, STYLIST_P, OWNER))).toBe(
        OFF_SCHEDULE_MESSAGE,
      )
      expect(await messageOf(approveBooking(request, BRANCH_A, OWNER, STYLIST_P))).toBe(
        OFF_SCHEDULE_MESSAGE,
      )
      expect((await slotOf(request))?.status).toBe('pending')

      // The Therapist has no weekly rows: they work the branch's hours.
      await assignStaff(monday, BRANCH_A, THERAPIST_P, OWNER)
      expect(await assigneeOf(monday)).toBe(THERAPIST_P)
      expect(await openFlagOf(monday)).toBeNull()
    },
  )

  // After: the Stylist works Tuesdays only; the Therapist Mondays only.
  it(
    'leaves a booking under way with its person, and never refuses running work for the schedule',
    TIMEOUT,
    async () => {
      const running = `${PREFIX}_thu_run`
      expect(
        (await startBooking({ bookingId: running, branchId: BRANCH_A, changedById: OWNER })).ok,
      ).toBe(true)

      expect(
        await upsertStaffSchedule(STYLIST_P, BRANCH_A, week({ 2: ['10:00', '18:00'] }), OWNER),
      ).toEqual({ ok: true, reassignedBookingIds: [] })
      expect(await assigneeOf(running)).toBe(STYLIST_P)

      expect(
        await upsertStaffSchedule(THERAPIST_P, BRANCH_A, week({ 1: ['10:00', '18:00'] }), OWNER),
      ).toEqual({ ok: true, reassignedBookingIds: [] })
      // Thursday is the Therapist's day off, yet they can take over work under way.
      await assignStaff(running, BRANCH_A, THERAPIST_P, OWNER)
      expect(await assigneeOf(running)).toBe(THERAPIST_P)

      await complete(running)
      expect((await slotOf(running))?.status).toBe('completed')
    },
  )

  it(
    'refuses, at commit, a confirmed booking written onto a day or time its person can’t take',
    TIMEOUT,
    async () => {
      const inside = `${PREFIX}_tue_in`
      await approvedLeave(STYLIST_P, '2099-03-10')

      // A Monday (their day off), past their hours, their day of leave.
      expect(
        await refusedBy(
          db.execute(sql`update booking set booking_date = '2099-03-02' where id = ${inside}`),
        ),
      ).toBe('23514 booking_assignee_off_schedule')
      expect(
        await refusedBy(
          db.execute(
            sql`update booking set start_time = '18:00', end_time = '19:00' where id = ${inside}`,
          ),
        ),
      ).toBe('23514 booking_assignee_off_schedule')
      expect(
        await refusedBy(
          db.execute(sql`update booking set booking_date = '2099-03-10' where id = ${inside}`),
        ),
      ).toBe('23514 booking_assignee_on_leave')
      expect(await slotOf(inside)).toMatchObject({ date: '2099-03-03', start: '11:00' })

      // Confirming a request that names them on their day off, too.
      const request = await book('mon_pend2', {
        status: 'pending',
        date: '2099-03-09',
        start: '10:00',
        end: '11:00',
        staff: [STYLIST_P],
      })
      expect(
        await refusedBy(
          db.execute(sql`update booking set status = 'confirmed' where id = ${request}`),
        ),
      ).toBe('23514 booking_assignee_off_schedule')
      expect((await slotOf(request))?.status).toBe('pending')

      // Taken off it in the same transaction, the move stands.
      await db.batch([
        db.execute(sql`update booking_service set staff_id = null where booking_id = ${inside}`),
        db.execute(sql`update booking set booking_date = '2099-03-02' where id = ${inside}`),
      ])
      expect(await slotOf(inside)).toMatchObject({ date: '2099-03-02', status: 'confirmed' })
      expect(await assigneeOf(inside)).toBeNull()
    },
  )

  it(
    'moves a booking with its person when they can take the new time, otherwise without them',
    TIMEOUT,
    async () => {
      const moving = await book('res_conf', {
        status: 'confirmed',
        date: '2099-03-03',
        start: '14:00',
        end: '15:00',
        staff: [STYLIST_P],
      })

      // Another Tuesday: they keep it, and the customer's move counts.
      const kept = await rescheduleBooking(moving, CUSTOMER, {
        bookingDate: new Date('2099-03-17T00:00:00.000Z'),
        startTime: '15:00',
        endTime: '16:00',
      })
      expect(kept?.rescheduleCount).toBe(1)
      expect(await assigneeOf(moving)).toBe(STYLIST_P)
      expect(await openFlagOf(moving)).toBeNull()

      // A Monday, their day off: moved without them by the salon, uncounted.
      const released = await rescheduleBooking(moving, OWNER, {
        bookingDate: new Date('2099-03-16T00:00:00.000Z'),
        startTime: '15:00',
        endTime: '16:00',
        countsTowardLimit: false,
      })
      expect(released).toMatchObject({ status: 'confirmed', rescheduleCount: 1 })
      expect(await slotOf(moving)).toMatchObject({ date: '2099-03-16', start: '15:00' })
      expect(await assigneeOf(moving)).toBeNull()
      expect(await openFlagOf(moving)).toEqual({
        reason: 'off_schedule',
        previous: STYLIST_P,
        actor: OWNER,
      })

      // The Therapist works Mondays; then a Monday of their leave.
      await assignStaff(moving, BRANCH_A, THERAPIST_P, OWNER)
      expect(await openFlagOf(moving)).toBeNull()
      await approvedLeave(THERAPIST_P, '2099-03-30')
      await rescheduleBooking(moving, OWNER, {
        bookingDate: new Date('2099-03-30T00:00:00.000Z'),
        startTime: '15:00',
        endTime: '16:00',
        countsTowardLimit: false,
      })
      expect(await assigneeOf(moving)).toBeNull()
      expect(await openFlagOf(moving)).toEqual({
        reason: 'unavailable',
        previous: THERAPIST_P,
        actor: OWNER,
      })
      expect((await slotOf(moving))?.reschedules).toBe(1)

      // A request keeps its tentative assignee for approval to replace.
      const request = await book('res_pend', {
        status: 'pending',
        date: '2099-03-03',
        start: '16:00',
        end: '17:00',
        staff: [STYLIST_P],
      })
      await rescheduleBooking(request, CUSTOMER, {
        bookingDate: new Date('2099-03-16T00:00:00.000Z'),
        startTime: '16:00',
        endTime: '17:00',
      })
      expect(await assigneeOf(request)).toBe(STYLIST_P)
      expect(await openFlagOf(request)).toBeNull()
    },
  )

  // After: the shared Manager works Wednesdays at A, every other day off.
  it(
    'takes a shared Manager off another branch’s booking on a day they now work here',
    TIMEOUT,
    async () => {
      const there = await book('b_wed', {
        branchId: BRANCH_B,
        status: 'confirmed',
        date: '2099-03-04',
        start: '10:00',
        end: '11:00',
        staff: [MANAGER_P],
      })
      const here = await book('a_wed', {
        status: 'confirmed',
        date: '2099-03-04',
        start: '12:00',
        end: '13:00',
        staff: [MANAGER_P],
      })

      expect(
        await upsertStaffSchedule(MANAGER_P, BRANCH_A, week({ 3: ['10:00', '18:00'] }), OWNER),
      ).toEqual({ ok: true, reassignedBookingIds: [there] })

      expect(await assigneeOf(there)).toBeNull()
      expect(await openFlagOf(there)).toEqual({
        reason: 'off_schedule',
        previous: MANAGER_P,
        actor: OWNER,
      })
      // Listed for B's reception, not A's.
      expect((await getOpenReassignments(BRANCH_B)).map((w) => w.bookingId)).toEqual([there])
      expect((await getOpenReassignments(BRANCH_A)).map((w) => w.bookingId)).not.toContain(there)
      expect(await assigneeOf(here)).toBe(MANAGER_P)
    },
  )

  it(
    'says who isn’t scheduled then, and picks by default only someone who is',
    TIMEOUT,
    async () => {
      const busyAt = async (branchId: string, dateISO: string) =>
        new Map(
          (
            await getStaffAvailability({
              branchId,
              slot: { dateISO, startTime: '10:00', endTime: '11:00', kind: 'salon' },
            })
          ).map((person) => [person.id, person.busy]),
        )

      // Monday: only the Therapist works.
      const monday = await busyAt(BRANCH_A, '2099-03-16')
      expect(monday.get(STYLIST_P)).toEqual({ reason: 'off_schedule' })
      expect(monday.get(MANAGER_P)).toEqual({ reason: 'off_schedule' })
      expect(monday.get(THERAPIST_P)).toBeNull()
      // Leave is said first.
      expect((await busyAt(BRANCH_A, '2099-03-30')).get(THERAPIST_P)).toEqual({
        reason: 'on_leave',
      })
      expect((await busyAt(BRANCH_A, '2099-03-10')).get(STYLIST_P)).toEqual({ reason: 'on_leave' })
      // The Manager's Wednesday is A's, so B can't have them then.
      expect((await busyAt(BRANCH_B, '2099-03-18')).get(MANAGER_P)).toEqual({
        reason: 'off_schedule',
      })

      const pick = (dateISO: string) =>
        getDefaultStaffForBooking({
          serviceIds: [salonServiceId],
          branchId: BRANCH_A,
          dateISO,
          slot: { startTime: '10:00', endTime: '11:00', kind: 'salon' },
        })
      expect(await pick('2099-03-16')).toBe(THERAPIST_P)
      expect(await pick('2099-03-17')).toBe(STYLIST_P)
      // Wednesday: neither performer works, so the Manager.
      expect(await pick('2099-03-18')).toBe(MANAGER_P)
    },
  )

  it(
    'lists each branch’s bookings on its closed days, naming its own closure first',
    TIMEOUT,
    async () => {
      await db.execute(sql`
        insert into holiday (id, branch_id, date, name)
        values (${`${PREFIX}_h1`}, ${BRANCH_A}, '2099-03-23', ${`${PREFIX} A 23`}),
               (${`${PREFIX}_h2`}, ${BRANCH_A}, '2099-03-24', ${`${PREFIX} A 24`}),
               (${`${PREFIX}_h3`}, null, '2099-03-24', ${`${PREFIX} all 24`}),
               (${`${PREFIX}_h4`}, null, '2099-03-25', ${`${PREFIX} all 25`})`)
      const nobody = [null]
      const request = await book('c23p', {
        status: 'pending',
        date: '2099-03-23',
        start: '10:00',
        end: '11:00',
        staff: nobody,
      })
      await book('c23x', {
        status: 'cancelled',
        date: '2099-03-23',
        start: '11:00',
        end: '12:00',
        staff: nobody,
      })
      const own = await book('c24', {
        status: 'confirmed',
        date: '2099-03-24',
        start: '11:00',
        end: '12:00',
        staff: nobody,
      })
      const everyBranch = await book('c25', {
        status: 'confirmed',
        date: '2099-03-25',
        start: '09:30',
        end: '10:30',
        staff: nobody,
      })
      await book('c26', {
        status: 'confirmed',
        date: '2099-03-26',
        start: '10:00',
        end: '11:00',
        staff: nobody,
      })
      const atB = await book('b25', {
        branchId: BRANCH_B,
        status: 'pending',
        date: '2099-03-25',
        start: '10:00',
        end: '11:00',
        staff: nobody,
      })

      expect(await getBookingsOnClosedDays(BRANCH_A)).toEqual([
        {
          id: request,
          bookingNumber: request,
          date: '2099-03-23',
          startTime: '10:00',
          status: 'pending',
          customerName: 'ZZ Srv IT Customer',
          closureName: `${PREFIX} A 23`,
        },
        {
          id: own,
          bookingNumber: own,
          date: '2099-03-24',
          startTime: '11:00',
          status: 'confirmed',
          customerName: 'ZZ Srv IT Customer',
          closureName: `${PREFIX} A 24`,
        },
        {
          id: everyBranch,
          bookingNumber: everyBranch,
          date: '2099-03-25',
          startTime: '09:30',
          status: 'confirmed',
          customerName: 'ZZ Srv IT Customer',
          closureName: `${PREFIX} all 25`,
        },
      ])
      expect((await getBookingsOnClosedDays(BRANCH_B)).map((b) => [b.id, b.closureName])).toEqual([
        [atB, `${PREFIX} all 25`],
      ])
    },
  )

  // Each round: the Therapist works Mondays, then a week without Mondays is
  // saved while they are assigned to a Monday booking. After: Mondays again.
  it(
    'never keeps an assignee that a week saved at the same moment rules out (MS-09)',
    TIMEOUT,
    async () => {
      const mondaysOnly = week({ 1: ['10:00', '18:00'] })
      for (const round of [1, 2, 3]) {
        await upsertStaffSchedule(THERAPIST_P, BRANCH_A, mondaysOnly, OWNER)
        const raced = await book(`race_${round}`, {
          status: 'confirmed',
          date: '2099-03-09',
          start: '13:00',
          end: '14:00',
          staff: [null],
        })

        const [assigned, saved] = await Promise.allSettled([
          assignStaff(raced, BRANCH_A, THERAPIST_P, OWNER),
          upsertStaffSchedule(THERAPIST_P, BRANCH_A, week({ 2: ['10:00', '18:00'] }), OWNER),
        ])

        expect(saved.status).toBe('fulfilled')
        expect(await assigneeOf(raced)).toBeNull()
        if (assigned.status === 'fulfilled') {
          // The assignment committed first: the save took them off it again.
          const released =
            saved.status === 'fulfilled' && saved.value.ok ? saved.value.reassignedBookingIds : []
          expect(released).toContain(raced)
          expect((await openFlagOf(raced))?.reason).toBe('off_schedule')
        } else {
          // The save committed first: the assignment was checked against it.
          expect(assigned.reason instanceof Error ? assigned.reason.message : null).toBe(
            OFF_SCHEDULE_MESSAGE,
          )
        }
      }
      await upsertStaffSchedule(THERAPIST_P, BRANCH_A, mondaysOnly, OWNER)
    },
  )
})
