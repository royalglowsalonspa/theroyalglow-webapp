/************************************************************
 * Module Name  : reassignments
 * Scope        : Data Access — Reassignment work (multi-branch R1.7, R5.8)
 *
 * Description  : When someone can no longer take a booking (they left its
 *                branch, or approved leave covers its day), their assignment
 *                is cleared and a confirmed booking is listed for reception
 *                until someone else is assigned or the booking ends. Clearing
 *                and listing are one statement, run inside the change that
 *                caused them, so a booking can't keep such an assignee unseen.
 *
 * Responsibilities :
 * - releaseAssignmentsOfPeopleStatement: for a role change (applyBranchRolePlan)
 * - releaseAssignmentsOnLeaveStatement: for an approved leave request
 * - releasedBookingIds: the confirmed bookings a release statement listed
 * - resolveReassignmentStatement: someone else was assigned
 * - assigneeRefusal: why the database refused an assignee
 * - getOpenReassignments / getOpenReassignmentsFor: what reception sees
 *
 * Rules :
 * - Only bookings still to come: pending or confirmed, starting now or later
 *   (IST). A booking that should already have started keeps its assignee:
 *   it may be under way, and reception completes it or marks it missed.
 * - A pending booking only loses its tentative assignee; approval assigns
 *   someone anyway. A confirmed booking also gets an open entry.
 * - "Works at" is the rule of staff.ts: an active profile granting its role
 *   at the branch, or the branch's Manager.
 * - The booking itself is never cancelled or moved.
 *
 * Notes : A booking that already has open work keeps its first entry.
 *         Trigger booking_reassignment_close_on_end (migration 0013) closes
 *         the entry when the booking ends; assigning closes it here. Trigger
 *         booking_assignee_guard (migration 0014) refuses an assignee who
 *         doesn't work at the branch, or who is on approved leave on a
 *         confirmed booking's day.
 ************************************************************/

import { and, asc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking, bookingReassignment } from '../schema/booking'
import { staffProfile } from '../schema/profile'
import { isConstraintViolation, SQLSTATE } from './driver-errors'

export type ReassignmentReason = (typeof bookingReassignment.$inferSelect)['reason']

/** One booking waiting for someone else to take it. */
export type OpenReassignment = {
  id: string
  bookingId: string
  bookingNumber: string
  bookingDate: Date
  startTime: string
  serviceType: (typeof booking.$inferSelect)['serviceType']
  customerName: string
  reason: ReassignmentReason
  previousStaffName: string | null
  /**
   * Held up, not taken off: an overrun flag on a booking that still names
   * the person it waits for (slice 2b). Reception waits or assigns someone
   * else; otherwise the booking has nobody assigned.
   */
  heldUp: boolean
  since: Date
}

/** What a booking list or detail shows about the booking's open work. */
export type ReassignmentSummary = {
  reason: ReassignmentReason
  previousStaffName: string | null
  heldUp: boolean
  since: Date
}

// The open entry is an overrun flag whose booking still names the person it
// waits for (the backfill's overrun entries cleared the assignee instead).
const HELD_UP = sql<boolean>`coalesce(${bookingReassignment.reason} = 'overrun'
  and booking_sole_assignee(${bookingReassignment.bookingId}) = ${bookingReassignment.previousStaffId}, false)`

// The booking `b` hasn't started and is due now or later, in IST.
const STILL_TO_COME = sql`b.status in ('pending', 'confirmed')
  and ((b.booking_date + b.start_time) at time zone 'Asia/Kolkata') >= now()`

// The profile `sp` works at the branch of booking `b` (staff.ts worksAt).
// Null-safe, as it is negated: a Manager's profile has no branch_id, and
// `not (null or false)` would match nothing.
const WORKS_AT_BOOKING_BRANCH = sql`coalesce(sp.is_active and sp.role_witness is not null
  and (sp.branch_id = b.branch_id
    or exists (select 1 from branch br where br.id = b.branch_id and br.manager_user_id = sp.user_id)), false)`

