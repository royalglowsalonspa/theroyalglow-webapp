/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : staff-occupancy (queries)
 * Scope        : Data Access — who is free for a slot, and bookings held up
 *                because their person is still with another customer
 *
 * Description  : Reads the staff occupancy projections (0027, 0028) for the
 *                assignment pickers, and flags confirmed bookings whose
 *                assignee is still with another customer when they are due
 *                (membership-scheduling.md slice 2b, MS-08).
 *
 * Responsibilities :
 * - getStaffAvailability: everyone who works at a branch, each with why they
 *   can't take a slot: on leave, booked then, or still with a customer
 * - flagStaffOverruns: open 'overrun' reassignment work on held-up bookings
 * - getLiveStaffOverruns: open overrun work still worth telling the front
 *   desk about
 *
 * Tech Stack   : TypeScript, Drizzle ORM (neon-http)
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index, ../schema/auth, ../schema/booking,
 *                ../schema/profile, ./staff
 *
 * Notes        :
 * - Read-only except flagStaffOverruns, one statement. The open-entry unique
 *   index (booking_reassignment_open_uidx) makes it idempotent, and it locks
 *   the bookings it flags, so a booking started meanwhile isn't flagged.
 * - A flag keeps the assignee: reception waits for them or assigns someone
 *   else. It closes as 'started' (0030), 'reassigned' or 'booking_ended'.
 * - Someone with open actual work is busy at least until now, and expected
 *   until its start plus its planned length. A SPA booking clashes with any
 *   work; two salon bookings don't (the 0028 rule).
 * - The database checks everything again when a booking is written; these
 *   reads only explain and suggest.
 ************************************************************/

