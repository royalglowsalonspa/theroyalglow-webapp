/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : admin-bookings
 * Scope        : Data Access — Admin Bookings
 *
 * Description  : Query functions for admin booking management including listing,
 *                status updates, staff assignment, and invoice generation.
 *
 * Responsibilities :
 * - Fetch all bookings with filters (status, serviceType, date)
 * - Fetch single booking detail with customer info and services
 * - Update booking status with associated timestamps
 * - Assign staff to booking services (individual or bulk)
 * - Create invoices with line items atomically
 * - Approve / reject / (re)assign bookings with status-log audit entries
 * - Complete a booking atomically: status → completed + service invoice (GST
 *   split) + invoice items + gems credit + status log, in one db.batch()
 *
 * Features / Functionality :
 * - Filtered, paginated admin booking list with customer names
 * - Staff assignment to individual or all services in a booking
 * - Active staff listing for assignment pickers
 * - Atomic invoice + invoice_item creation via db.batch()
 * - Staff name resolution for invoice item snapshots
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, nanoid, ../index, ../schema/auth, ../schema/booking,
 *                ../schema/branch, ../schema/invoice, ../schema/profile
 *
 * Notes        : Uses db.batch() for atomic operations since neon-http does not
 *                support interactive transactions.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking, bookingService, bookingStatusLog } from '../schema/booking'
import { branch } from '../schema/branch'
import { invoice, invoiceItem } from '../schema/invoice'
import { loyaltyAccount, loyaltyTransaction } from '../schema/loyalty'
import { staffProfile } from '../schema/profile'
import { getOrCreateLoyaltyAccount } from './loyalty'

type BookingStatus = (typeof booking.$inferSelect)['status']
type ServiceType = (typeof booking.$inferSelect)['serviceType']
type NewInvoice = typeof invoice.$inferInsert
type NewInvoiceItem = typeof invoiceItem.$inferInsert

// Gems earned on a service invoice expire 365 days from the earn date
// (auto-swept by pg_cron Job 7). Mirrors the loyalty-domain expiry constant.
const LOYALTY_EXPIRY_DAYS = 365

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