function oneOf(column: SQL, values: readonly string[]): SQL {
  if (values.length === 0) {
    return sql`false`
  }
  return sql`${column} in (${sql.join(
    values.map((value) => sql`${value}::text`),
    sql`, `,
  )})`
}

// Lists the released confirmed bookings and returns their ids. `released`
// must return booking_id, staff_id and the booking's status.
function recordReleased(released: SQL, reason: ReassignmentReason, actorId: string | null): SQL {
  return sql`with released as (${released}),
    flagged as (
      insert into booking_reassignment (booking_id, reason, previous_staff_id, created_by_id)
      select distinct on (booking_id) booking_id, ${reason}::booking_reassignment_reason,
        staff_id, ${actorId}::text
      from released
      where status = 'confirmed'
      order by booking_id, staff_id
      on conflict (booking_id) where resolved_at is null do nothing
    )
    select distinct booking_id from released where status = 'confirmed'`
}

/**
 * Clear the future assignments of `userIds` at every branch where they no
 * longer work, as it stands after the writes before this statement in the
 * same transaction. Pass everyone the change touched: whoever still works
 * where they are booked keeps their bookings.
 */
export function releaseAssignmentsOfPeopleStatement(params: {
  userIds: readonly string[]
  actorId: string
}) {
  return db.execute(
    recordReleased(
      sql`update booking_service bs
        set staff_id = null
        from booking b, staff_profile sp
        where bs.booking_id = b.id
          and sp.id = bs.staff_id
          and ${oneOf(sql`sp.user_id`, params.userIds)}
          and ${STILL_TO_COME}
          and not ${WORKS_AT_BOOKING_BRANCH}
        returning bs.booking_id, sp.id as staff_id, b.status`,
      'left_branch',
      params.actorId,
    ),
  )
}

/**
 * Clear the future assignments that the approved leave `leaveId` covers: its
 * person's bookings on its date, at every branch. Does nothing unless the
 * leave is approved when the statement runs, so it can follow the decision
 * in the same batch.
 */
export function releaseAssignmentsOnLeaveStatement(params: { leaveId: string; actorId: string }) {
  return db.execute(
    recordReleased(
      sql`update booking_service bs
        set staff_id = null
        from booking b, staff_time_off t
        where bs.booking_id = b.id
          and t.id = ${params.leaveId}::text
          and t.approval_status = 'approved'
          and bs.staff_id = t.staff_id
          and to_char(b.booking_date, 'YYYY-MM-DD') = t.date
          and ${STILL_TO_COME}
        returning bs.booking_id, t.staff_id, b.status`,
      'unavailable',
      params.actorId,
    ),
  )
}

/**
 * Clear the future assignments of the staff profile `staffId` that its weekly
 * schedule, as it stands after the writes before this statement in the same
 * transaction, no longer covers: a day off, a day at another branch, or time
 * outside the day's hours (0032), at every branch (MS-09). Confirmed bookings
 * are listed for reassignment; pending ones only lose their tentative
 * assignee; a booking under way keeps its person.
 */
export function releaseAssignmentsOffScheduleStatement(params: {
  staffId: string
  actorId: string | null
}) {
  return db.execute(
    recordReleased(
      sql`update booking_service bs
        set staff_id = null
        from booking b
        where bs.booking_id = b.id
          and bs.staff_id = ${params.staffId}::text
          and ${STILL_TO_COME}
          and staff_off_schedule(bs.staff_id, b.branch_id, b.booking_date, b.start_time, b.end_time)
        returning bs.booking_id, ${params.staffId}::text as staff_id, b.status`,
      'off_schedule',
      params.actorId,
    ),
  )
}

