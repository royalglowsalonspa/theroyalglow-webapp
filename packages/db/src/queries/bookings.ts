/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : bookings
 * Scope        : Data Access — Bookings
 *
 * Description  : Query functions for customer-facing booking operations including
 *                creation, retrieval, cancellation, and service lookups.
 *
 * Responsibilities :
 * - Fetch customer's bookings with services (newest first)
 * - Fetch single booking by ID with service details
 * - Create booking + booking_service rows atomically
 * - Cancel a booking with reason and timestamp (+ status-log entry, the gems
 *   it was booked with given back and, when late, the customer's
 *   late-cancellation count; atomic batch)
 * - Reschedule a booking to a new slot (+ status-log entry, atomic batch),
 *   recording the branch settings revision that accepted it
 * - Append standalone status-log entries for lifecycle transitions
 * - Lookup services by IDs and resolve default staff
 *
 * Features / Functionality :
 * - Atomic booking creation with snapshot rows via db.batch()
 * - Service lookup includes category's service_type for validation
 * - Default staff assignment for pending bookings (placeholder)
 * - Branch lookup for booking validation
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, nanoid, ../index, ../schema/booking,
 *                ../schema/branch, ../schema/profile, ../schema/service
 *
 * Notes        : booking_service.staff_id is nullable — pending bookings get
 *                a placeholder staff that the admin reassigns on approval.
 ************************************************************/

