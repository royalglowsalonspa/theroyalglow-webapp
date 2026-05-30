import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking, bookingService } from '../schema/booking'
import { branch } from '../schema/branch'
import { invoice, invoiceItem } from '../schema/invoice'
import { loyaltyAccount, loyaltyTransaction } from '../schema/loyalty'
import { staffProfile } from '../schema/profile'

type BookingStatus = (typeof booking.$inferSelect)['status']
type ServiceType = (typeof booking.$inferSelect)['serviceType']
type NewInvoice = typeof invoice.$inferInsert
type NewInvoiceItem = typeof invoiceItem.$inferInsert

type BookingFilters = {
  status?: string
  serviceType?: string
  date?: string // YYYY-MM-DD
}

// All bookings (admin view), newest first, each with customer name and its
// booking_service rows. Optional filters narrow by status, service type, or date.
export async function getAllBookings(filters: BookingFilters = {}) {
  const conditions = []
  if (filters.status) {
    conditions.push(eq(booking.status, filters.status as BookingStatus))
  }
  if (filters.serviceType) {
    conditions.push(eq(booking.serviceType, filters.serviceType as ServiceType))
  }
  if (filters.date) {
    conditions.push(eq(booking.bookingDate, new Date(`${filters.date}T00:00:00.000Z`)))
  }

  const rows = await db
    .select({
      booking,
      customerName: user.name,
      customerEmail: user.email,
    })
    .from(booking)
    .innerJoin(user, eq(booking.customerId, user.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(booking.bookingDate), desc(booking.createdAt))

  if (rows.length === 0) {
    return []
  }

  const bookingIds = rows.map((r) => r.booking.id)
  const services = await db
    .select()
    .from(bookingService)
    .where(inArray(bookingService.bookingId, bookingIds))
    .orderBy(asc(bookingService.displayOrder))

  return rows.map((r) => ({
    ...r.booking,
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    services: services.filter((s) => s.bookingId === r.booking.id),
  }))
}

// Single booking with customer info + its booking_service rows, or null.
export async function getBookingForAdmin(id: string) {
  const rows = await db
    .select({
      booking,
      customerName: user.name,
      customerEmail: user.email,
    })
    .from(booking)
    .innerJoin(user, eq(booking.customerId, user.id))
    .where(eq(booking.id, id))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  const services = await db
    .select()
    .from(bookingService)
    .where(eq(bookingService.bookingId, found.booking.id))
    .orderBy(asc(bookingService.displayOrder))

  return {
    ...found.booking,
    customerName: found.customerName,
    customerEmail: found.customerEmail,
    services,
  }
}

type BookingStatusExtras = {
  confirmedAt?: Date
  completedAt?: Date
  rejectionReason?: string
  rejectedAt?: Date
  cancelledAt?: Date
}

// Update a booking's status, optionally setting the associated timestamp/reason
// columns for the transition (confirmedAt, completedAt, rejectedAt, etc.).
export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
  extras: BookingStatusExtras = {},
) {
  const [updated] = await db
    .update(booking)
    .set({ status, ...extras })
    .where(eq(booking.id, id))
    .returning()

  return updated ?? null
}

// Assign a staff member to a single booking_service row.
export async function assignStaffToBookingService(
  bookingServiceId: string,
  staffId: string,
) {
  const [updated] = await db
    .update(bookingService)
    .set({ staffId })
    .where(eq(bookingService.id, bookingServiceId))
    .returning()

  return updated ?? null
}

// Assign a staff member to every booking_service row of a booking.
export async function assignStaffToAllServices(bookingId: string, staffId: string) {
  return db
    .update(bookingService)
    .set({ staffId })
    .where(eq(bookingService.bookingId, bookingId))
    .returning()
}

// All active staff members with their user name, for assignment pickers.
export async function getActiveStaff() {
  return db
    .select({
      id: staffProfile.id,
      userId: staffProfile.userId,
      name: user.name,
      designation: staffProfile.designation,
    })
    .from(staffProfile)
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(eq(staffProfile.isActive, true))
    .orderBy(asc(user.name))
}

// Resolve staff display names for a set of staff_profile ids (active or not) —
// used to snapshot staff names onto invoice items. Empty input → empty result.
export async function getStaffNamesByIds(ids: string[]) {
  if (ids.length === 0) {
    return []
  }
  return db
    .select({ id: staffProfile.id, name: user.name })
    .from(staffProfile)
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(inArray(staffProfile.id, ids))
}

// Fetch a single branch by id (includes the integer `number` used in invoice
// numbers), or null if not found.
export async function getBranchByIdAdmin(id: string) {
  const rows = await db.select().from(branch).where(eq(branch.id, id)).limit(1)
  return rows[0] ?? null
}

// Insert an invoice + its invoice_item rows atomically. neon-http has no
// interactive transactions, so we use db.batch() — one server-side transaction.
// The invoice id is pre-generated so the items can reference it within the batch.
export async function createInvoiceWithItems(
  invoiceData: Omit<NewInvoice, 'id'> & { id?: string },
  items: Omit<NewInvoiceItem, 'invoiceId'>[],
) {
  const invoiceId = invoiceData.id ?? nanoid()
  const invoiceValues: NewInvoice = { ...invoiceData, id: invoiceId }
  const insertInvoice = db.insert(invoice).values(invoiceValues).returning()

  if (items.length === 0) {
    const [created] = await insertInvoice
    return created as typeof invoice.$inferSelect
  }

  const itemValues: NewInvoiceItem[] = items.map((item) => ({
    ...item,
    invoiceId,
  }))

  const [invoiceResult] = await db.batch([
    insertInvoice,
    db.insert(invoiceItem).values(itemValues),
  ])

  return invoiceResult[0] as typeof invoice.$inferSelect
}

// Find a customer's loyalty account, creating it on first use.
export async function getOrCreateLoyaltyAccount(customerId: string) {
  const existing = await db
    .select()
    .from(loyaltyAccount)
    .where(eq(loyaltyAccount.customerId, customerId))
    .limit(1)

  if (existing[0]) {
    return existing[0]
  }

  const [created] = await db
    .insert(loyaltyAccount)
    .values({ customerId })
    .returning()

  return created as typeof loyaltyAccount.$inferSelect
}

// Record an 'earned' gems transaction and bump the account balance + lifetime
// total atomically via db.batch(). Returns the inserted transaction.
export async function addGemsTransaction(
  accountId: string,
  gems: number,
  invoiceId: string,
  description: string,
  expiresAt: Date,
) {
  const insertTx = db
    .insert(loyaltyTransaction)
    .values({
      loyaltyAccountId: accountId,
      type: 'earned',
      gemsAmount: gems,
      invoiceId,
      description,
      expiresAt,
    })
    .returning()

  const [txResult] = await db.batch([
    insertTx,
    db
      .update(loyaltyAccount)
      .set({
        gemsBalance: sql`${loyaltyAccount.gemsBalance} + ${gems}`,
        totalGemsEarned: sql`${loyaltyAccount.totalGemsEarned} + ${gems}`,
      })
      .where(eq(loyaltyAccount.id, accountId)),
  ])

  return txResult[0] as typeof loyaltyTransaction.$inferSelect
}