import { asc, inArray, type SQL, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { bookingService } from '../schema/booking'
import { staffProfile } from '../schema/profile'
import { staffWorksAt } from './staff'

type Kind = 'salon' | 'spa'
type Designation = (typeof staffProfile.$inferSelect)['designation']

/** How long before a booking's start an overrun into it is flagged. */
export const OVERRUN_LEAD_MINUTES = 15
/** How late a booking may start before it counts as held up. */
export const OVERRUN_GRACE_MINUTES = 10

/** Why a person can't take a slot. Times are IST, HH:MM. */
export type StaffBusy =
  | { reason: 'on_leave' }
  /** Their weekly schedule rules the slot out: a day off, another branch, outside hours (0032). */
  | { reason: 'off_schedule' }
  /** Another booking of theirs overlaps the slot. */
  | { reason: 'booked'; from: string; to: string }
  /** Still with another customer, and expected to be past the slot's start. */
  | { reason: 'working'; since: string }

/** One person who works at the branch, and whether they can take the slot. */
export type StaffAvailability = {
  id: string
  userId: string
  name: string
  designation: Designation
  /** How many of the asked services they perform. */
  performs: number
  busy: StaffBusy | null
}

/** A slot on an IST date; an end before the start is on the next day. */
export type AvailabilitySlot = {
  dateISO: string
  startTime: string
  endTime: string
  kind: Kind
  /** The booking being assigned: its own rows never clash with it. */
  excludeBookingId?: string | undefined
}

type AvailabilityRow = {
  id: string
  user_id: string
  name: string
  designation: Designation
  performs: number | string
  on_leave: boolean
  off_schedule: boolean
  booked_from: string | null
  booked_to: string | null
  working_since: string | null
}

function rowsOf<T>(result: unknown): T[] {
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[]
}

function busyOf(row: AvailabilityRow): StaffBusy | null {
  if (row.on_leave) {
    return { reason: 'on_leave' }
  }
  if (row.off_schedule) {
    return { reason: 'off_schedule' }
  }
  if (row.booked_from !== null && row.booked_to !== null) {
    return { reason: 'booked', from: row.booked_from, to: row.booked_to }
  }
  if (row.working_since !== null) {
    return { reason: 'working', since: row.working_since }
  }
  return null
}

// The open actual work `w` (aliased) is expected to end: its start plus its
// planned length, from its occupancy row `wo` (empty when it has none).
const EXPECTED_END = sql.raw(
  `lower(w.during) + coalesce(upper(wo.during) - lower(wo.during), interval '0')`,
)

/**
 * Everyone who works at `branchId`, by name, each with why they can't take
 * `slot`, or null when they can: approved leave that day, a weekly schedule
 * that rules it out, another booking of theirs overlapping it (where either
 * is a SPA booking), or open work expected to run past its start (any open
 * work when the slot has started).
 * With `serviceIds`, how many of them each person performs.
 */
export async function getStaffAvailability(params: {
  branchId: string
  slot: AvailabilitySlot
  serviceIds?: readonly string[]
}): Promise<StaffAvailability[]> {
  const { slot } = params
  const during = sql`booking_planned_during(${slot.dateISO}::date, ${slot.startTime}::time, ${slot.endTime}::time)`
  const kind = sql`${slot.kind}::service_type`
  const exclude = sql`${slot.excludeBookingId ?? null}::text`
  const serviceIds = params.serviceIds ?? []
  const performs: SQL =
    serviceIds.length > 0
      ? sql`(select count(*)::int from staff_service ss
              where ss.staff_id = ${staffProfile.id}
                and ss.service_id in (${sql.join(
                  serviceIds.map((id) => sql`${id}`),
                  sql`, `,
                )}))`
      : sql`0`

  const result = await db.execute(sql`
    select ${staffProfile.id} as id, ${staffProfile.userId} as user_id, ${user.name} as name,
           ${staffProfile.designation}::text as designation, ${performs} as performs,
           exists (select 1 from staff_time_off t
                    where t.staff_id = ${staffProfile.id}
                      and t.date = ${slot.dateISO}
                      and t.approval_status = 'approved') as on_leave,
           staff_off_schedule(${staffProfile.id}, ${params.branchId}, ${slot.dateISO}::date,
             ${slot.startTime}::time, ${slot.endTime}::time) as off_schedule,
           booked.booked_from, booked.booked_to, working.working_since
      from ${staffProfile}
      join ${user} on ${user.id} = ${staffProfile.userId}
      left join lateral (
        select to_char(lower(o.during) at time zone 'Asia/Kolkata', 'HH24:MI') as booked_from,
               to_char(upper(o.during) at time zone 'Asia/Kolkata', 'HH24:MI') as booked_to
          from staff_occupancy o
         where o.staff_id = ${staffProfile.id}
           and o.booking_id is distinct from ${exclude}
           and o.during && ${during}
           and (o.kind = 'spa' or ${kind} = 'spa')
         order by lower(o.during)
         limit 1) booked on true
      left join lateral (
        select to_char(lower(w.during) at time zone 'Asia/Kolkata', 'HH24:MI') as working_since
          from staff_work w
          left join staff_occupancy wo on wo.booking_id = w.booking_id
         where w.staff_id = ${staffProfile.id}
           and w.booking_id is distinct from ${exclude}
           and upper_inf(w.during)
           and (w.kind = 'spa' or ${kind} = 'spa')
           and (lower(${during}) <= now() or lower(${during}) < ${EXPECTED_END})
         order by lower(w.during)
         limit 1) working on true
     where ${staffWorksAt(params.branchId)}
     order by ${user.name}, ${staffProfile.id}`)

  return rowsOf<AvailabilityRow>(result).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    designation: row.designation,
    performs: Number(row.performs),
    busy: busyOf(row),
  }))
}

/**
 * Open 'overrun' reassignment work, keeping the assignee, on each confirmed
 * booking that starts within `leadMinutes` and hasn't ended, whose assignee
 * is still with another customer and is expected to start it more than
 * `graceMinutes` late (MS-08). With `bookingId`, that booking only. Returns
 * the bookings flagged now; one already flagged isn't flagged again.
 */
