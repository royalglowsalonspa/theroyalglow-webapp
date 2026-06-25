/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
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
 * - Cancel a booking with reason and timestamp (+ status-log entry, atomic batch)
 * - Reschedule a booking to a new slot (+ status-log entry, atomic batch)
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

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { booking, bookingService, bookingStatusLog } from '../schema/booking'
import { branch } from '../schema/branch'
import { staffProfile } from '../schema/profile'
import { staffService } from '../schema/service'

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

// Pick a default active staff member able to perform the given service. Pending
// bookings carry an auto-assigned staff that the admin reassigns on approval — the
// booking_service.staff_id column is NOT NULL, so a placeholder is always required.
// Falls back to any active staff member if none is mapped to the service.
export async function getDefaultStaffForService(serviceId: string) {
  const mapped = await db
    .select({ id: staffProfile.id })
    .from(staffService)
    .innerJoin(staffProfile, eq(staffService.staffId, staffProfile.id))
    .where(and(eq(staffService.serviceId, serviceId), eq(staffProfile.isActive, true)))
    .limit(1)

  if (mapped[0]) {
    return mapped[0].id
  }

  const anyStaff = await db
    .select({ id: staffProfile.id })
    .from(staffProfile)
    .where(eq(staffProfile.isActive, true))
    .limit(1)

  return anyStaff[0]?.id ?? null
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

  const [bookingResult] = await db.batch([
    insertBooking,
    db.insert(bookingService).values(serviceValues),
  ])

  return bookingResult[0] as typeof booking.$inferSelect
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

// Mark a booking as cancelled and append a status-log entry capturing the
// transition, in a single atomic batch. Records the cancellation reason and
// timestamp, and logs the prior → cancelled move with the acting user (Req 7.5).
// Returns null when the booking does not exist. neon-http has no interactive
// transactions, so db.batch() provides atomicity (same pattern as reschedule).
export async function cancelBooking(id: string, changedById: string, reason: string | null) {
  const rows = await db
    .select({ status: booking.status })
    .from(booking)
    .where(eq(booking.id, id))
    .limit(1)
  const current = rows[0]
  if (!current) {
    return null
  }

  const updateStmt = db
    .update(booking)
    .set({
      status: 'cancelled',
      cancellationReason: reason,
      cancelledAt: new Date(),
    })
    .where(eq(booking.id, id))
    .returning()

  const logStmt = db.insert(bookingStatusLog).values({
    bookingId: id,
    fromStatus: current.status,
    toStatus: 'cancelled',
    changedById,
    notes: reason ? `Cancelled: ${reason}` : 'Cancelled',
  })

  const [updateResult] = await db.batch([updateStmt, logStmt])
  return (updateResult[0] as typeof booking.$inferSelect | undefined) ?? null
}

// Reschedule a booking to a new date/slot and append a status-log entry, in a
// single atomic batch. The booking's lifecycle status is preserved (a pending
// booking stays pending, a confirmed one stays confirmed) — only the slot moves
// and reschedule_count increments. The log row captures the move for the audit
// trail (from/to status are identical by design; the notes carry the new slot).
// neon-http has no interactive transactions, so db.batch() is used for atomicity.
export async function rescheduleBooking(
  id: string,
  changedById: string,
  data: { bookingDate: Date; startTime: string; endTime: string },
) {
  const rows = await db
    .select({ status: booking.status })
    .from(booking)
    .where(eq(booking.id, id))
    .limit(1)
  const current = rows[0]
  if (!current) {
    return null
  }

  const noteDate = data.bookingDate.toISOString().slice(0, 10)

  const updateStmt = db
    .update(booking)
    .set({
      bookingDate: data.bookingDate,
      startTime: data.startTime,
      endTime: data.endTime,
      rescheduleCount: sql`${booking.rescheduleCount} + 1`,
    })
    .where(eq(booking.id, id))
    .returning()

  const logStmt = db.insert(bookingStatusLog).values({
    bookingId: id,
    fromStatus: current.status,
    toStatus: current.status,
    changedById,
    notes: `Rescheduled to ${noteDate} ${data.startTime}`,
  })

  const [updateResult] = await db.batch([updateStmt, logStmt])
  return (updateResult[0] as typeof booking.$inferSelect | undefined) ?? null
}
