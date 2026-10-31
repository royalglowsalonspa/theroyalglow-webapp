/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : schedule
 * Scope        : Data Access — Schedule
 *
 * Description  : Query functions for staff scheduling, leave management,
 *                and weekly grid display with booking counts.
 *
 * Responsibilities :
 * - Fetch and upsert staff weekly schedules
 * - Build weekly grid with staff, schedules, leave, and booking counts
 * - Submit, approve, reject, and withdraw leave requests; approval takes the
 *   person off that day's bookings in the same transaction (R5.8)
 * - Summarise the bookings an approval took the person off
 * - Resolve staff profile from user ID
 *
 * Features / Functionality :
 * - Weekly schedule grid with 7-day date computation
 * - Bulk schedule upsert via db.batch() with conflict handling
 * - Leave approval workflow (pending → approved/rejected)
 * - Leave withdrawal (hard delete of own pending requests)
 * - Per-staff per-date booking counts for capacity visualization
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index, ../schema/auth,
 *                ../schema/booking, ../schema/profile, ../schema/schedule
 *
 * Notes        : Staff schedules use unique (staff_id, day_of_week) constraint.
 *                Leave uses unique (staff_id, date) constraint.
 ************************************************************/

import type { SubmitLeaveInput, UpsertScheduleInput } from '@rgss/types'
import { and, asc, countDistinct, desc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking, bookingService } from '../schema/booking'
import { staffProfile } from '../schema/profile'
import { staffSchedule, staffTimeOff } from '../schema/schedule'
import { isGuardAbort } from './driver-errors'
import {
  releaseAssignmentsOffScheduleStatement,
  releaseAssignmentsOnLeaveStatement,
  releasedBookingIds,
} from './reassignments'
import { staffWorksAt } from './staff'

type LeaveApprovalStatus = (typeof staffTimeOff.$inferSelect)['approvalStatus']

type LeaveFilters = {
  status?: string
}

// All weekly schedule rows for a staff member, ordered by day of week (0=Sun … 6=Sat).
// The UI fills any missing days; we never assume all 7 rows exist.
export async function getStaffSchedule(staffId: string) {
  return db
    .select()
    .from(staffSchedule)
    .where(eq(staffSchedule.staffId, staffId))
    .orderBy(asc(staffSchedule.dayOfWeek))
}

/**
 * The staff profile `staffId`, active at `branchId` now: the guard every
 * branch schedule write repeats inside its own statement, so a person removed
 * from the branch meanwhile can't be scheduled there.
 */
function staffAtBranch(staffId: string, branchId: string): SQL {
  return sql`exists (select 1 from ${staffProfile} where ${staffProfile.id} = ${staffId} and ${staffWorksAt(branchId)})`
}

/** What a branch schedule write did, or why it was refused. */
export type ScheduleWriteResult =
  | {
      ok: true
      /** Confirmed bookings (any branch) the new week no longer covers, now awaiting someone. */
      reassignedBookingIds: string[]
    }
  | { ok: false; reason: 'stale' }

/**
 * Set a staff member's weekly schedule at one branch (one row per weekday) in
 * one batch, which neon-http runs as one transaction (multi-branch R5.10).
 *
 * - A working day is claimed for `branchId`, unless another branch holds it
 *   (a Manager shared between branches works at one branch per day). The
 *   statement also requires the person to still work at `branchId`. When
 *   either fails, `1 / count(*)` divides by zero and the whole batch rolls
 *   back: the result is `stale`. Check isDayHeldElsewhere first to explain it.
 * - A day off releases the weekday, but never one another branch holds: that
 *   row is left as it is.
 * - The person's bookings still to come, at every branch, that the new week
 *   no longer covers lose them in the same transaction (MS-09): confirmed
 *   ones are listed for reassignment as `actorId`'s change ('off_schedule'),
 *   pending ones only lose their tentative assignee. Their profile is locked
 *   first, as every assignment locks it FOR SHARE, so an assignment racing
 *   this write either commits first and is released here, or waits and is
 *   checked against the new week (0032).
 */