import { AppError, conflict, ERROR_CODES } from '@rgss/errors'
import { and, asc, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { booking, bookingReassignment, bookingService, bookingStatusLog } from '../schema/booking'
import { branch } from '../schema/branch'
import { customerProfile, staffProfile } from '../schema/profile'
import { staffTimeOff } from '../schema/schedule'
import { staffService } from '../schema/service'
import { staffOccupancy } from '../schema/staff-occupancy'
import { isBranchAvailabilityRefusal, serviceNoLongerOffered } from './catalogue-availability'
import { isConstraintViolation, isGuardAbort, SQLSTATE } from './driver-errors'
import { returnGemsOfEndedRedemptions } from './gems-ledger'
import { assigneeRefusal, releaseAssigneeForMoveStatement } from './reassignments'
import { staffWorksAt } from './staff'

type NewBooking = typeof booking.$inferInsert
type NewBookingService = typeof bookingService.$inferInsert
type BookingStatus = (typeof booking.$inferSelect)['status']

// All bookings owned by a customer, newest first, each with its booking_service
// rows. Ownership is enforced by filtering on customer_id, so the result never
// includes another customer's bookings. An optional status filter narrows the
// result to bookings whose lifecycle status matches exactly.
export async function getBookingsByCustomer(customerId: string, statusFilter?: BookingStatus) {
  const ownership = eq(booking.customerId, customerId)
  const predicate = statusFilter ? and(ownership, eq(booking.status, statusFilter)) : ownership

  const bookings = await db
    .select()
    .from(booking)
    .where(predicate)
    .orderBy(desc(booking.bookingDate), desc(booking.createdAt))

  if (bookings.length === 0) {
    return []
  }

  const bookingIds = bookings.map((b) => b.id)
  const services = await db
    .select()
    .from(bookingService)
    .where(inArray(bookingService.bookingId, bookingIds))
    .orderBy(asc(bookingService.displayOrder))

  return bookings.map((b) => ({
    ...b,
    services: services.filter((s) => s.bookingId === b.id),
  }))
}

// Single booking with its booking_service rows, or null if not found.
export async function getBookingById(id: string) {
  const rows = await db.select().from(booking).where(eq(booking.id, id)).limit(1)
  const found = rows[0]
  if (!found) {
    return null
  }

  const services = await db
    .select()
    .from(bookingService)
    .where(eq(bookingService.bookingId, found.id))
    .orderBy(asc(bookingService.displayOrder))

  return { ...found, services }
}

// Single booking scoped to its owner, with its booking_service rows (status and
// lifecycle timestamps live on the booking row itself). Returns null when the
// booking does not exist OR is owned by another customer — the ownership check is
// part of the WHERE clause, so a cross-customer lookup is indistinguishable from
// a missing row and the caller maps both to NOT_FOUND.
export async function getBookingByIdForCustomer(id: string, customerId: string) {
  const rows = await db
    .select()
    .from(booking)
    .where(and(eq(booking.id, id), eq(booking.customerId, customerId)))
    .limit(1)
  const found = rows[0]
  if (!found) {
    return null
  }

  const services = await db
    .select()
    .from(bookingService)
    .where(eq(bookingService.bookingId, found.id))
    .orderBy(asc(bookingService.displayOrder))

  return { ...found, services }
}

// Fetch a single branch by id, or null if not found.
export async function getBranchById(id: string) {
  const rows = await db.select().from(branch).where(eq(branch.id, id)).limit(1)
  return rows[0] ?? null
}

// Pick a default staff member at the branch for the given service. Pending
// bookings carry a tentative assignee that the admin replaces on approval; a
// walk-in keeps it. Prefers someone at the branch who performs the service,
// then a Stylist or Therapist there, then anyone who works there; never
// someone from another branch (multi-branch R2.3). With `dateISO`
// (YYYY-MM-DD), skips anyone on approved leave that day, whom the database
// refuses on a confirmed booking (migration 0014). Null when nobody is left.
export async function getDefaultStaffForService(
  serviceId: string,
  branchId: string,
  dateISO?: string,
) {
  const available = dateISO
    ? sql`not exists (select 1 from ${staffTimeOff}
        where ${staffTimeOff.staffId} = ${staffProfile.id}
          and ${staffTimeOff.date} = ${dateISO}
          and ${staffTimeOff.approvalStatus} = 'approved')`
    : sql`true`

  const mapped = await db
    .select({ id: staffProfile.id })
    .from(staffService)
    .innerJoin(staffProfile, eq(staffService.staffId, staffProfile.id))
    .where(and(eq(staffService.serviceId, serviceId), staffWorksAt(branchId), available))
    .orderBy(asc(staffProfile.id))
    .limit(1)

  if (mapped[0]) {
    return mapped[0].id
  }

  const anyStaff = await db
    .select({ id: staffProfile.id })
    .from(staffProfile)
    .where(and(staffWorksAt(branchId), available))
    .orderBy(sql`(${staffProfile.roleWitness} = 'staff') desc`, asc(staffProfile.id))
    .limit(1)

  return anyStaff[0]?.id ?? null
}

// Pick the one default staff member at the branch for a whole booking, which
// one person does once it is confirmed (0028). Prefers someone who performs
// the most of `serviceIds`, then a Stylist or Therapist, then anyone who works
// there; never someone from another branch. Skips anyone on approved leave on
// `dateISO` (YYYY-MM-DD) and, with a `slot`, anyone whose bookings then clash
// with it: a SPA booking overlaps nothing of theirs, salon bookings may
// overlap each other. Null when nobody is left. The database checks again
// when the booking is written.
export async function getDefaultStaffForBooking(params: {
  serviceIds: readonly string[]
  branchId: string
  dateISO: string
  slot?: { startTime: string; endTime: string; kind: 'salon' | 'spa' }
}) {
  const onLeave = sql`exists (select 1 from ${staffTimeOff}
      where ${staffTimeOff.staffId} = ${staffProfile.id}
        and ${staffTimeOff.date} = ${params.dateISO}
        and ${staffTimeOff.approvalStatus} = 'approved')`
  const slot = params.slot
  const clashes = slot
    ? sql`exists (select 1 from ${staffOccupancy}
        where ${staffOccupancy.staffId} = ${staffProfile.id}
          and ${staffOccupancy.during} && booking_planned_during(${params.dateISO}::date,
            ${slot.startTime}::time, ${slot.endTime}::time)
          and (${staffOccupancy.kind} = 'spa' or ${slot.kind}::service_type = 'spa'))`
    : sql`false`
  const performs =
    params.serviceIds.length > 0
      ? sql`(select count(*) from ${staffService}
          where ${staffService.staffId} = ${staffProfile.id}
            and ${staffService.serviceId} in (${sql.join(
              params.serviceIds.map((id) => sql`${id}`),
              sql`, `,
            )}))`
      : sql`0`

  // Not scheduled then (0032): a day off, a day at another branch, or outside
  // the day's hours.
  const offSchedule = slot
    ? sql`staff_off_schedule(${staffProfile.id}, ${params.branchId}, ${params.dateISO}::date,
        ${slot.startTime}::time, ${slot.endTime}::time)`
    : sql`false`

  const rows = await db
    .select({ id: staffProfile.id })
    .from(staffProfile)
    .where(
      and(
        staffWorksAt(params.branchId),
        sql`not ${onLeave}`,
        sql`not ${clashes}`,
        sql`not ${offSchedule}`,
      ),
    )
    .orderBy(
      sql`${performs} desc`,
      sql`(${staffProfile.roleWitness} = 'staff') desc`,
      asc(staffProfile.id),
    )
    .limit(1)
  return rows[0]?.id ?? null
}

// Insert a booking + its booking_service snapshot rows atomically, return the booking.
// neon-http has no interactive transactions (db.transaction throws), so we use
// db.batch() — a single atomic, server-side transaction round-trip. The booking id is
// pre-generated so the child rows can reference it within the same batch.
export async function createBookingWithServices(
  data: Omit<NewBooking, 'id'> & { id?: string },
  services: Omit<NewBookingService, 'bookingId'>[],
) {
  const bookingId = data.id ?? nanoid()
  const bookingValues: NewBooking = { ...data, id: bookingId }
  const serviceValues: NewBookingService[] = services.map((s) => ({
    ...s,
    bookingId,
  }))

  const insertBooking = db.insert(booking).values(bookingValues).returning()

  if (serviceValues.length === 0) {
    const [created] = await insertBooking
    // .returning() on a single-row insert always yields the inserted row.
    return created as typeof booking.$inferSelect
  }

  let bookingResult: unknown
  try {
    ;[bookingResult] = await db.batch([
      insertBooking,
      db.insert(bookingService).values(serviceValues),
    ])
  } catch (error) {
    // The chosen assignee left the branch or went on leave after they were
    // picked (migration 0014). Nothing was written; picking again works.
    if (assigneeRefusal(error)) {
      throw new AppError({
        code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
        message: 'The staff for this booking just became unavailable. Please try again.',
        statusCode: 409,
        retryable: true,
      })
    }
    // A service stopped being offered at the branch after the route checked
    // (0034). Nothing was written.
    if (isBranchAvailabilityRefusal(error)) {
      throw serviceNoLongerOffered()
    }
    throw error
  }

  return (bookingResult as (typeof booking.$inferSelect)[])[0] as typeof booking.$inferSelect
}

// Append a single booking_status_log entry capturing a lifecycle transition.
// Standalone helper for callers that change status without their own atomic
// batch (the cancel/reschedule flows log inside their own batches for atomicity).
// fromStatus is nullable to support the initial transition into the lifecycle.
export async function insertStatusLog(entry: {
  bookingId: string
  fromStatus: BookingStatus | null
  toStatus: BookingStatus
  changedById: string
  notes?: string | null
}) {
  const [created] = await db
    .insert(bookingStatusLog)
    .values({
      bookingId: entry.bookingId,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      changedById: entry.changedById,
      notes: entry.notes ?? null,
    })
    .returning()

  return created ?? null
}

// Postgres rejects table-qualified column names in SET, so use the bare name.
function column(c: { name: string }): ReturnType<typeof sql.identifier> {
  return sql.identifier(c.name)
}

// An UPDATE that aborts the whole batch when it matches no row: the booking
// changed after it was read (cancelled twice, started, moved meanwhile).
function guarded(update: SQL): SQL {
  return sql`with changed as (${update} returning 1) select 1 / count(*)::int as ok from changed`
}

function changedMeanwhile(action: string): AppError {
  return conflict(
    ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
    `This booking changed while you were ${action} it. Reload it to see where it stands.`,
  )
}

/** What the branch's booking rules decided about a cancellation (R6.3). */
export type CancellationDecision = {
  /** Within the branch's cut-off: counted on the customer's record, never charged. */
  late: boolean
  /** The branch settings revision that decided it. */
  settingsRevision: number
}

// Mark a booking as cancelled and append a status-log entry capturing the
// transition, in a single atomic batch. Records the cancellation reason and
// timestamp, and logs the prior → cancelled move with the acting user (Req 7.5)
// and, for a customer's cancellation, the settings revision that decided
// whether it was late. A late cancellation adds one to the customer's
// late-cancellation count in the same batch. The update applies only to a
// pending or confirmed booking that still has the status read here, so a
// double submit can't count a late cancellation twice: it rolls back with 409.
// Returns null when the booking does not exist. neon-http has no interactive
// transactions, so db.batch() provides atomicity (same pattern as reschedule).
export async function cancelBooking(
  id: string,
  changedById: string,
  reason: string | null,
  decision?: CancellationDecision,
) {
  const rows = await db
    .select({ status: booking.status, customerId: booking.customerId })
    .from(booking)
    .where(eq(booking.id, id))
    .limit(1)
  const current = rows[0]
  if (!current) {
    return null
  }

  const late = decision?.late === true
  // Only an open booking is cancelled, and only from the status read here.
  const cancel = db.execute(
    guarded(sql`update ${booking}
      set ${column(booking.status)} = 'cancelled',
          ${column(booking.cancellationReason)} = ${reason},
          ${column(booking.cancelledAt)} = now(),
          ${column(booking.updatedAt)} = now()
      where ${booking.id} = ${id}
        and ${booking.status} = ${current.status}::booking_status
        and ${booking.status} in ('pending', 'confirmed')`),
  )

  const noteSuffix = reason ? `: ${reason}` : ''
  const log = db.insert(bookingStatusLog).values({
    bookingId: id,
    fromStatus: current.status,
    toStatus: 'cancelled',
    changedById,
    notes: late ? `Late cancellation${noteSuffix}` : `Cancelled${noteSuffix}`,
    settingsRevision: decision?.settingsRevision ?? null,
  })

  const read = db.select().from(booking).where(eq(booking.id, id)).limit(1)

  const writes: BatchItem<'pg'>[] = [cancel, log]
  if (late) {
    writes.push(
      db
        .update(customerProfile)
        .set({ lateCancellationCount: sql`${customerProfile.lateCancellationCount} + 1` })
        .where(eq(customerProfile.userId, current.customerId)),
    )
  }
  // A booking made with gems gives them back to the batches they came from
  // (ST-03), in the same transaction as the cancellation.
  writes.push(...returnGemsOfEndedRedemptions(sql`r.booking_id = ${id}`))

  const statements: BatchItem<'pg'>[] = [...writes, read]
  let after: (typeof booking.$inferSelect)[] | undefined
  try {
    const results = await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
    after = results.at(-1) as (typeof booking.$inferSelect)[]
  } catch (error) {
    if (isGuardAbort(error)) {
      throw changedMeanwhile('cancelling')
    }
    throw error
  }
  return after?.[0] ?? null
}

// Reschedule a booking to a new date/slot and append a status-log entry, in a
// single atomic batch. The booking's lifecycle status is preserved (a pending
// booking stays pending, a confirmed one stays confirmed) — only the slot moves
// and reschedule_count increments, unless the salon moved it. A confirmed
// booking's person who can't take the new time (leave, schedule, another
// booking) is taken off it and the booking listed for reassignment, in the
// same batch (MS-09). The log row captures the move for the audit
// trail (from/to status are identical by design; the notes carry the new slot).
// With `settingsRevision`, the booking now stands on the slot that revision of
// the branch's settings accepted, and the log says so. The move applies only
// while the booking still has the status and reschedule count read here, so a
// double submit can't move it twice past the branch's limit (409).
// neon-http has no interactive transactions, so db.batch() is used for atomicity.
export async function rescheduleBooking(
  id: string,
  changedById: string,
  data: {
    bookingDate: Date
    startTime: string
    endTime: string
    settingsRevision?: number
    /**
     * Whether the move counts against the customer's reschedule limit
     * (default true). A move the salon makes, such as off a closed day,
     * doesn't.
     */
    countsTowardLimit?: boolean
  },
) {
  const rows = await db
    .select({ status: booking.status, rescheduleCount: booking.rescheduleCount })
    .from(booking)
    .where(eq(booking.id, id))
    .limit(1)
  const current = rows[0]
  if (!current) {
    return null
  }

  const noteDate = data.bookingDate.toISOString().slice(0, 10)
  const revision = data.settingsRevision ?? null
  const counted = data.countsTowardLimit === false ? 0 : 1

  const move = db.execute(
    guarded(sql`update ${booking}
      set ${column(booking.bookingDate)} = ${noteDate}::date,
          ${column(booking.startTime)} = ${data.startTime}::time,
          ${column(booking.endTime)} = ${data.endTime}::time,
          ${column(booking.rescheduleCount)} = ${booking.rescheduleCount} + ${counted}::int,
          ${column(booking.settingsRevision)} = coalesce(${revision}::int, ${booking.settingsRevision}),
          ${column(booking.updatedAt)} = now()
      where ${booking.id} = ${id}
        and ${booking.status} = ${current.status}::booking_status
        and ${booking.status} in ('pending', 'confirmed')
        and ${booking.rescheduleCount} = ${current.rescheduleCount}::int`),
  )

  const log = db.insert(bookingStatusLog).values({
    bookingId: id,
    fromStatus: current.status,
    toStatus: current.status,
    changedById,
    notes: `Rescheduled to ${noteDate} ${data.startTime}`,
    settingsRevision: revision,
  })

  // Held up at its old time (slice 2b): the move answers that, so the
  // overrun flag ends with the old slot. A flag that took someone off the
  // booking stays open: it still needs a person.
  const endOverrun = db
    .update(bookingReassignment)
    .set({ resolvedAt: sql`now()`, resolution: 'booking_ended' })
    .where(
      and(
        eq(bookingReassignment.bookingId, id),
        eq(bookingReassignment.reason, 'overrun'),
        isNull(bookingReassignment.resolvedAt),
        sql`booking_sole_assignee(${bookingReassignment.bookingId}) = ${bookingReassignment.previousStaffId}`,
      ),
    )

  // The people it names are locked first, as every assignment, schedule save
  // and leave approval locks them, so a change to their week or leave runs
  // wholly before this move (and the release below sees it) or after it (and
  // sees the moved booking).
  const lockPeople = db.execute(sql`select sp.id from staff_profile sp
    where sp.id in (select bs.staff_id from booking_service bs where bs.booking_id = ${id})
    order by sp.id for share`)

  // A confirmed booking keeps its person when they can take the new time;
  // otherwise the move goes ahead without them and reception assigns someone
  // (MS-09). The database checks the moved booking again at commit (0032).
  const release = releaseAssigneeForMoveStatement({
    bookingId: id,
    date: noteDate,
    startTime: data.startTime,
    endTime: data.endTime,
    actorId: changedById,
  })

  const read = db.select().from(booking).where(eq(booking.id, id)).limit(1)

  let after: (typeof booking.$inferSelect)[]
  try {
    ;[, , , , , after] = await db.batch([lockPeople, endOverrun, release, move, log, read])
  } catch (error) {
    if (isGuardAbort(error)) {
      throw changedMeanwhile('rescheduling')
    }
    // A membership session moved outside its membership's validity: the
    // database refuses it (0026), so the session keeps its slot.
    if (isConstraintViolation(error, SQLSTATE.checkViolation, ['membership_hold_validity'])) {
      throw conflict(
        ERROR_CODES.MEMBERSHIP_EXPIRED,
        'The membership doesn’t cover that time. Choose a time before it expires.',
      )
    }
    const refusal = assigneeRefusal(error)
    // The person doing it took another booking at the new time meanwhile (0028).
    if (refusal === 'booked') {
      throw new AppError({
        code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
        message: 'That time isn’t free any more. Choose another time.',
        statusCode: 409,
      })
    }
    // Their branch changed while it moved (0032 rechecks at commit): nothing
    // moved, and trying again takes them off it.
    if (refusal !== null) {
      throw changedMeanwhile('rescheduling')
    }
    throw error
  }
  return after[0] ?? null
}