export async function flagStaffOverruns(params: {
  leadMinutes: number
  graceMinutes: number
  bookingId?: string | undefined
}): Promise<string[]> {
  const onlyBooking = params.bookingId ? sql`and o.booking_id = ${params.bookingId}` : sql``
  const result = await db.execute(sql`
    with due as materialized (
      select o.booking_id, o.staff_id, o.kind, lower(o.during) as starts
        from staff_occupancy o
        join booking b on b.id = o.booking_id
       where b.status = 'confirmed'
         and b.started_at is null
         and lower(o.during) <= now() + make_interval(mins => ${params.leadMinutes}::int)
         and upper(o.during) > now()
         ${onlyBooking}
         for update of b
    ),
    held_up as (
      select distinct d.booking_id, d.staff_id
        from due d
        join staff_work w on w.staff_id = d.staff_id
                         and w.booking_id <> d.booking_id
                         and upper_inf(w.during)
                         and (w.kind = 'spa' or d.kind = 'spa')
        left join staff_occupancy wo on wo.booking_id = w.booking_id
       where greatest(${EXPECTED_END}, now())
             > d.starts + make_interval(mins => ${params.graceMinutes}::int)
    )
    insert into booking_reassignment (booking_id, reason, previous_staff_id)
    select booking_id, 'overrun'::booking_reassignment_reason, staff_id from held_up
    on conflict (booking_id) where resolved_at is null do nothing
    returning booking_id`)
  return rowsOf<{ booking_id: string }>(result).map((row) => row.booking_id)
}

/** A confirmed booking held up because its person is still with another customer. */
export type LiveStaffOverrun = {
  bookingId: string
  branchId: string
  /** YYYY-MM-DD, the IST business date. */
  bookingDate: string
  /** HH:MM, IST. */
  startTime: string
  endTime: string
  kind: Kind
  staffId: string
  staffName: string
  /** The booking's services, in order. */
  serviceIds: string[]
}

type LiveRow = {
  booking_id: string
  branch_id: string
  booking_date: string
  start_time: string
  end_time: string
  kind: Kind
  staff_id: string
  staff_name: string
}

/**
 * Open 'overrun' work on confirmed bookings that still name the person it
 * was opened for, haven't ended, and whose person is still with another
 * customer: what the front desk should hear about. Soonest first. With
 * `bookingId`, that booking only.
 */
export async function getLiveStaffOverruns(
  params: { bookingId?: string | undefined } = {},
): Promise<LiveStaffOverrun[]> {
  const onlyBooking = params.bookingId ? sql`and r.booking_id = ${params.bookingId}` : sql``
  const result = await db.execute(sql`
    select r.booking_id, b.branch_id,
           to_char(b.booking_date, 'YYYY-MM-DD') as booking_date,
           to_char(b.start_time, 'HH24:MI') as start_time,
           to_char(b.end_time, 'HH24:MI') as end_time,
           b.service_type::text as kind, o.staff_id, u.name as staff_name
      from booking_reassignment r
      join booking b on b.id = r.booking_id
      join staff_occupancy o on o.booking_id = r.booking_id and o.staff_id = r.previous_staff_id
      join staff_profile sp on sp.id = o.staff_id
      join "user" u on u.id = sp.user_id
     where r.resolved_at is null
       and r.reason = 'overrun'
       and b.status = 'confirmed'
       and upper(o.during) > now()
       and exists (select 1 from staff_work w
                    where w.staff_id = o.staff_id
                      and w.booking_id <> r.booking_id
                      and upper_inf(w.during)
                      and (w.kind = 'spa' or o.kind = 'spa'))
       ${onlyBooking}
     order by lower(o.during), r.booking_id`)
  const rows = rowsOf<LiveRow>(result)
  if (rows.length === 0) {
    return []
  }

  const lines = await db
    .select({ bookingId: bookingService.bookingId, serviceId: bookingService.serviceId })
    .from(bookingService)
    .where(
      inArray(
        bookingService.bookingId,
        rows.map((row) => row.booking_id),
      ),
    )
    .orderBy(asc(bookingService.displayOrder))
  const servicesOf = new Map<string, string[]>()
  for (const line of lines) {
    servicesOf.set(line.bookingId, [...(servicesOf.get(line.bookingId) ?? []), line.serviceId])
  }

  return rows.map((row) => ({
    bookingId: row.booking_id,
    branchId: row.branch_id,
    bookingDate: row.booking_date,
    startTime: row.start_time,
    endTime: row.end_time,
    kind: row.kind,
    staffId: row.staff_id,
    staffName: row.staff_name,
    serviceIds: servicesOf.get(row.booking_id) ?? [],
  }))
}
