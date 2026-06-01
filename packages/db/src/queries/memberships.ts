import { ERROR_CODES, conflict } from '@rgss/errors'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking, bookingService } from '../schema/booking'
import { invoice, invoiceItem } from '../schema/invoice'
import { spaMembership, spaMembershipTier } from '../schema/membership'
import { staffProfile } from '../schema/profile'

type NewMembership = typeof spaMembership.$inferInsert
type NewInvoice = typeof invoice.$inferInsert
type NewInvoiceItem = typeof invoiceItem.$inferInsert
type NewBooking = typeof booking.$inferInsert
type NewBookingService = typeof bookingService.$inferInsert

type MembershipStatus = (typeof spaMembership.$inferSelect)['status']
type PaymentMethod = (typeof invoice.$inferSelect)['paymentMethod']

// Active membership tiers, ordered by display order, for the create form / tier picker.
export async function getMembershipTiers() {
  return db
    .select()
    .from(spaMembershipTier)
    .where(eq(spaMembershipTier.isActive, true))
    .orderBy(asc(spaMembershipTier.displayOrder))
}

// A single membership with the owning customer's name/email and its tier, or
// null if not found. Session history is fetched separately via getMembershipSessions.
export async function getMembershipById(id: string) {
  const rows = await db
    .select({
      membership: spaMembership,
      customerName: user.name,
      customerEmail: user.email,
      tier: spaMembershipTier,
    })
    .from(spaMembership)
    .innerJoin(user, eq(spaMembership.customerId, user.id))
    .innerJoin(spaMembershipTier, eq(spaMembership.tierId, spaMembershipTier.id))
    .where(eq(spaMembership.id, id))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  return {
    ...found.membership,
    customerName: found.customerName,
    customerEmail: found.customerEmail,
    tier: found.tier,
  }
}

type MembershipFilters = {
  tier?: string // tier id
  status?: string
}