// Cross-customer admin booking listing (Requirements 10.2–10.5). Returns every
// booking — newest first — with the owning customer's name/email, its
// booking_service rows (each carrying the assigned staff member's name, or null
// when none is assigned yet), and the booking status. The optional status,
// date, and service-type filters are applied conditionally as parameterized
// equality predicates in the WHERE clause; an absent filter widens the result.
export async function listBookings(filters: BookingFilters = {}) {
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

  // Resolve each booking_service row's assigned staff name via the
  // staff_profile → user chain. LEFT JOINs keep services whose staff is unset
  // (pending bookings are assigned staff only on approval).
  const services = await db
    .select({
      service: bookingService,
      staffName: user.name,
    })
    .from(bookingService)
    .leftJoin(staffProfile, eq(bookingService.staffId, staffProfile.id))
    .leftJoin(user, eq(staffProfile.userId, user.id))
    .where(inArray(bookingService.bookingId, bookingIds))
    .orderBy(asc(bookingService.displayOrder))

  const servicesWithStaff = services.map((s) => ({
    ...s.service,
    staffName: s.staffName,
  }))

  return rows.map((r) => ({
    ...r.booking,
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    services: servicesWithStaff.filter((s) => s.bookingId === r.booking.id),
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
export async function assignStaffToBookingService(bookingServiceId: string, staffId: string) {
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

  const [invoiceResult] = await db.batch([insertInvoice, db.insert(invoiceItem).values(itemValues)])

  return invoiceResult[0] as typeof invoice.$inferSelect
}

// ────────────────────────────────────────────────────────────────────────────
// Admin mutation queries (Requirements 11.1, 11.2, 11.4, 12.1)
//
// LAYER NOTE: packages/db must not import packages/business (the STRICT layer
// rule — @rgss/business is not a dependency of @rgss/db). The monetary GST split
// (splitGST), the gems award (calculateGemsEarned) and the invoice number
// (generateInvoiceNumber) are therefore computed by the admin route/business
// layer and passed in as already-resolved values; this layer only persists them
// atomically. Status-transition guards (e.g. approve/reject require `pending`,
// completion requires `confirmed`/`in_progress`) are likewise enforced by the
// route before these writers run — the prior status is read here solely to
// stamp the booking_status_log `fromStatus`, mirroring cancelBooking /
// rescheduleBooking in queries/bookings.ts.
//
// neon-http has no interactive transactions (db.transaction throws), so each
// multi-statement write uses db.batch() — a single atomic, server-side
// transaction round-trip.
// ────────────────────────────────────────────────────────────────────────────

// Approve a pending booking: set status → `confirmed` (+ confirmedAt), assign the
// chosen staff member to every booking_service row, and append a status-log entry
// capturing the prior → confirmed transition with the acting user (Req 11.1, 11.4).
// Returns the updated booking, or null when the booking does not exist.
export async function approveBooking(id: string, changedById: string, staffId: string) {
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
    .set({ status: 'confirmed', confirmedAt: new Date() })
    .where(eq(booking.id, id))
    .returning()

  const assignStmt = db
    .update(bookingService)
    .set({ staffId })
    .where(eq(bookingService.bookingId, id))

  const logStmt = db.insert(bookingStatusLog).values({
    bookingId: id,
    fromStatus: current.status,
    toStatus: 'confirmed',
    changedById,
    notes: 'Approved',
  })

  const [updateResult] = await db.batch([updateStmt, assignStmt, logStmt])
  return (updateResult[0] as typeof booking.$inferSelect | undefined) ?? null
}

// Reject a pending booking: set status → `rejected` (+ rejectedAt), store the
// customer-facing rejection reason, and append a status-log entry capturing the
// prior → rejected transition with the acting user (Req 11.2, 11.4). Returns the
// updated booking, or null when the booking does not exist.
export async function rejectBooking(id: string, changedById: string, rejectionReason: string) {
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
    .set({ status: 'rejected', rejectionReason, rejectedAt: new Date() })
    .where(eq(booking.id, id))
    .returning()

  const logStmt = db.insert(bookingStatusLog).values({
    bookingId: id,
    fromStatus: current.status,
    toStatus: 'rejected',
    changedById,
    notes: `Rejected: ${rejectionReason}`,
  })

  const [updateResult] = await db.batch([updateStmt, logStmt])
  return (updateResult[0] as typeof booking.$inferSelect | undefined) ?? null
}

// (Re)assign a staff member to every booking_service row of a booking, regardless
// of the booking's lifecycle status (Req 11 — assign action). No status change and
// no status-log entry: this only moves the resource allocation. Returns the updated
// booking_service rows (empty array when the booking has no services or is absent).
export async function assignStaff(bookingId: string, staffId: string) {
  return db
    .update(bookingService)
    .set({ staffId })
    .where(eq(bookingService.bookingId, bookingId))
    .returning()
}

type CompleteBookingInvoice = {
  invoiceNumber: string
  branchId: string
  customerId: string
  subtotalPaise: number
  // Pre-computed offer discount applied to the total (paise). Already resolved by
  // the route via computeOfferDiscount; this layer only persists it. Defaults 0.
  discountAmountPaise?: number
  taxableValuePaise: number
  gstAmountPaise: number
  totalAmountPaise: number
  paymentMethod: NewInvoice['paymentMethod']
  invoiceType?: NewInvoice['invoiceType']
  // Gems to credit. Computed by the caller via calculateGemsEarned — already 0
  // for membership sessions (Req 12.3, 12.4). When 0, no loyalty rows are written.
  gemsEarned: number
  // Gems REDEEMED for one of this booking's services (optional). When present,
  // the same atomic batch deducts `gemsRequired` from the customer's loyalty
  // balance behind a `balance >= gemsRequired` guard, writes a 'redeemed'
  // loyalty_transaction, and stamps invoice.gemsRedeemed / gemsRedeemedServiceId.
  // The gem amount is the server-computed cost (assertRedeemable) — never client
  // input. A 0-row guard (balance raced below the cost) aborts the WHOLE
  // completion (nothing persists) via GEMS_INSUFFICIENT_BALANCE.
  gemsRedemption?: { serviceId: string; gemsRequired: number } | null
}

// Complete a booking and bill it in ONE atomic db.batch() (Req 12.1): set the
// booking status → `completed` (+ completedAt), create the service invoice (with
// the caller-supplied GST split and a `paid` payment status), insert the invoice
// line items, credit gems to the customer's loyalty account when any are earned,
// and append a status-log entry capturing the prior → completed transition.
//
// The GST split (splitGST), gems amount (calculateGemsEarned) and invoice number
// (generateInvoiceNumber) are computed by the route/business layer and passed in
// (see LAYER NOTE above). The loyalty account is resolved/created before the batch
// because neon-http cannot read-then-conditionally-create inside a single batch;
// the gems transaction + balance update are still written inside the same atomic
// batch as the booking and invoice. Returns the updated booking and created
// invoice, or null when the booking does not exist.
export async function completeBookingWithInvoice(params: {
  bookingId: string
  changedById: string
  invoice: CompleteBookingInvoice
  items: Omit<NewInvoiceItem, 'invoiceId'>[]
}) {
  const { bookingId, changedById, invoice: inv, items } = params
  const redemption = inv.gemsRedemption ?? null

  const rows = await db
    .select({ status: booking.status })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1)
  const current = rows[0]
  if (!current) {
    return null
  }

  const now = new Date()
  const invoiceId = nanoid()

  // Resolve the loyalty account up-front (read + lazy create) so the gems credit
  // AND/OR the guarded redemption deduction can join the atomic batch below. Only
  // needed when gems are earned or redeemed on this booking.
  const loyaltyAccountId =
    inv.gemsEarned > 0 || redemption ? (await getOrCreateLoyaltyAccount(inv.customerId)).id : null

  const invoiceValues: NewInvoice = {
    id: invoiceId,
    invoiceNumber: inv.invoiceNumber,
    branchId: inv.branchId,
    bookingId,
    customerId: inv.customerId,
    subtotalPaise: inv.subtotalPaise,
    discountAmountPaise: inv.discountAmountPaise ?? 0,
    taxableValuePaise: inv.taxableValuePaise,
    gstAmountPaise: inv.gstAmountPaise,
    totalAmountPaise: inv.totalAmountPaise,
    invoiceType: inv.invoiceType ?? 'service',
    paymentMethod: inv.paymentMethod,
    paymentStatus: 'paid',
    gemsEarned: inv.gemsEarned,
    // Stamp the redemption onto the invoice (persist the redeemed amount + which
    // service it covered). Zero / null when no redemption took place.
    gemsRedeemed: redemption?.gemsRequired ?? 0,
    gemsRedeemedServiceId: redemption?.serviceId ?? null,
    paidAt: now,
  }

  const updateBookingStmt = db
    .update(booking)
    .set({ status: 'completed', completedAt: now })
    .where(eq(booking.id, bookingId))
    .returning()

  const insertInvoiceStmt = db.insert(invoice).values(invoiceValues).returning()

  const logStmt = db.insert(bookingStatusLog).values({
    bookingId,
    fromStatus: current.status,
    toStatus: 'completed',
    changedById,
    notes: `Completed — invoice ${inv.invoiceNumber}`,
  })

  // Assemble the atomic batch. Order: [booking update, invoice insert, (items),
  // (guarded gems redemption deduction + redeemed tx), (earned gems tx + credit),
  // status log]. Only the first two carry `.returning()`, so they sit at fixed
  // indices 0 and 1.
  const statements: BatchItem<'pg'>[] = [updateBookingStmt, insertInvoiceStmt]

  if (items.length > 0) {
    const itemValues: NewInvoiceItem[] = items.map((item) => ({ ...item, invoiceId }))
    statements.push(db.insert(invoiceItem).values(itemValues))
  }

  // Guarded gems redemption (Req: atomic deduction). Mirrors the guarded-CTE
  // semantics of redeemServiceWithGems: the UPDATE only deducts when the balance
  // still covers the cost; the trailing `1 / count(*)` over the guard CTE divides
  // by zero (SQLSTATE 22012) when the guard matched 0 rows, which aborts the
  // ENTIRE batch transaction so nothing — booking, invoice, items, gems — is
  // persisted. `count(*)` is a runtime aggregate (never constant-folded), so the
  // abort fires only on a real insufficient-balance race. The deduction runs
  // BEFORE the earned-gems credit below so gems earned on THIS booking can never
  // fund its own redemption.
  if (loyaltyAccountId && redemption) {
    statements.push(
      db.execute(sql`
        WITH guard AS (
          UPDATE loyalty_account
             SET gems_balance        = gems_balance - ${redemption.gemsRequired},
                 total_gems_redeemed = total_gems_redeemed + ${redemption.gemsRequired},
                 updated_at          = now()
           WHERE id = ${loyaltyAccountId}
             AND gems_balance >= ${redemption.gemsRequired}
          RETURNING id
        )
        SELECT 1 / count(*)::int AS ok FROM guard
      `),
    )
    statements.push(
      db.insert(loyaltyTransaction).values({
        loyaltyAccountId,
        type: 'redeemed',
        gemsAmount: redemption.gemsRequired,
        invoiceId,
        bookingId,
        description: `Redeemed on invoice ${inv.invoiceNumber}`,
      }),
    )
  }

  if (loyaltyAccountId && inv.gemsEarned > 0) {
    const expiresAt = new Date(now.getTime() + LOYALTY_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    statements.push(
      db.insert(loyaltyTransaction).values({
        loyaltyAccountId,
        type: 'earned',
        gemsAmount: inv.gemsEarned,
        invoiceId,
        description: `Earned on invoice ${inv.invoiceNumber}`,
        expiresAt,
      }),
    )
    statements.push(
      db
        .update(loyaltyAccount)
        .set({
          gemsBalance: sql`${loyaltyAccount.gemsBalance} + ${inv.gemsEarned}`,
          totalGemsEarned: sql`${loyaltyAccount.totalGemsEarned} + ${inv.gemsEarned}`,
        })
        .where(eq(loyaltyAccount.id, loyaltyAccountId)),
    )
  }

  statements.push(logStmt)

  let results: unknown[]
  try {
    results = await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (error) {
    // The guarded redemption deduction aborted the transaction because the
    // balance raced below the cost (0-row guard → division by zero). The whole
    // batch rolled back — booking, invoice, items and gems all un-persisted —
    // preserving the all-or-nothing guarantee. Surface as a clean 409.
    if (redemption && isInsufficientBalanceAbort(error)) {
      throw new AppError({
        code: ERROR_CODES.GEMS_INSUFFICIENT_BALANCE,
        message: 'You do not have enough gems to redeem this service.',
        statusCode: 409,
      })
    }
    throw error
  }

  const updatedBooking = (results[0] as (typeof booking.$inferSelect)[])[0]
  const createdInvoice = (results[1] as (typeof invoice.$inferSelect)[])[0]

  return { booking: updatedBooking, invoice: createdInvoice }
}

// Narrow an unknown driver error to the guard-abort signal raised by the gems
// redemption CTE: a `division_by_zero` (Postgres SQLSTATE 22012) produced by
// `1 / count(*)` when the balance guard matched 0 rows. Neon surfaces the
// SQLSTATE on `.code`; fall back to a message match so the path never leaks a 500.
function isInsufficientBalanceAbort(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const e = error as { code?: unknown; message?: unknown }
  if (e.code === '22012') {
    return true
  }
  return typeof e.message === 'string' && e.message.toLowerCase().includes('division by zero')
}
