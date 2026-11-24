/************************************************************
 * Module Name  : staff-overruns.integration.test
 * Scope        : Integration test — held-up bookings and who is free
 *                (REAL db, membership-scheduling.md slice 2b, MS-08)
 *
 * Description  : Against Neon dev, with migrations 0027–0030:
 *                - a confirmed SPA booking due soon whose person is still
 *                  with another customer, expected more than 10 minutes late,
 *                  is flagged 'overrun' once, keeping its assignee; its start
 *                  is refused until the earlier work completes, and starting
 *                  it ends the flag as 'started' (0030);
 *                - a delay within the grace, salon after salon, and a
 *                  booking not yet due within the lead are left alone;
 *                - a refused start flags only a booking already due, and
 *                  moving the booking ends its flag;
 *                - the availability read says who is on leave, booked then
 *                  (a SPA booking clashes with anything, salon with SPA) or
 *                  still with a customer, and how many services each does.
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Prefixed `ovr_it_<run>` rows, deleted in one transaction in
 *                afterAll, then zero residue is proven. The held-up bookings
 *                are timed from the database clock, today in IST; each person
 *                is used by one case, because completed work stays on record
 *                and would clash with a later backdated start.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { booking, bookingService } from '../schema/booking'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import { startBooking } from './admin-bookings'
import { rescheduleBooking } from './bookings'
import { getOpenReassignmentsFor } from './reassignments'
import {
  flagStaffOverruns,
  getLiveStaffOverruns,
  getStaffAvailability,
  OVERRUN_GRACE_MINUTES,
  OVERRUN_LEAD_MINUTES,
} from './staff-occupancy'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `ovr_it_${RUN}`
const BRANCH = `${PREFIX}_a`
const OWNER = `${PREFIX}_owner`
const MANAGER = `${PREFIX}_mgr`
const CUSTOMER = `${PREFIX}_cust`
// One person per case: Asha (held up), Lata (within the grace), Ravi (salon),
// Neha (a refused start); Meena is on leave for the availability read.
const ASHA = `${PREFIX}_asha`
const LATA = `${PREFIX}_lata`
const RAVI = `${PREFIX}_ravi`
const NEHA = `${PREFIX}_neha`
const MEENA = `${PREFIX}_meena`
const P = (user: string) => `${user}_p`
const LEAVE = `${PREFIX}_leave`
const FAR = '2099-08-01'

const TIMEOUT = { timeout: 60_000 }
const IST_MS = 330 * 60_000

let spaServiceId = ''
let salonServiceId = ''
// The database clock when the suite started: every held-up booking is timed from it.
let base = new Date()

type Kind = 'salon' | 'spa'

/** The IST date and HH:MM `offset` minutes after the suite's base instant. */
function istAt(offset: number) {
  const t = new Date(base.getTime() + offset * 60_000 + IST_MS)
  return { date: t.toISOString().slice(0, 10), time: t.toISOString().slice(11, 16) }
}

/** A confirmed booking of `kind` for `staffId`, `from` to `to` minutes after base. */
async function book(
  key: string,
  params:
    | { kind: Kind; staffId: string | null; from: number; to: number }
    | {
        kind: Kind
        staffId: string | null
        date: string
        start: string
        end: string
      },
): Promise<string> {
  const id = `${PREFIX}_${key}`
  const slot =
    'from' in params
      ? {
          date: istAt(params.from).date,
          start: istAt(params.from).time,
          end: istAt(params.to).time,
        }
      : { date: params.date, start: params.start, end: params.end }
  await db.batch([
    db.insert(booking).values({
      id,
      bookingNumber: id,
      branchId: BRANCH,
      customerId: CUSTOMER,
      status: 'confirmed',
      serviceType: params.kind,
      bookingDate: new Date(`${slot.date}T00:00:00.000Z`),
      startTime: slot.start,
      endTime: slot.end,
      totalAmountPaise: 50_000,
      totalDurationMinutes: 60,
    }),
    db.insert(bookingService).values({
      bookingId: id,
      serviceId: params.kind === 'spa' ? spaServiceId : salonServiceId,
      staffId: params.staffId,
      serviceNameSnapshot: `ZZ Ovr IT ${key}`,
      priceAtBookingPaise: 50_000,
      durationMinutes: 60,
      displayOrder: 0,
    }),
  ])
  return id
}

/** Put a booking in progress as if it had started `minutesAgo` minutes ago. */
async function startedAgo(bookingId: string, minutesAgo: number) {
  await db.execute(sql`
    update booking set status = 'in_progress',
           started_at = now() - make_interval(mins => ${minutesAgo}::int), updated_at = now()
     where id = ${bookingId}`)
}