/**
 * Before booking `bookingId` moves to `date` from `startTime` to `endTime`,
 * take its person off it when they can't take the new time, so the move goes
 * ahead and reception assigns someone (MS-09): on approved leave that day
 * ('unavailable'), not scheduled then ('off_schedule'), or booked then
 * ('overrun': busy with another customer at that time). Only a confirmed
 * booking holds its person; a pending one keeps its tentative assignee for
 * approval to replace. Lists the booking for reassignment, by `actorId`.
 */
export function releaseAssigneeForMoveStatement(params: {
  bookingId: string
  date: string
  startTime: string
  endTime: string
  actorId: string
}) {
  const date = sql`${params.date}::date`
  const start = sql`${params.startTime}::time`
  const end = sql`${params.endTime}::time`
  return db.execute(sql`
    with lines as (
      select bs.id as line_id, bs.booking_id, bs.staff_id,
             case
               when exists (select 1 from staff_time_off t
                             where t.staff_id = bs.staff_id and t.approval_status = 'approved'
                               and t.date = to_char(${date}, 'YYYY-MM-DD')) then 'unavailable'
               when staff_off_schedule(bs.staff_id, b.branch_id, ${date}, ${start}, ${end})
                 then 'off_schedule'
               when exists (select 1 from staff_occupancy o
                             where o.staff_id = bs.staff_id and o.booking_id <> b.id
                               and o.during && booking_planned_during(${date}, ${start}, ${end})
                               and (o.kind = 'spa' or b.service_type = 'spa')) then 'overrun'
             end as reason
        from booking_service bs
        join booking b on b.id = bs.booking_id
       where b.id = ${params.bookingId}::text
         and b.status = 'confirmed'
         and bs.staff_id is not null
    ),
    gone as (
      update booking_service bs
         set staff_id = null
        from lines l
       where bs.id = l.line_id
         and l.reason is not null
      returning l.booking_id, l.staff_id, l.reason
    )
    insert into booking_reassignment (booking_id, reason, previous_staff_id, created_by_id)
    select distinct on (booking_id) booking_id, reason::booking_reassignment_reason, staff_id,
           ${params.actorId}::text
      from gone
     order by booking_id, staff_id
    on conflict (booking_id) where resolved_at is null do nothing
    returning booking_id`)
}

/** The confirmed booking ids a release statement listed, from its batch result. */
export function releasedBookingIds(result: unknown): string[] {
  const rows = (result as { rows?: { booking_id?: unknown }[] } | null)?.rows ?? []
  return rows.flatMap((row) => (typeof row.booking_id === 'string' ? [row.booking_id] : []))
}

/** Close the open work of the booking at the branch: `actorId` assigned someone else. */
export function resolveReassignmentStatement(bookingId: string, branchId: string, actorId: string) {
  return db
    .update(bookingReassignment)
    .set({ resolvedAt: sql`now()`, resolution: 'reassigned', resolvedById: actorId })
    .where(
      and(
        eq(bookingReassignment.bookingId, bookingId),
        isNull(bookingReassignment.resolvedAt),
        inArray(
          bookingReassignment.bookingId,
          db
            .select({ id: booking.id })
            .from(booking)
            .where(and(eq(booking.id, bookingId), eq(booking.branchId, branchId))),
        ),
      ),
    )
}

/**
 * Why the database refused an assignee, or null for another error:
 * - not_at_branch, on_leave: trigger booking_assignee_guard (0014);
 * - off_schedule: their weekly schedule rules the time out (0032);
 * - booked: the person has another booking then (staff_occupancy, 0028);
 * - working: the person is still with another customer (staff_work, 0028);
 * - one_assignee: a confirmed booking's lines name different people (0028).
 */
export type AssigneeRefusal =
  | 'not_at_branch'
  | 'on_leave'
  | 'off_schedule'
  | 'booked'
  | 'working'
  | 'one_assignee'

const BOOKED_CONSTRAINTS = ['staff_occupancy_spa_overlap', 'staff_occupancy_mixed_overlap']
const WORKING_CONSTRAINTS = ['staff_work_spa_overlap', 'staff_work_mixed_overlap']

