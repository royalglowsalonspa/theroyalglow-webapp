import type { SubmitLeaveInput, UpsertScheduleInput } from '@rgss/types'
import { and, asc, countDistinct, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking, bookingService } from '../schema/booking'
import { staffProfile } from '../schema/profile'
import { staffSchedule, staffTimeOff } from '../schema/schedule'

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

// Upsert a staff member's weekly schedule (one row per day of week). neon-http has
// no interactive transactions, so we use db.batch() — one server-side transaction.
// Each entry inserts-or-updates on the unique (staff_id, day_of_week) constraint.
// startTime/endTime may be null (non-working days).
export async function upsertStaffSchedule(
  staffId: string,
  entries: UpsertScheduleInput['entries'],
) {
  const statements = entries.map((entry) =>
    db
      .insert(staffSchedule)
      .values({
        staffId,
        dayOfWeek: entry.dayOfWeek,
        isWorking: entry.isWorking,
        startTime: entry.startTime,
        endTime: entry.endTime,
      })
      .onConflictDoUpdate({
        target: [staffSchedule.staffId, staffSchedule.dayOfWeek],
        set: {
          isWorking: entry.isWorking,
          startTime: entry.startTime,
          endTime: entry.endTime,
        },
      }),
  )

  // db.batch requires a non-empty tuple; destructure to satisfy the type and
  // skip the call when there is nothing to write.
  const [first, ...rest] = statements
  if (!first) {
    return
  }
  await db.batch([first, ...rest])
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

// Weekly grid for the schedule page. `weekStartISO` is the 'YYYY-MM-DD' of the
// first of 7 consecutive dates (the 7 dates are computed here and returned as
// `dates`). Returns every active staff member with their schedule rows, the dates
// they have approved leave on within the week, and a per-date count of their
// confirmed bookings.
export async function getWeeklyScheduleGrid(weekStartISO: string) {
  const dates = computeWeekDates(weekStartISO)

  const staff = await db
    .select({
      id: staffProfile.id,
      userId: staffProfile.userId,
      name: user.name,
    })
    .from(staffProfile)
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(eq(staffProfile.isActive, true))
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

// A single leave request joined to the staff member's name and the staff's userId
// (needed to address a notification to them), or null if not found.
export async function getLeaveById(id: string) {
  const rows = await db
    .select({
      leave: staffTimeOff,
      staffName: user.name,
      staffUserId: user.id,
    })
    .from(staffTimeOff)
    .innerJoin(staffProfile, eq(staffTimeOff.staffId, staffProfile.id))
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(eq(staffTimeOff.id, id))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  return {
    ...found.leave,
    staffName: found.staffName,
    staffUserId: found.staffUserId,
  }
}

// Admin leave queue, newest first, each flattened with the staff member's name
// (staffId is already on the leave row). Optional filter narrows by approval status.
export async function getLeaveRequests(filters: LeaveFilters = {}) {
  const conditions = []
  if (filters.status) {
    conditions.push(eq(staffTimeOff.approvalStatus, filters.status as LeaveApprovalStatus))
  }

  const rows = await db
    .select({
      leave: staffTimeOff,
      staffName: user.name,
    })
    .from(staffTimeOff)
    .innerJoin(staffProfile, eq(staffTimeOff.staffId, staffProfile.id))
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(staffTimeOff.createdAt))

  return rows.map((r) => ({
    ...r.leave,
    staffName: r.staffName,
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

// Set a leave request's approval decision. Only 'approved' | 'rejected' are valid
// terminal states here; the leave enum has no 'withdrawn' (see withdrawLeave).
// Records the reviewer + time, and the rejection reason only when rejecting.
export async function updateLeaveStatus(
  id: string,
  status: 'approved' | 'rejected',
  reviewerId: string,
  rejectionReason?: string,
) {
  const [updated] = await db
    .update(staffTimeOff)
    .set({
      approvalStatus: status,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      rejectionReason: status === 'rejected' ? (rejectionReason ?? null) : null,
    })
    .where(eq(staffTimeOff.id, id))
    .returning()

  return updated ?? null
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

// Confirmed bookings assigned to a staff member on a specific date — exactly the
// bookings in status 'confirmed' whose booking_date equals the date and which have a
// booking_service row assigned to the staff. booking_date is a `date` mode column, so
// the 'YYYY-MM-DD' string is matched as a UTC-midnight Date. A booking with multiple
// services for the same staff is de-duped, collecting its service names.
export async function getConfirmedBookingsForStaffOnDate(staffId: string, dateISO: string) {
  const bookingDate = new Date(`${dateISO}T00:00:00.000Z`)

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
    .where(
      and(
        eq(booking.status, 'confirmed'),
        eq(booking.bookingDate, bookingDate),
        eq(bookingService.staffId, staffId),
      ),
    )
    .orderBy(asc(booking.startTime))

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