/**
 * Complete a booking in progress, as checkout does. A completed one is left
 * alone: moving its completion would move its work's end, which the database
 * refuses once the person's next work has started.
 */
async function complete(bookingId: string) {
  await db.execute(sql`
    update booking set status = 'completed', completed_at = now(), updated_at = now()
     where id = ${bookingId} and status = 'in_progress'`)
}

function flagsOf(bookingId: string) {
  return queryRows<{ reason: string; resolution: string | null; previous_staff_id: string | null }>(
    sql`select reason::text as reason, resolution::text as resolution, previous_staff_id
          from booking_reassignment where booking_id = ${bookingId} order by created_at`,
  )
}

async function staffOf(bookingId: string): Promise<string | null> {
  return (
    (await queryRow<{ staff_id: string | null }>(
      sql`select staff_id from booking_service where booking_id = ${bookingId}`,
    )) ?? { staff_id: null }
  ).staff_id
}

const DUE_SOON = { leadMinutes: OVERRUN_LEAD_MINUTES, graceMinutes: OVERRUN_GRACE_MINUTES }

describe.skipIf(!LIVE)('held-up bookings against a live database', () => {
  beforeAll(async () => {
    const services = await queryRow<{ spa: string | null; salon: string | null; now: Date }>(sql`
      select (select s.id from service s join service_category c on c.id = s.category_id
               where s.is_active and c.service_type = 'spa' order by s.id limit 1) as spa,
             (select s.id from service s join service_category c on c.id = s.category_id
               where s.is_active and c.service_type = 'salon' order by s.id limit 1) as salon,
             date_trunc('minute', now()) as now`)
    spaServiceId = services?.spa ?? ''
    salonServiceId = services?.salon ?? ''
    expect(spaServiceId).not.toBe('')
    expect(salonServiceId).not.toBe('')
    base = new Date(services?.now ?? Date.now())
    const number = 9600 + Math.floor(Math.random() * 90)
    const today = istAt(0).date

    // One transaction: the deferred role checks see every relationship at commit.
    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${OWNER}, 'ZZ Ovr IT Owner', ${`${OWNER}@example.invalid`}, false, 'owner'),
               (${MANAGER}, 'ZZ Ovr IT Manager', ${`${MANAGER}@example.invalid`}, false, 'manager'),
               (${ASHA}, 'ZZ Ovr IT Asha', ${`${ASHA}@example.invalid`}, false, 'staff'),
               (${LATA}, 'ZZ Ovr IT Lata', ${`${LATA}@example.invalid`}, false, 'staff'),
               (${RAVI}, 'ZZ Ovr IT Ravi', ${`${RAVI}@example.invalid`}, false, 'staff'),
               (${NEHA}, 'ZZ Ovr IT Neha', ${`${NEHA}@example.invalid`}, false, 'staff'),
               (${MEENA}, 'ZZ Ovr IT Meena', ${`${MEENA}@example.invalid`}, false, 'staff'),
               (${CUSTOMER}, 'ZZ Ovr IT Customer', ${`${CUSTOMER}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order,
                            owner_user_id, manager_user_id)
        values (${BRANCH}, ${number}, ${`${PREFIX}_A`}, 'ZZ Ovr IT A', 'Test', '560100', '0000000000', 990, ${OWNER}, ${MANAGER})`),
      db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, branch_id, role_witness)
        values (${P(MANAGER)}, ${MANAGER}, 'manager', true, null, 'manager'),
               (${P(ASHA)}, ${ASHA}, 'therapist', true, ${BRANCH}, 'staff'),
               (${P(LATA)}, ${LATA}, 'therapist', true, ${BRANCH}, 'staff'),
               (${P(RAVI)}, ${RAVI}, 'stylist', true, ${BRANCH}, 'staff'),
               (${P(NEHA)}, ${NEHA}, 'therapist', true, ${BRANCH}, 'staff'),
               (${P(MEENA)}, ${MEENA}, 'therapist', true, ${BRANCH}, 'staff')`),
      db.execute(sql`
        insert into staff_service (staff_id, service_id)
        values (${P(ASHA)}, ${spaServiceId}), (${P(LATA)}, ${spaServiceId}),
               (${P(RAVI)}, ${salonServiceId})`),
      // Meena is away today and on the far date the availability read uses.
      db.execute(sql`
        insert into staff_time_off (id, staff_id, leave_type, date, approval_status)
        values (${`${LEAVE}_1`}, ${P(MEENA)}, 'casual', ${today}, 'approved'),
               (${`${LEAVE}_2`}, ${P(MEENA)}, 'casual', ${FAR}, 'approved')`),
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
      db.execute(sql`delete from staff_time_off where id like ${like}`),
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
               (select count(*) from staff_time_off where id like ${like}) as leave,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({
      bookings: '0',
      flags: '0',
      occupancy: '0',
      work: '0',
      leave: '0',
      branches: '0',
      users: '0',
    })
  }, 60_000)

  it(
    'flags a booking its person can’t start in time, once, keeping them assigned',
    TIMEOUT,
    async () => {
      // Asha's 60-minute customer started 15 minutes late, so the next one,
      // due in 5 minutes, would start about 15 minutes late.
      const earlier = await book('asha_earlier', {
        kind: 'spa',
        staffId: P(ASHA),
        from: -55,
        to: 5,
      })
      const next = await book('asha_next', { kind: 'spa', staffId: P(ASHA), from: 5, to: 65 })
      await startedAgo(earlier, 40)

      try {
        expect(await flagStaffOverruns(DUE_SOON)).toContain(next)
        expect(await flagStaffOverruns(DUE_SOON)).not.toContain(next)
        expect(await flagsOf(next)).toEqual([
          { reason: 'overrun', resolution: null, previous_staff_id: P(ASHA) },
        ])
        expect(await staffOf(next)).toBe(P(ASHA))

        expect(await getLiveStaffOverruns({ bookingId: next })).toEqual([
          {
            bookingId: next,
            branchId: BRANCH,
            bookingDate: istAt(5).date,
            startTime: istAt(5).time,
            endTime: istAt(65).time,
            kind: 'spa',
            staffId: P(ASHA),
            staffName: 'ZZ Ovr IT Asha',
            serviceIds: [spaServiceId],
          },
        ])
        expect((await getOpenReassignmentsFor([next])).get(next)).toMatchObject({
          reason: 'overrun',
          heldUp: true,
          previousStaffName: 'ZZ Ovr IT Asha',
        })

        // For the next booking's slot she is still with a customer, since then.
        const people = await getStaffAvailability({
          branchId: BRANCH,
          slot: {
            dateISO: istAt(5).date,
            startTime: istAt(5).time,
            endTime: istAt(65).time,
            kind: 'spa',
            excludeBookingId: next,
          },
        })
        const since = await queryRow<{ since: string }>(sql`
        select to_char(lower(during) at time zone 'Asia/Kolkata', 'HH24:MI') as since
          from staff_work where booking_id = ${earlier}`)
        expect(people.find((p) => p.id === P(ASHA))?.busy).toEqual({
          reason: 'working',
          since: since?.since,
        })
        expect(people.find((p) => p.id === P(MEENA))?.busy).toEqual({ reason: 'on_leave' })
        expect(people.find((p) => p.id === P(LATA))?.busy).toBeNull()

        // The database refuses the start until her earlier customer is done.
        expect(
          await startBooking({ bookingId: next, branchId: BRANCH, changedById: OWNER }),
        ).toEqual({ ok: false, reason: 'staff_busy' })
        await complete(earlier)
        expect(await getLiveStaffOverruns({ bookingId: next })).toEqual([])
        expect(
          (await startBooking({ bookingId: next, branchId: BRANCH, changedById: OWNER })).ok,
        ).toBe(true)
        expect(await flagsOf(next)).toEqual([
          { reason: 'overrun', resolution: 'started', previous_staff_id: P(ASHA) },
        ])
      } finally {
        await complete(earlier)
        await complete(next)
      }
    },
  )

  it('leaves alone a delay within the grace, and salon after salon', TIMEOUT, async () => {
    // Lata's customer started 5 minutes late: the next one starts within the grace.
    const lataEarlier = await book('lata_earlier', {
      kind: 'spa',
      staffId: P(LATA),
      from: -55,
      to: 5,
    })
    const lataNext = await book('lata_next', { kind: 'spa', staffId: P(LATA), from: 5, to: 65 })
    await startedAgo(lataEarlier, 50)
    // Ravi's salon customer runs late, but salon work may overlap.
    const raviEarlier = await book('ravi_earlier', {
      kind: 'salon',
      staffId: P(RAVI),
      from: -55,
      to: 5,
    })
    const raviNext = await book('ravi_next', { kind: 'salon', staffId: P(RAVI), from: 5, to: 65 })
    await startedAgo(raviEarlier, 40)

    try {
      const flagged = await flagStaffOverruns(DUE_SOON)
      expect(flagged).not.toContain(lataNext)
      expect(flagged).not.toContain(raviNext)
      expect(await flagsOf(lataNext)).toEqual([])
      expect(await flagsOf(raviNext)).toEqual([])
      expect((await getOpenReassignmentsFor([lataNext])).get(lataNext)).toBeUndefined()
    } finally {
      await complete(lataEarlier)
      await complete(raviEarlier)
    }
  })

  it(
    'flags a refused start only once the booking is due, and moving it ends the flag',
    TIMEOUT,
    async () => {
      // Neha's earlier customer has run 5 minutes past its planned length, and
      // her next one was due 15 minutes ago.
      const earlier = await book('neha_earlier', {
        kind: 'spa',
        staffId: P(NEHA),
        from: -75,
        to: -15,
      })
      const overdue = await book('neha_overdue', {
        kind: 'spa',
        staffId: P(NEHA),
        from: -15,
        to: 45,
      })
      const later = await book('neha_later', { kind: 'spa', staffId: P(NEHA), from: 90, to: 150 })
      await startedAgo(earlier, 65)

      try {
        // Looking at one booking needs no lead: due now, or not at all.
        const now = { leadMinutes: 0, graceMinutes: OVERRUN_GRACE_MINUTES }
        expect(await flagStaffOverruns({ ...now, bookingId: later })).toEqual([])
        expect(await flagStaffOverruns({ ...now, bookingId: overdue })).toEqual([overdue])
        expect(await flagsOf(later)).toEqual([])

        const tomorrow = istAt(24 * 60).date
        await rescheduleBooking(overdue, OWNER, {
          bookingDate: new Date(`${tomorrow}T00:00:00.000Z`),
          startTime: '10:00',
          endTime: '11:00',
        })
        expect(await flagsOf(overdue)).toEqual([
          { reason: 'overrun', resolution: 'booking_ended', previous_staff_id: P(NEHA) },
        ])
        expect(await getLiveStaffOverruns({ bookingId: overdue })).toEqual([])
      } finally {
        await complete(earlier)
      }
    },
  )

  it(
    'says who can take a slot, why not, and how many of its services each does',
    TIMEOUT,
    async () => {
      const lataBooked = await book('far_lata', {
        kind: 'spa',
        staffId: P(LATA),
        date: FAR,
        start: '10:00',
        end: '11:00',
      })
      await book('far_manager', {
        kind: 'salon',
        staffId: P(MANAGER),
        date: FAR,
        start: '10:30',
        end: '11:30',
      })
      const slot = { dateISO: FAR, startTime: '10:00', endTime: '11:00' }
      const byId = (people: Awaited<ReturnType<typeof getStaffAvailability>>) =>
        new Map(people.map((p) => [p.id, p]))

      const spa = byId(
        await getStaffAvailability({
          branchId: BRANCH,
          slot: { ...slot, kind: 'spa' },
          serviceIds: [spaServiceId],
        }),
      )
      expect([...spa.keys()].sort()).toEqual(
        [P(ASHA), P(LATA), P(MANAGER), P(MEENA), P(NEHA), P(RAVI)].sort(),
      )
      expect(spa.get(P(ASHA))).toMatchObject({ busy: null, performs: 1, designation: 'therapist' })
      expect(spa.get(P(LATA))?.busy).toEqual({ reason: 'booked', from: '10:00', to: '11:00' })
      // A salon booking clashes with a SPA slot.
      expect(spa.get(P(MANAGER))?.busy).toEqual({ reason: 'booked', from: '10:30', to: '11:30' })
      expect(spa.get(P(MEENA))?.busy).toEqual({ reason: 'on_leave' })
      expect(spa.get(P(RAVI))).toMatchObject({ busy: null, performs: 0 })

      // Its own booking never clashes with it.
      const own = byId(
        await getStaffAvailability({
          branchId: BRANCH,
          slot: { ...slot, kind: 'spa', excludeBookingId: lataBooked },
        }),
      )
      expect(own.get(P(LATA))?.busy).toBeNull()

      // Two salon bookings may overlap; a SPA booking still clashes.
      const salon = byId(
        await getStaffAvailability({ branchId: BRANCH, slot: { ...slot, kind: 'salon' } }),
      )
      expect(salon.get(P(MANAGER))?.busy).toBeNull()
      expect(salon.get(P(LATA))?.busy).toEqual({ reason: 'booked', from: '10:00', to: '11:00' })

      // An overrun flag on a booking nobody is assigned to is not "held up".
      const nobody = await book('far_nobody', {
        kind: 'spa',
        staffId: null,
        date: FAR,
        start: '15:00',
        end: '16:00',
      })
      await db.execute(sql`
      insert into booking_reassignment (booking_id, reason, previous_staff_id)
      values (${nobody}, 'overrun', ${P(LATA)})`)
      expect((await getOpenReassignmentsFor([nobody])).get(nobody)).toMatchObject({
        reason: 'overrun',
        heldUp: false,
      })
    },
  )
})