export async function upsertStaffSchedule(
  staffId: string,
  branchId: string,
  entries: UpsertScheduleInput['entries'],
  actorId: string | null = null,
): Promise<ScheduleWriteResult> {
  const writes: BatchItem<'pg'>[] = entries.map((entry) => {
    const claimable = sql`(staff_schedule.is_working = false or staff_schedule.branch_id is null or staff_schedule.branch_id = ${branchId})`
    if (!entry.isWorking) {
      return db.execute(sql`
        insert into staff_schedule (id, staff_id, day_of_week, is_working, start_time, end_time, branch_id)
        values (${nanoid()}, ${staffId}, ${entry.dayOfWeek}, false, null, null, null)
        on conflict (staff_id, day_of_week) do update
          set is_working = false, start_time = null, end_time = null, branch_id = null
          where ${claimable}`)
    }
    return db.execute(sql`
      with claimed as (
        insert into staff_schedule (id, staff_id, day_of_week, is_working, start_time, end_time, branch_id)
        select ${nanoid()}, ${staffId}, ${entry.dayOfWeek}, true, ${entry.startTime}::time, ${entry.endTime}::time, ${branchId}
        where ${staffAtBranch(staffId, branchId)}
        on conflict (staff_id, day_of_week) do update
          set is_working = true, start_time = excluded.start_time, end_time = excluded.end_time,
              branch_id = excluded.branch_id
          where ${claimable}
        returning 1
      )
      select 1 / count(*)::int as ok from claimed`)
  })

  // With nothing to write there is nothing to do.
  if (writes.length === 0) {
    return { ok: true, reassignedBookingIds: [] }
  }
  try {
    const results = await db.batch([
      db.execute(sql`select ${staffProfile.id} from ${staffProfile}
        where ${staffProfile.id} = ${staffId} for no key update`),
      ...writes,
      releaseAssignmentsOffScheduleStatement({ staffId, actorId }),
    ])
    return { ok: true, reassignedBookingIds: releasedBookingIds(results.at(-1)) }
  } catch (error) {
    if (isGuardAbort(error)) {
      return { ok: false, reason: 'stale' }
    }
    throw error
  }
}

// One person's current weekly rows (working flag and holding branch), for the
// pre-check that explains which days another branch holds.
export async function getScheduleDays(staffId: string) {
  return db
    .select({
      dayOfWeek: staffSchedule.dayOfWeek,
      isWorking: staffSchedule.isWorking,
      branchId: staffSchedule.branchId,
    })
    .from(staffSchedule)
    .where(eq(staffSchedule.staffId, staffId))
    .orderBy(asc(staffSchedule.dayOfWeek))
}