export function assigneeRefusal(error: unknown): AssigneeRefusal | null {
  if (isConstraintViolation(error, SQLSTATE.checkViolation, ['booking_assignee_works_at_branch'])) {
    return 'not_at_branch'
  }
  if (isConstraintViolation(error, SQLSTATE.checkViolation, ['booking_assignee_on_leave'])) {
    return 'on_leave'
  }
  if (isConstraintViolation(error, SQLSTATE.checkViolation, ['booking_assignee_off_schedule'])) {
    return 'off_schedule'
  }
  if (isConstraintViolation(error, SQLSTATE.exclusionViolation, BOOKED_CONSTRAINTS)) {
    return 'booked'
  }
  if (isConstraintViolation(error, SQLSTATE.exclusionViolation, WORKING_CONSTRAINTS)) {
    return 'working'
  }
  if (isConstraintViolation(error, SQLSTATE.checkViolation, ['booking_one_assignee'])) {
    return 'one_assignee'
  }
  return null
}

/** What reception reads when the database refuses an assignee. */
export function assigneeRefusalMessage(refusal: AssigneeRefusal): string {
  switch (refusal) {
    case 'on_leave':
      return 'That staff member is on approved leave that day. Choose someone else.'
    case 'not_at_branch':
      return 'That staff member no longer works at this branch. Choose someone else.'
    case 'off_schedule':
      return 'That staff member isn’t scheduled to work then. Choose someone else.'
    case 'booked':
      return 'That staff member has another booking at that time. Choose someone else.'
    case 'working':
      return 'That staff member is still with another customer. Choose someone else.'
    case 'one_assignee':
      return 'One person does the whole booking. Choose one person for all of it.'
  }
}

const customer = alias(user, 'reassignment_customer')
const previousUser = alias(user, 'reassignment_previous_user')

/** The branch's open reassignment work, soonest booking first. */
export async function getOpenReassignments(branchId: string): Promise<OpenReassignment[]> {
  return db
    .select({
      id: bookingReassignment.id,
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      serviceType: booking.serviceType,
      customerName: customer.name,
      reason: bookingReassignment.reason,
      previousStaffName: previousUser.name,
      heldUp: HELD_UP,
      since: bookingReassignment.createdAt,
    })
    .from(bookingReassignment)
    .innerJoin(booking, eq(bookingReassignment.bookingId, booking.id))
    .innerJoin(customer, eq(booking.customerId, customer.id))
    .leftJoin(staffProfile, eq(bookingReassignment.previousStaffId, staffProfile.id))
    .leftJoin(previousUser, eq(staffProfile.userId, previousUser.id))
    .where(and(isNull(bookingReassignment.resolvedAt), eq(booking.branchId, branchId)))
    .orderBy(asc(booking.bookingDate), asc(booking.startTime))
}

/** The open work of each of `bookingIds` that has any. */
export async function getOpenReassignmentsFor(
  bookingIds: readonly string[],
): Promise<Map<string, ReassignmentSummary>> {
  if (bookingIds.length === 0) {
    return new Map()
  }
  const rows = await db
    .select({
      bookingId: bookingReassignment.bookingId,
      reason: bookingReassignment.reason,
      previousStaffName: previousUser.name,
      heldUp: HELD_UP,
      since: bookingReassignment.createdAt,
    })
    .from(bookingReassignment)
    .leftJoin(staffProfile, eq(bookingReassignment.previousStaffId, staffProfile.id))
    .leftJoin(previousUser, eq(staffProfile.userId, previousUser.id))
    .where(
      and(
        inArray(bookingReassignment.bookingId, [...bookingIds]),
        isNull(bookingReassignment.resolvedAt),
      ),
    )
  return new Map(
    rows.map((row) => [
      row.bookingId,
      {
        reason: row.reason,
        previousStaffName: row.previousStaffName,
        heldUp: row.heldUp,
        since: row.since,
      },
    ]),
  )
}