// Admin membership list, each flattened with the customer name + tier name,
// newest first. Optional filters narrow by tier id and/or status.
export async function getMemberships(filters: MembershipFilters = {}) {
  const conditions = []
  if (filters.tier) {
    conditions.push(eq(spaMembership.tierId, filters.tier))
  }
  if (filters.status) {
    conditions.push(eq(spaMembership.status, filters.status as MembershipStatus))
  }

  const rows = await db
    .select({
      membership: spaMembership,
      customerName: user.name,
      tierName: spaMembershipTier.name,
    })
    .from(spaMembership)
    .innerJoin(user, eq(spaMembership.customerId, user.id))
    .innerJoin(spaMembershipTier, eq(spaMembership.tierId, spaMembershipTier.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(spaMembership.createdAt))

  return rows.map((r) => ({
    ...r.membership,
    customerName: r.customerName,
    tierName: r.tierName,
  }))
}

// The single active membership for a customer, or null. The DB enforces at most
// one active membership per customer via a partial unique index.
export async function getActiveMembershipForCustomer(customerId: string) {
  const rows = await db
    .select()
    .from(spaMembership)
    .where(and(eq(spaMembership.customerId, customerId), eq(spaMembership.status, 'active')))
    .limit(1)

  return rows[0] ?? null
}

// Completed membership-session bookings for a membership, newest first, each
// with its booking_service snapshot rows (service name, duration, staff name).
export async function getMembershipSessions(membershipId: string) {
  const bookings = await db
    .select()
    .from(booking)
    .where(and(eq(booking.spaMembershipId, membershipId), eq(booking.status, 'completed')))
    .orderBy(desc(booking.bookingDate), desc(booking.createdAt))

  if (bookings.length === 0) {
    return []
  }

  const bookingIds = bookings.map((b) => b.id)
  const services = await db
    .select({
      bookingId: bookingService.bookingId,
      serviceId: bookingService.serviceId,
      serviceNameSnapshot: bookingService.serviceNameSnapshot,
      durationMinutes: bookingService.durationMinutes,
      staffId: bookingService.staffId,
      staffName: user.name,
      displayOrder: bookingService.displayOrder,
    })
    .from(bookingService)
    .leftJoin(staffProfile, eq(bookingService.staffId, staffProfile.id))
    .leftJoin(user, eq(staffProfile.userId, user.id))
    .where(inArray(bookingService.bookingId, bookingIds))
    .orderBy(asc(bookingService.displayOrder))

  return bookings.map((b) => ({
    ...b,
    services: services.filter((s) => s.bookingId === b.id),
  }))
}

type CreateMembershipWithInvoiceParams = {
  membershipNumber: string
  customerId: string
  tierId: string
  tierNameSnapshot: string
  totalHoursMinutes: number
  pricePaidPaise: number
  startsAt: Date
  expiresAt: Date
  createdBy: string
  notes?: string | null
  branchId: string
  invoiceNumber: string
  subtotalPaise: number
  taxableValuePaise: number
  gstAmountPaise: number
  totalAmountPaise: number
  paymentMethod: PaymentMethod
}

// Create a membership and its membership_purchase invoice atomically. neon-http
// has no interactive transactions, so we use db.batch() — one server-side
// transaction. The membership and invoice ids are pre-generated so the membership
// can carry its invoiceId and the invoice_item can reference the invoice within
// the same batch. A membership_purchase invoice has no booking (bookingId null)
// and earns zero gems. Throws MEMBERSHIP_ALREADY_ACTIVE (409) if the customer
// already has an active membership.
export async function createMembershipWithInvoice(params: CreateMembershipWithInvoiceParams) {
  const existing = await getActiveMembershipForCustomer(params.customerId)
  if (existing) {
    throw conflict(
      ERROR_CODES.MEMBERSHIP_ALREADY_ACTIVE,
      'This customer already has an active membership',
    )
  }

  const membershipId = nanoid()
  const invoiceId = nanoid()
  const now = new Date()

  const membershipValues: NewMembership = {
    id: membershipId,
    membershipNumber: params.membershipNumber,
    customerId: params.customerId,
    tierId: params.tierId,
    tierNameSnapshot: params.tierNameSnapshot,
    totalHoursMinutes: params.totalHoursMinutes,
    pricePaidPaise: params.pricePaidPaise,
    startsAt: params.startsAt,
    expiresAt: params.expiresAt,
    status: 'active',
    createdBy: params.createdBy,
    invoiceId,
    notes: params.notes ?? null,
  }

  const invoiceValues: NewInvoice = {
    id: invoiceId,
    invoiceNumber: params.invoiceNumber,
    branchId: params.branchId,
    bookingId: null,
    customerId: params.customerId,
    subtotalPaise: params.subtotalPaise,
    taxableValuePaise: params.taxableValuePaise,
    gstAmountPaise: params.gstAmountPaise,
    totalAmountPaise: params.totalAmountPaise,
    invoiceType: 'membership_purchase',
    paymentMethod: params.paymentMethod,
    paymentStatus: 'paid',
    gemsEarned: 0,
    paidAt: now,
  }

  const invoiceItemValues: NewInvoiceItem = {
    invoiceId,
    serviceId: null,
    serviceNameSnapshot: `${params.tierNameSnapshot} SPA Membership`,
    staffNameSnapshot: null,
    quantity: 1,
    unitPricePaise: params.totalAmountPaise,
    totalPricePaise: params.totalAmountPaise,
    displayOrder: 0,
  }

  const results = await db.batch([
    db.insert(spaMembership).values(membershipValues).returning(),
    db.insert(invoice).values(invoiceValues).returning(),
    db.insert(invoiceItem).values(invoiceItemValues),
  ])

  return {
    membership: results[0][0] as typeof spaMembership.$inferSelect,
    invoice: results[1][0] as typeof invoice.$inferSelect,
  }
}

type SessionServiceInput = {
  serviceId: string
  staffId?: string | null
  serviceNameSnapshot: string
  staffNameSnapshot?: string | null
  durationMinutes: number
}

type RecordMembershipSessionParams = {
  membershipId: string
  bookingNumber: string
  branchId: string
  customerId: string
  bookingDate: Date
  startTime: string
  endTime: string
  invoiceNumber: string
  notes?: string | null
  services: SessionServiceInput[]
  // Snapshot of the membership's hour totals, for computing remaining minutes
  // after this session is deducted.
  totalHoursMinutes: number
  usedHoursMinutes: number
}

// Record a membership session atomically via db.batch(): a completed ₹0 booking
// flagged as a membership session, its booking_service snapshot rows, a
// membership_session invoice (₹0, zero gems) with its invoice_item rows, and an
// increment of the membership's used minutes. Booking and invoice ids are
// pre-generated so children reference them within the same batch. Returns the
// booking, invoice, and the membership's remaining minutes after the deduction.
export async function recordMembershipSession(params: RecordMembershipSessionParams) {
  const bookingId = nanoid()
  const invoiceId = nanoid()
  const now = new Date()
  const totalMinutes = params.services.reduce((sum, s) => sum + s.durationMinutes, 0)

  const bookingValues: NewBooking = {
    id: bookingId,
    bookingNumber: params.bookingNumber,
    branchId: params.branchId,
    customerId: params.customerId,
    status: 'completed',
    serviceType: 'spa',
    bookingDate: params.bookingDate,
    startTime: params.startTime,
    endTime: params.endTime,
    totalAmountPaise: 0,
    totalDurationMinutes: totalMinutes,
    isMembershipSession: true,
    spaMembershipId: params.membershipId,
    completedAt: now,
    notes: params.notes ?? null,
  }

  const bookingServiceValues: NewBookingService[] = params.services.map((s, index) => ({
    bookingId,
    serviceId: s.serviceId,
    staffId: s.staffId ?? null,
    serviceNameSnapshot: s.serviceNameSnapshot,
    priceAtBookingPaise: 0,
    durationMinutes: s.durationMinutes,
    displayOrder: index,
  }))

  const invoiceValues: NewInvoice = {
    id: invoiceId,
    invoiceNumber: params.invoiceNumber,
    branchId: params.branchId,
    bookingId,
    customerId: params.customerId,
    subtotalPaise: 0,
    taxableValuePaise: 0,
    gstAmountPaise: 0,
    totalAmountPaise: 0,
    invoiceType: 'membership_session',
    paymentStatus: 'paid',
    gemsEarned: 0,
    paidAt: now,
  }

  const invoiceItemValues: NewInvoiceItem[] = params.services.map((s, index) => ({
    invoiceId,
    serviceId: s.serviceId,
    serviceNameSnapshot: s.serviceNameSnapshot,
    staffNameSnapshot: s.staffNameSnapshot ?? null,
    quantity: 1,
    unitPricePaise: 0,
    totalPricePaise: 0,
    displayOrder: index,
  }))

  const results = await db.batch([
    db.insert(booking).values(bookingValues).returning(),
    db.insert(bookingService).values(bookingServiceValues),
    db.insert(invoice).values(invoiceValues).returning(),
    db.insert(invoiceItem).values(invoiceItemValues),
    db
      .update(spaMembership)
      .set({ usedHoursMinutes: sql`${spaMembership.usedHoursMinutes} + ${totalMinutes}` })
      .where(eq(spaMembership.id, params.membershipId)),
  ])

  const remainingMinutes = params.totalHoursMinutes - (params.usedHoursMinutes + totalMinutes)

  return {
    booking: results[0][0] as typeof booking.$inferSelect,
    invoice: results[2][0] as typeof invoice.$inferSelect,
    remainingMinutes,
  }
}

// Cancel a membership: set status 'cancelled' and append the reason to notes.
// Returns the updated row, or null if no membership exists with that id.
export async function cancelMembership(id: string, reason: string) {
  const rows = await db.select().from(spaMembership).where(eq(spaMembership.id, id)).limit(1)
  const existing = rows[0]
  if (!existing) {
    return null
  }

  const cancellationNote = `Cancelled: ${reason}`
  const updatedNotes = existing.notes ? `${existing.notes}\n${cancellationNote}` : cancellationNote

  const [updated] = await db
    .update(spaMembership)
    .set({ status: 'cancelled', notes: updatedNotes })
    .where(eq(spaMembership.id, id))
    .returning()

  return updated ?? null
}
