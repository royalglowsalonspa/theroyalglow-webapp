/************************************************************
 * Module Name  : staff-occupancy.integration.test
 * Scope        : Integration test — staff occupancy and actual work
 *                (REAL db, MS-07, MS-08, MS-10)
 *
 * Description  : Against Neon dev, with migrations 0027–0028:
 *                - a SPA booking overlaps no other booking of the same
 *                  person, at any branch; salon bookings may overlap each
 *                  other; back-to-back bookings don't overlap; pending
 *                  bookings hold nobody;
 *                - a running SPA blocks the person's next start, a running
 *                  salon service a SPA start, until it completes;
 *                - the projections follow approve, assign, reschedule,
 *                  cancel, start, complete and no-show;
 *                - only the database writes the projections, and a
 *                  confirmed booking names one assignee;
 *                - approve and assign explain a refusal, a move onto a time
 *                  the person is booked goes ahead without them (MS-09), and
 *                  the default pick for a booking skips a person busy then.
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Prefixed `occ_it_<run>` rows, deleted in one transaction in
 *                afterAll, then zero residue is proven. Bookings are dated
 *                2099, one day per case.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { booking, bookingService } from '../schema/booking'
import { isLiveDbAvailable, queryRow } from '../test/live-db'
import { approveBooking, assignStaff, markBookingNoShow, startBooking } from './admin-bookings'
import { cancelBooking, getDefaultStaffForBooking, rescheduleBooking } from './bookings'
import { findDriverError, SQLSTATE } from './driver-errors'
import { getOpenReassignmentsFor } from './reassignments'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `occ_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const OWNER = `${PREFIX}_owner`
const MANAGER = `${PREFIX}_mgr`
// Named so the Therapist sorts before the Stylist among equals.
const THERAPIST = `${PREFIX}_a_ther`
const STYLIST = `${PREFIX}_b_sty`
const CUSTOMER = `${PREFIX}_cust`
const MANAGER_P = `${MANAGER}_p`
const THERAPIST_P = `${THERAPIST}_p`
const STYLIST_P = `${STYLIST}_p`

const TIMEOUT = { timeout: 60_000 }

let spaServiceId = ''
let salonServiceId = ''

type Kind = 'salon' | 'spa'

/** A raw booking with one service line per entry of `staff`; errors surface as the driver's. */
async function book(
  key: string,
  params: {
    branchId: string
    kind: Kind
    status: 'pending' | 'confirmed'
    date: string
    start: string
    end: string
    staff: readonly (string | null)[]
  },
): Promise<string> {
  const id = `${PREFIX}_${key}`
  const serviceId = params.kind === 'spa' ? spaServiceId : salonServiceId
  await db.batch([
    db.insert(booking).values({
      id,
      bookingNumber: id,
      branchId: params.branchId,
      customerId: CUSTOMER,
      status: params.status,
      serviceType: params.kind,
      bookingDate: new Date(`${params.date}T00:00:00.000Z`),
      startTime: params.start,
      endTime: params.end,
      totalAmountPaise: 50_000 * params.staff.length,
      totalDurationMinutes: 60,
    }),
    db.insert(bookingService).values(
      params.staff.map((staffId, index) => ({
        bookingId: id,
        serviceId,
        staffId,
        serviceNameSnapshot: `ZZ Occ IT ${key} ${index}`,
        priceAtBookingPaise: 50_000,
        durationMinutes: 60,
        displayOrder: index,
      })),
    ),
  ])
  return id
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

type Occupancy = { staff: string; branch: string; kind: string; from: string; to: string }

/** The booking's occupancy row, its interval in IST, or null. */
function occupancyOf(bookingId: string) {
  return queryRow<Occupancy>(sql`
    select staff_id as staff, branch_id as branch, kind::text as kind,
           to_char(lower(during) at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as "from",
           to_char(upper(during) at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as "to"
      from staff_occupancy where booking_id = ${bookingId}`)
}

type Work = { staff: string; kind: string; running: boolean }

/** The booking's actual-work row, or null. */
function workOf(bookingId: string) {
  return queryRow<Work>(sql`
    select staff_id as staff, kind::text as kind, upper_inf(during) as running
      from staff_work where booking_id = ${bookingId}`)
}

async function statusOf(bookingId: string): Promise<string | null> {
  return (
    (await queryRow<{ status: string }>(
      sql`select status::text as status from booking where id = ${bookingId}`,
    )) ?? { status: null }
  ).status
}

/** Complete a running booking the way checkout does, without an invoice. */
async function complete(bookingId: string) {
  await db.execute(sql`
    update booking set status = 'completed', completed_at = now(), updated_at = now()
     where id = ${bookingId}`)
}

function start(bookingId: string, branchId = BRANCH_A) {
  return startBooking({ bookingId, branchId, changedById: OWNER })
}

describe.skipIf(!LIVE)('staff occupancy against a live database', () => {
  beforeAll(async () => {
    const services = await queryRow<{ spa: string | null; salon: string | null }>(sql`
      select (select s.id from service s join service_category c on c.id = s.category_id
               where s.is_active and c.service_type = 'spa' order by s.id limit 1) as spa,
             (select s.id from service s join service_category c on c.id = s.category_id
               where s.is_active and c.service_type = 'salon' order by s.id limit 1) as salon`)
    spaServiceId = services?.spa ?? ''
    salonServiceId = services?.salon ?? ''
    expect(spaServiceId).not.toBe('')
    expect(salonServiceId).not.toBe('')
    const number = 9500 + Math.floor(Math.random() * 90)

    // One transaction: the deferred role checks see every relationship at commit.
    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${OWNER}, 'ZZ Occ IT Owner', ${`${OWNER}@example.invalid`}, false, 'owner'),
               (${MANAGER}, 'ZZ Occ IT Manager', ${`${MANAGER}@example.invalid`}, false, 'manager'),
               (${THERAPIST}, 'ZZ Occ IT Meera', ${`${THERAPIST}@example.invalid`}, false, 'staff'),
               (${STYLIST}, 'ZZ Occ IT Ravi', ${`${STYLIST}@example.invalid`}, false, 'staff'),
               (${CUSTOMER}, 'ZZ Occ IT Customer', ${`${CUSTOMER}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order,
                            owner_user_id, manager_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Occ IT A', 'Test', '560100', '0000000000', 990, ${OWNER}, ${MANAGER}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Occ IT B', 'Test', '560100', '0000000000', 991, ${OWNER}, ${MANAGER})`),
      db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, branch_id, role_witness)
        values (${MANAGER_P}, ${MANAGER}, 'manager', true, null, 'manager'),
               (${THERAPIST_P}, ${THERAPIST}, 'therapist', true, ${BRANCH_A}, 'staff'),
               (${STYLIST_P}, ${STYLIST}, 'stylist', true, ${BRANCH_A}, 'staff')`),
      // The Therapist performs both services, the Stylist the salon one.
      db.execute(sql`
        insert into staff_service (staff_id, service_id)
        values (${THERAPIST_P}, ${spaServiceId}), (${THERAPIST_P}, ${salonServiceId}),
               (${STYLIST_P}, ${salonServiceId})`),
    ])
  }, 60_000)

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(
        sql`delete from booking_status_log where booking_id in (select id from booking where id like ${like})`,
      ),
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where id like ${like})`,
      ),
      db.execute(sql`delete from booking where id like ${like}`),
      db.execute(sql`delete from staff_service where staff_id like ${like}`),
      db.execute(sql`delete from audit_log where actor_id like ${like}`),
      db.execute(sql`delete from staff_profile where user_id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from booking where id like ${like}) as bookings,
               (select count(*) from staff_occupancy where booking_id like ${like}) as occupancy,
               (select count(*) from staff_work where booking_id like ${like}) as work,
               (select count(*) from staff_service where staff_id like ${like}) as mappings,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({
      bookings: '0',
      occupancy: '0',
      work: '0',
      mappings: '0',
      branches: '0',
      users: '0',
    })
  }, 60_000)

  it(
    'keeps a SPA booking clear of every other booking of the same person, at any branch',
    TIMEOUT,
    async () => {
      const day = '2099-07-01'
      const spaA = await book('d1_spa_a', {
        branchId: BRANCH_A,
        kind: 'spa',
        status: 'confirmed',
        date: day,
        start: '10:00',
        end: '11:00',
        staff: [MANAGER_P],
      })
      expect(await occupancyOf(spaA)).toEqual({
        staff: MANAGER_P,
        branch: BRANCH_A,
        kind: 'spa',
        from: '2099-07-01 10:00',
        to: '2099-07-01 11:00',
      })

      // The same person at the other branch, overlapping: SPA or salon, refused.
      const overlapping = {
        branchId: BRANCH_B,
        status: 'confirmed',
        date: day,
        start: '10:30',
        end: '11:30',
        staff: [MANAGER_P],
      } as const
      expect(await refusedBy(book('d1_spa_b', { ...overlapping, kind: 'spa' }))).toBe(
        '23P01 staff_occupancy_spa_overlap',
      )
      expect(await refusedBy(book('d1_salon_b', { ...overlapping, kind: 'salon' }))).toBe(
        '23P01 staff_occupancy_mixed_overlap',
      )
      expect(await statusOf(`${PREFIX}_d1_spa_b`)).toBeNull()

      // Back to back, someone else at the same time, or still pending: fine.
      const next = await book('d1_next_b', {
        branchId: BRANCH_B,
        kind: 'spa',
        status: 'confirmed',
        date: day,
        start: '11:00',
        end: '12:00',
        staff: [MANAGER_P],
      })
      expect((await occupancyOf(next))?.from).toBe('2099-07-01 11:00')
      const other = await book('d1_other', {
        branchId: BRANCH_A,
        kind: 'spa',
        status: 'confirmed',
        date: day,
        start: '10:00',
        end: '11:00',
        staff: [THERAPIST_P],
      })
      expect((await occupancyOf(other))?.staff).toBe(THERAPIST_P)
      const pending = await book('d1_pending', {
        branchId: BRANCH_A,
        kind: 'spa',
        status: 'pending',
        date: day,
        start: '10:00',
        end: '11:00',
        staff: [MANAGER_P],
      })
      expect(await occupancyOf(pending)).toBeNull()
    },
  )

  it(
    'lets salon bookings overlap each other, but not a SPA booking over them',
    TIMEOUT,
    async () => {
      const day = '2099-07-02'
      const salon = {
        branchId: BRANCH_A,
        kind: 'salon',
        status: 'confirmed',
        date: day,
        staff: [STYLIST_P],
      } as const
      await book('d2_salon_1', { ...salon, start: '10:00', end: '11:00' })
      const second = await book('d2_salon_2', { ...salon, start: '10:30', end: '11:30' })
      expect((await occupancyOf(second))?.kind).toBe('salon')

      expect(
        await refusedBy(book('d2_spa', { ...salon, kind: 'spa', start: '10:45', end: '11:15' })),
      ).toBe('23P01 staff_occupancy_mixed_overlap')
    },
  )

  it(
    'refuses a start while the person is still with another customer, until that one completes',
    TIMEOUT,
    async () => {
      const day = '2099-07-03'
      const spa = {
        branchId: BRANCH_A,
        kind: 'spa',
        status: 'confirmed',
        date: day,
        staff: [THERAPIST_P],
      } as const
      const first = await book('d3_first', { ...spa, start: '10:00', end: '11:00' })
      const next = await book('d3_next', { ...spa, start: '11:00', end: '12:00' })

      expect((await start(first)).ok).toBe(true)
      expect(await workOf(first)).toEqual({ staff: THERAPIST_P, kind: 'spa', running: true })

      expect(await start(next)).toEqual({ ok: false, reason: 'staff_busy' })
      expect(await statusOf(next)).toBe('confirmed')
      expect(await workOf(next)).toBeNull()

      await complete(first)
      expect(await workOf(first)).toEqual({ staff: THERAPIST_P, kind: 'spa', running: false })
      // The planned interval stays as booked while it runs, and goes at completion.
      expect(await occupancyOf(first)).toBeNull()

      expect((await start(next)).ok).toBe(true)
      expect(await workOf(next)).toEqual({ staff: THERAPIST_P, kind: 'spa', running: true })
      expect((await occupancyOf(next))?.from).toBe('2099-07-03 11:00')
      await complete(next)
    },
  )

  it(
    'lets a running salon service block a SPA start but not another salon start',
    TIMEOUT,
    async () => {
      const day = '2099-07-04'
      const at = { branchId: BRANCH_A, status: 'confirmed', date: day, staff: [STYLIST_P] } as const
      const salonRun = await book('d4_salon_run', {
        ...at,
        kind: 'salon',
        start: '10:00',
        end: '11:00',
      })
      const salonNext = await book('d4_salon_next', {
        ...at,
        kind: 'salon',
        start: '10:30',
        end: '11:30',
      })
      const spaNext = await book('d4_spa_next', {
        ...at,
        kind: 'spa',
        start: '12:00',
        end: '13:00',
      })

      expect((await start(salonRun)).ok).toBe(true)
      expect((await start(salonNext)).ok).toBe(true)
      expect(await start(spaNext)).toEqual({ ok: false, reason: 'staff_busy' })

      await complete(salonRun)
      expect(await start(spaNext)).toEqual({ ok: false, reason: 'staff_busy' })
      await complete(salonNext)
      expect((await start(spaNext)).ok).toBe(true)
      await complete(spaNext)
    },
  )

  it(
    'follows the booking through approve, assign, reschedule, cancel, complete and no-show',
    TIMEOUT,
    async () => {
      const day = '2099-07-05'
      // Pending: tentative staff per line, nobody held.
      const request = await book('d5_request', {
        branchId: BRANCH_A,
        kind: 'spa',
        status: 'pending',
        date: day,
        start: '10:00',
        end: '11:00',
        staff: [THERAPIST_P, STYLIST_P],
      })
      expect(await occupancyOf(request)).toBeNull()

      await approveBooking(request, BRANCH_A, OWNER, THERAPIST_P)
      expect(await occupancyOf(request)).toEqual({
        staff: THERAPIST_P,
        branch: BRANCH_A,
        kind: 'spa',
        from: '2099-07-05 10:00',
        to: '2099-07-05 11:00',
      })

      await assignStaff(request, BRANCH_A, STYLIST_P, OWNER)
      expect((await occupancyOf(request))?.staff).toBe(STYLIST_P)

      await rescheduleBooking(request, OWNER, {
        bookingDate: new Date('2099-07-15T00:00:00.000Z'),
        startTime: '14:00',
        endTime: '15:00',
      })
      expect(await occupancyOf(request)).toMatchObject({
        from: '2099-07-15 14:00',
        to: '2099-07-15 15:00',
      })

      // Onto a time the person is booked for: the move goes ahead without
      // them, and the booking waits for someone else (MS-09).
      await book('d5_blocker', {
        branchId: BRANCH_A,
        kind: 'spa',
        status: 'confirmed',
        date: '2099-07-15',
        start: '16:00',
        end: '17:00',
        staff: [STYLIST_P],
      })
      const moved = await rescheduleBooking(request, OWNER, {
        bookingDate: new Date('2099-07-15T00:00:00.000Z'),
        startTime: '16:30',
        endTime: '17:30',
      })
      expect(moved?.startTime).toBe('16:30:00')
      expect(await occupancyOf(request)).toBeNull()
      expect((await getOpenReassignmentsFor([request])).get(request)).toMatchObject({
        reason: 'overrun',
        previousStaffName: 'ZZ Occ IT Ravi',
        heldUp: false,
      })

      await cancelBooking(request, OWNER, 'Customer asked')
      expect(await occupancyOf(request)).toBeNull()
      expect(await workOf(request)).toBeNull()

      // Completed: the work stays for the record, the plan goes.
      const done = await book('d5_done', {
        branchId: BRANCH_A,
        kind: 'spa',
        status: 'confirmed',
        date: day,
        start: '12:00',
        end: '13:00',
        staff: [THERAPIST_P],
      })
      expect((await start(done)).ok).toBe(true)
      await complete(done)
      expect(await occupancyOf(done)).toBeNull()
      expect(await workOf(done)).toEqual({ staff: THERAPIST_P, kind: 'spa', running: false })

      // No-show: nobody held any more.
      const missed = await book('d5_missed', {
        branchId: BRANCH_A,
        kind: 'salon',
        status: 'confirmed',
        date: day,
        start: '14:00',
        end: '15:00',
        staff: [STYLIST_P],
      })
      expect((await occupancyOf(missed))?.kind).toBe('salon')
      await markBookingNoShow(missed, BRANCH_A, OWNER)
      expect(await occupancyOf(missed)).toBeNull()
      expect(await workOf(missed)).toBeNull()
    },
  )

  it(
    'keeps the projections to the database, and one assignee to a confirmed booking',
    TIMEOUT,
    async () => {
      const day = '2099-07-06'
      const running = await book('d6_running', {
        branchId: BRANCH_A,
        kind: 'spa',
        status: 'confirmed',
        date: day,
        start: '10:00',
        end: '11:00',
        staff: [MANAGER_P],
      })
      expect((await start(running)).ok).toBe(true)
      const request = await book('d6_request', {
        branchId: BRANCH_A,
        kind: 'spa',
        status: 'pending',
        date: day,
        start: '12:00',
        end: '13:00',
        staff: [THERAPIST_P, STYLIST_P],
      })

      // Direct writes to either projection are refused.
      expect(
        await refusedBy(
          db.execute(sql`
          insert into staff_occupancy (booking_id, staff_id, branch_id, kind, during)
          values (${request}, ${THERAPIST_P}, ${BRANCH_A}, 'spa',
                  tstzrange(now(), now() + interval '1 hour', '[)'))`),
        ),
      ).toBe('23514 staff_projection_derived')
      expect(
        await refusedBy(
          db.execute(sql`
          update staff_occupancy set during = tstzrange(now(), now() + interval '1 hour', '[)')
           where booking_id = ${running}`),
        ),
      ).toBe('23514 staff_projection_derived')
      expect(
        await refusedBy(db.execute(sql`delete from staff_work where booking_id = ${running}`)),
      ).toBe('23514 staff_projection_derived')
      expect(await workOf(running)).toEqual({ staff: MANAGER_P, kind: 'spa', running: true })
      expect((await occupancyOf(running))?.from).toBe('2099-07-06 10:00')

      // Confirmed with two people, confirming a pending one that names two, or
      // moving one line of a confirmed booking to someone else: refused.
      expect(
        await refusedBy(
          book('d6_mixed', {
            branchId: BRANCH_A,
            kind: 'salon',
            status: 'confirmed',
            date: day,
            start: '14:00',
            end: '15:00',
            staff: [THERAPIST_P, STYLIST_P],
          }),
        ),
      ).toBe('23514 booking_one_assignee')
      expect(
        await refusedBy(
          db.execute(sql`update booking set status = 'confirmed' where id = ${request}`),
        ),
      ).toBe('23514 booking_one_assignee')
      expect(await statusOf(request)).toBe('pending')

      const pair = await book('d6_pair', {
        branchId: BRANCH_A,
        kind: 'salon',
        status: 'confirmed',
        date: day,
        start: '16:00',
        end: '17:00',
        staff: [STYLIST_P, STYLIST_P],
      })
      expect(
        await refusedBy(
          db.execute(sql`
          update booking_service set staff_id = ${THERAPIST_P}
           where booking_id = ${pair} and display_order = 1`),
        ),
      ).toBe('23514 booking_one_assignee')
      // Every line at once is a reassignment, and the projection follows it.
      await db.execute(
        sql`update booking_service set staff_id = ${THERAPIST_P} where booking_id = ${pair}`,
      )
      expect((await occupancyOf(pair))?.staff).toBe(THERAPIST_P)

      await complete(running)
    },
  )

  it('explains a refusal when approving or assigning someone who is busy', TIMEOUT, async () => {
    const day = '2099-07-07'
    const busy = await book('d7_busy', {
      branchId: BRANCH_A,
      kind: 'spa',
      status: 'confirmed',
      date: day,
      start: '10:00',
      end: '11:00',
      staff: [THERAPIST_P],
    })
    const request = await book('d7_request', {
      branchId: BRANCH_A,
      kind: 'spa',
      status: 'pending',
      date: day,
      start: '10:30',
      end: '11:30',
      staff: [null],
    })

    expect(await messageOf(approveBooking(request, BRANCH_A, OWNER, THERAPIST_P))).toBe(
      'That staff member has another booking at that time. Choose someone else.',
    )
    expect(await statusOf(request)).toBe('pending')
    expect(await occupancyOf(request)).toBeNull()

    await approveBooking(request, BRANCH_A, OWNER, STYLIST_P)
    expect(await statusOf(request)).toBe('confirmed')
    expect(await messageOf(assignStaff(request, BRANCH_A, THERAPIST_P, OWNER))).toBe(
      'That staff member has another booking at that time. Choose someone else.',
    )
    expect((await occupancyOf(request))?.staff).toBe(STYLIST_P)

    // Free by plan, but still with another customer: assigning them to a
    // booking that is running is refused too.
    const later = await book('d7_later', {
      branchId: BRANCH_A,
      kind: 'spa',
      status: 'confirmed',
      date: day,
      start: '12:00',
      end: '13:00',
      staff: [MANAGER_P],
    })
    expect((await start(busy)).ok).toBe(true)
    expect((await start(later)).ok).toBe(true)
    expect(await messageOf(assignStaff(later, BRANCH_A, THERAPIST_P, OWNER))).toBe(
      'That staff member is still with another customer. Choose someone else.',
    )
    expect(await workOf(later)).toEqual({ staff: MANAGER_P, kind: 'spa', running: true })

    await complete(busy)
    await complete(later)
  })

  it('picks a default person who is free for the whole booking', TIMEOUT, async () => {
    const day = '2099-07-08'
    const pick = (kind: Kind, start: string, end: string) =>
      getDefaultStaffForBooking({
        serviceIds: [kind === 'spa' ? spaServiceId : salonServiceId],
        branchId: BRANCH_A,
        dateISO: day,
        slot: { startTime: start, endTime: end, kind },
      })

    expect(
      await getDefaultStaffForBooking({
        serviceIds: [spaServiceId],
        branchId: BRANCH_A,
        dateISO: day,
      }),
    ).toBe(THERAPIST_P)
    await book('d8_spa', {
      branchId: BRANCH_A,
      kind: 'spa',
      status: 'confirmed',
      date: day,
      start: '10:00',
      end: '11:00',
      staff: [THERAPIST_P],
    })
    // Booked for a SPA then: skipped for a SPA or a salon booking over it.
    expect(await pick('spa', '10:00', '11:00')).toBe(STYLIST_P)
    expect(await pick('salon', '10:30', '11:30')).toBe(STYLIST_P)
    expect(await pick('spa', '11:00', '12:00')).toBe(THERAPIST_P)

    await book('d8_salon', {
      branchId: BRANCH_A,
      kind: 'salon',
      status: 'confirmed',
      date: day,
      start: '13:00',
      end: '14:00',
      staff: [THERAPIST_P],
    })
    // Booked for a salon service: still picked for another salon service then.
    expect(await pick('salon', '13:30', '14:30')).toBe(THERAPIST_P)
    expect(await pick('spa', '13:30', '14:30')).toBe(STYLIST_P)
  })
})