// Compute the 7 consecutive 'YYYY-MM-DD' dates of a week, starting at weekStartISO.
// weekStartISO is treated as the first day; arithmetic is done in UTC so the
// calendar date never drifts across a DST/timezone boundary.
function computeWeekDates(weekStartISO: string): string[] {
  const start = new Date(`${weekStartISO}T00:00:00.000Z`)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

// Weekly grid for one branch's schedule page. `weekStartISO` is the
// 'YYYY-MM-DD' of the first of 7 consecutive dates (the 7 dates are computed
// here and returned as `dates`). Returns everyone who works at the branch with
// their schedule rows (each naming the branch that holds the day, for the
// caller to hide other branches' days), the dates they have approved leave on
// within the week (leave belongs to the person, at every branch), and a
// per-date count of their confirmed bookings at this branch.
export async function getWeeklyScheduleGrid(branchId: string, weekStartISO: string) {
  const dates = computeWeekDates(weekStartISO)

  const staff = await db
    .select({
      id: staffProfile.id,
      userId: staffProfile.userId,
      name: user.name,
    })
    .from(staffProfile)
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(staffWorksAt(branchId))
    .orderBy(asc(user.name))

  if (staff.length === 0) {
    return { dates, staff: [] }
  }

  const staffIds = staff.map((s) => s.id)

  const schedules = await db
    .select()
    .from(staffSchedule)
    .where(inArray(staffSchedule.staffId, staffIds))
    .orderBy(asc(staffSchedule.dayOfWeek))

  // Approved leave falling on any of the week's dates.
  const approvedLeave = await db
    .select({
      staffId: staffTimeOff.staffId,
      date: staffTimeOff.date,
    })
    .from(staffTimeOff)
    .where(
      and(
        inArray(staffTimeOff.staffId, staffIds),
        inArray(staffTimeOff.date, dates),
        eq(staffTimeOff.approvalStatus, 'approved'),
      ),
    )

  // Per-staff, per-date confirmed booking counts. booking_date is a `date` mode
  // column, so we match the 'YYYY-MM-DD' strings as UTC-midnight Dates (as
  // getAllBookings does). countDistinct(booking.id) so a booking with multiple
  // services assigned to the same staff counts once.
  const weekDateObjects = dates.map((d) => new Date(`${d}T00:00:00.000Z`))
  const bookingCounts = await db
    .select({
      staffId: bookingService.staffId,
      bookingDate: booking.bookingDate,
      total: countDistinct(booking.id),
    })
    .from(bookingService)
    .innerJoin(booking, eq(bookingService.bookingId, booking.id))
    .where(
      and(
        eq(booking.branchId, branchId),
        inArray(bookingService.staffId, staffIds),
        inArray(booking.bookingDate, weekDateObjects),
        eq(booking.status, 'confirmed'),
      ),
    )
    .groupBy(bookingService.staffId, booking.bookingDate)

  const staffRows = staff.map((s) => {
    const bookingCountsByDate: Record<string, number> = {}
    for (const bc of bookingCounts) {
      if (bc.staffId === s.id) {
        const key = bc.bookingDate.toISOString().slice(0, 10)
        bookingCountsByDate[key] = bc.total
      }
    }

    return {
      staff: { id: s.id, userId: s.userId, name: s.name },
      schedule: schedules.filter((row) => row.staffId === s.id),
      leaveDates: approvedLeave.filter((l) => l.staffId === s.id).map((l) => l.date),
      bookingCountsByDate,
    }
  })

  return { dates, staff: staffRows }
}

// Submit a leave request for a single date. Status defaults to 'pending'. A duplicate
// (staff, date) hits the unique constraint — callers should pre-check via
// getLeaveForStaffOnDate or catch the violation to return a friendly 409.
export async function submitLeave(staffId: string, data: SubmitLeaveInput) {
  const [created] = await db
    .insert(staffTimeOff)
    .values({
      staffId,
      leaveType: data.leaveType,
      date: data.date,
      reason: data.reason ?? null,
    })
    .returning()

  return created as typeof staffTimeOff.$inferSelect
}

// Leave of the people who work at the branch now (a shared Manager's leave
// shows at each of their branches).
function leaveAtBranch(branchId: string): SQL {
  return inArray(
    staffTimeOff.staffId,
    db.select({ id: staffProfile.id }).from(staffProfile).where(staffWorksAt(branchId)),
  )
}

// A leave request of someone who works at the branch, joined to the staff
// member's name, userId (to address a notification to them) and the role their
// profile grants (who may decide it), or null when the branch has no such
// request.
export async function getLeaveById(id: string, branchId: string) {
  const rows = await db
    .select({
      leave: staffTimeOff,
      staffName: user.name,
      staffUserId: user.id,
      staffRoleWitness: staffProfile.roleWitness,
    })
    .from(staffTimeOff)
    .innerJoin(staffProfile, eq(staffTimeOff.staffId, staffProfile.id))
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(and(eq(staffTimeOff.id, id), leaveAtBranch(branchId)))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  return {
    ...found.leave,
    staffName: found.staffName,
    staffUserId: found.staffUserId,
    staffRoleWitness: found.staffRoleWitness as 'staff' | 'receptionist' | 'manager' | null,
  }
}

// One branch's leave queue, newest first, each flattened with the staff
// member's name, userId and profile role (staffId is already on the leave row).
// Optional filter narrows by approval status.
export async function getLeaveRequests(branchId: string, filters: LeaveFilters = {}) {
  const conditions = [leaveAtBranch(branchId)]
  if (filters.status) {
    conditions.push(eq(staffTimeOff.approvalStatus, filters.status as LeaveApprovalStatus))
  }

  const rows = await db
    .select({
      leave: staffTimeOff,
      staffName: user.name,
      staffUserId: user.id,
      staffRoleWitness: staffProfile.roleWitness,
    })
    .from(staffTimeOff)
    .innerJoin(staffProfile, eq(staffTimeOff.staffId, staffProfile.id))
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(and(...conditions))
    .orderBy(desc(staffTimeOff.createdAt))

  return rows.map((r) => ({
    ...r.leave,
    staffName: r.staffName,
    staffUserId: r.staffUserId,
    staffRoleWitness: r.staffRoleWitness as 'staff' | 'receptionist' | 'manager' | null,
  }))
}

// A staff member's own leave history, newest first.
export async function getLeaveForStaff(staffId: string) {
  return db
    .select()
    .from(staffTimeOff)
    .where(eq(staffTimeOff.staffId, staffId))
    .orderBy(desc(staffTimeOff.createdAt))
}

export type LeaveDecision = {
  leave: typeof staffTimeOff.$inferSelect
  /** Confirmed bookings (any branch) that lost the person and await reassignment. */
  reassignedBookingIds: string[]
}

// Decide a pending leave request of someone at the branch. Only 'approved' |
// 'rejected' are valid terminal states here; the leave enum has no 'withdrawn'
// (see withdrawLeave). Records the reviewer + time, and the rejection reason
// only when rejecting. The update matches only while the request is still
// pending and its person still works at the branch, so of two people deciding
// at once exactly one wins; null means the request was decided, withdrawn or
// moved meanwhile.
//
// Approval also takes the person off their bookings that day, at every branch,
// in the same transaction (R5.8): bookings still to come lose them and the
// confirmed ones are listed for reassignment (reassignments.ts). The person's
// profile is locked first, as every assignment locks it FOR SHARE: an
// assignment racing the approval either commits first and is released here,
// or waits and is refused (migration 0014).
export async function updateLeaveStatus(
  id: string,
  branchId: string,
  status: 'approved' | 'rejected',
  reviewerId: string,
  rejectionReason?: string,
): Promise<LeaveDecision | null> {
  const decide = db
    .update(staffTimeOff)
    .set({
      approvalStatus: status,
      reviewedBy: reviewerId,
      reviewedAt: sql`now()`,
      rejectionReason: status === 'rejected' ? (rejectionReason ?? null) : null,
    })
    .where(
      and(
        eq(staffTimeOff.id, id),
        eq(staffTimeOff.approvalStatus, 'pending'),
        leaveAtBranch(branchId),
      ),
    )
    .returning()

  if (status === 'rejected') {
    const [updated] = await decide
    return updated ? { leave: updated, reassignedBookingIds: [] } : null
  }

  try {
    const results = await db.batch([
      db.execute(sql`select ${staffProfile.id} from ${staffProfile}
        where ${staffProfile.id} = (select ${staffTimeOff.staffId} from ${staffTimeOff} where ${staffTimeOff.id} = ${id})
        for no key update`),
      decide,
      // Only this transaction's decision stamps reviewed_at with its now():
      // without it, nothing is released and the batch rolls back.
      db.execute(sql`select 1 / count(*)::int as ok from ${staffTimeOff}
        where ${staffTimeOff.id} = ${id} and ${staffTimeOff.reviewedAt} = now()`),
      releaseAssignmentsOnLeaveStatement({ leaveId: id, actorId: reviewerId }),
    ])
    const [updated] = results[1]
    if (!updated) {
      return null
    }
    return { leave: updated, reassignedBookingIds: releasedBookingIds(results[3]) }
  } catch (error) {
    if (isGuardAbort(error)) {
      return null
    }
    throw error
  }
}

// Withdraw a staff member's own pending leave request. The leave enum has no
// 'withdrawn' state, so withdraw = hard delete of the staff's own pending row (scoped
// to id + staffId + pending). Returns the deleted row, or null if nothing matched
// (not theirs, not pending, or already decided) — keeps everything FK/enum-safe.
export async function withdrawLeave(id: string, staffId: string) {
  const [deleted] = await db
    .delete(staffTimeOff)
    .where(
      and(
        eq(staffTimeOff.id, id),
        eq(staffTimeOff.staffId, staffId),
        eq(staffTimeOff.approvalStatus, 'pending'),
      ),
    )
    .returning()

  return deleted ?? null
}

// The bookings among `bookingIds` that are at the branch, earliest first, each
// with its customer and service names: what a leave approval took the person
// off (LeaveDecision.reassignedBookingIds). Another branch's bookings are never
// listed (multi-branch R2.3). A booking with several services is listed once,
// collecting its service names.
export async function getBookingSummaries(bookingIds: readonly string[], branchId: string) {
  if (bookingIds.length === 0) {
    return []
  }
  const rows = await db
    .select({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      startTime: booking.startTime,
      customerName: user.name,
      serviceName: bookingService.serviceNameSnapshot,
    })
    .from(booking)
    .innerJoin(bookingService, eq(bookingService.bookingId, booking.id))
    .innerJoin(user, eq(booking.customerId, user.id))
    .where(and(inArray(booking.id, [...bookingIds]), eq(booking.branchId, branchId)))
    .orderBy(asc(booking.bookingDate), asc(booking.startTime), asc(bookingService.displayOrder))

  const byBooking = new Map<
    string,
    {
      bookingId: string
      bookingNumber: string
      startTime: string
      customerName: string
      serviceNames: string[]
    }
  >()
  for (const row of rows) {
    const existing = byBooking.get(row.bookingId)
    if (existing) {
      existing.serviceNames.push(row.serviceName)
    } else {
      byBooking.set(row.bookingId, {
        bookingId: row.bookingId,
        bookingNumber: row.bookingNumber,
        startTime: row.startTime,
        customerName: row.customerName,
        serviceNames: [row.serviceName],
      })
    }
  }

  return Array.from(byBooking.values())
}

// Resolve a staff_profile id from a session user id, or null if the user is not staff.
export async function getStaffProfileByUserId(userId: string) {
  const rows = await db
    .select({ id: staffProfile.id })
    .from(staffProfile)
    .where(eq(staffProfile.userId, userId))
    .limit(1)

  return rows[0] ?? null
}

// A staff member's leave row on a specific date, or null — used for a friendly
// duplicate pre-check before submitLeave (the unique (staff, date) constraint).
export async function getLeaveForStaffOnDate(staffId: string, date: string) {
  const rows = await db
    .select()
    .from(staffTimeOff)
    .where(and(eq(staffTimeOff.staffId, staffId), eq(staffTimeOff.date, date)))
    .limit(1)

  return rows[0] ?? null
}
