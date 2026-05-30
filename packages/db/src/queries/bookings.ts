import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { booking, bookingService } from '../schema/booking'
import { branch } from '../schema/branch'
import { staffProfile } from '../schema/profile'
import { service, serviceCategory, staffService } from '../schema/service'

type NewBooking = typeof booking.$inferInsert
type NewBookingService = typeof bookingService.$inferInsert

// All bookings for a customer, newest first, each with its booking_service rows.
export async function getBookingsByCustomer(customerId: string) {
  const bookings = await db
    .select()
    .from(booking)
    .where(eq(booking.customerId, customerId))
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

// Fetch services by an array of ids (empty input → empty result). Includes the
// owning category's service_type since callers validate salon/spa against it.
export async function getServicesByIds(ids: string[]) {
  if (ids.length === 0) {
    return []
  }
  return db
    .select({
      id: service.id,
      categoryId: service.categoryId,
      name: service.name,
      slug: service.slug,
      durationMinutes: service.durationMinutes,
      pricePaise: service.pricePaise,
      isActive: service.isActive,
      serviceType: serviceCategory.serviceType,
    })
    .from(service)
    .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
    .where(inArray(service.id, ids))
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

// Mark a booking as cancelled, recording the reason and timestamp.
export async function cancelBooking(id: string, reason: string | null) {
  const [updated] = await db
    .update(booking)
    .set({
      status: 'cancelled',
      cancellationReason: reason,
      cancelledAt: new Date(),
    })
    .where(eq(booking.id, id))
    .returning()

  return updated ?? null
}
