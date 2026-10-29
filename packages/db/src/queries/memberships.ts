/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : memberships
 * Scope        : Data Access — Memberships
 *
 * Description  : Query functions for SPA membership management including
 *                creation, session recording, and administrative operations.
 *
 * Responsibilities :
 * - Fetch membership tiers, individual memberships, and member sessions
 * - Create membership with purchase invoice atomically
 * - Record membership sessions (booking + invoice + guarded hour deduction)
 * - Resolve a retried session request to the session it already recorded
 * - Enforce one active membership per customer
 * - Cancel memberships with reason tracking
 *
 * Features / Functionality :
 * - Atomic membership + invoice creation via db.batch()
 * - Session recording creates ₹0 booking + ₹0 invoice + deducts hours, and
 *   rolls back whole when the membership is inactive, expired or short of
 *   minutes at write time
 * - Idempotency key per session (booking.redemption_key, prefixed)
 * - Pre-check for existing active membership (throws 409 conflict)
 * - Admin membership list with tier/status filtering
 * - Customer-facing active/past membership split
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, nanoid, @rgss/errors, ../index, ../schema/auth,
 *                ../schema/booking, ../schema/invoice, ../schema/membership,
 *                ../schema/profile
 *
 * Notes        : Membership purchase invoices have no booking (bookingId null)
 *                and earn zero gems. Session bookings are always status 'completed'.
 ************************************************************/

import { conflict, ERROR_CODES } from '@rgss/errors'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking, bookingService } from '../schema/booking'
import { branch } from '../schema/branch'
import { invoice, invoiceItem } from '../schema/invoice'
import { spaMembership, spaMembershipTier } from '../schema/membership'
import { staffProfile } from '../schema/profile'
import { refreshCustomerStatsStatement } from './customer-stats'

// The branch that sold a membership (multi-branch R9, route inventory gap 5).
// A row written before selling_branch_id existed falls back to its purchase
// invoice's branch, which is the same branch: 0007 backfills it that way, and
// this covers rows that older code writes until the column is enforced.
const sellingBranchIdSql = sql<
  string | null
>`coalesce(${spaMembership.sellingBranchId}, (select ${invoice.branchId} from ${invoice} where ${invoice.id} = ${spaMembership.invoiceId}))`

function sellingBranchOf(id: string | null, name: string | null) {
  return id !== null && name !== null ? { id, name } : null
}

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

// A single membership with the owning customer's name/email, its tier and the
// branch that sold it, or null if not found. Session history is fetched
// separately via getMembershipSessions.
export async function getMembershipById(id: string) {
  const rows = await db
    .select({
      membership: spaMembership,
      customerName: user.name,
      customerEmail: user.email,
      tier: spaMembershipTier,
      sellingBranchId: sellingBranchIdSql,
      sellingBranchName: branch.name,
    })
    .from(spaMembership)
    .innerJoin(user, eq(spaMembership.customerId, user.id))
    .innerJoin(spaMembershipTier, eq(spaMembership.tierId, spaMembershipTier.id))
    .leftJoin(branch, eq(branch.id, sellingBranchIdSql))
    .where(eq(spaMembership.id, id))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  return {
    ...found.membership,
    sellingBranchId: found.sellingBranchId,
    sellingBranch: sellingBranchOf(found.sellingBranchId, found.sellingBranchName),
    customerName: found.customerName,
    customerEmail: found.customerEmail,
    tier: found.tier,
  }
}

type MembershipFilters = {
  tier?: string // tier id
  status?: string
}

// Admin membership list, each flattened with the customer name, tier name and
// selling branch, newest first. Memberships are shared by every branch, so
// this lists them all; callers decide who sees what each was sold for.
// Optional filters narrow by tier id and/or status.
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
      sellingBranchId: sellingBranchIdSql,
      sellingBranchName: branch.name,
    })
    .from(spaMembership)
    .innerJoin(user, eq(spaMembership.customerId, user.id))
    .innerJoin(spaMembershipTier, eq(spaMembership.tierId, spaMembershipTier.id))
    .leftJoin(branch, eq(branch.id, sellingBranchIdSql))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(spaMembership.createdAt), desc(spaMembership.id))

  return rows.map((r) => ({
    ...r.membership,
    sellingBranchId: r.sellingBranchId,
    sellingBranch: sellingBranchOf(r.sellingBranchId, r.sellingBranchName),
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
// with the name of the branch that performed it (any branch: the hours are
// shared) and its booking_service snapshot rows (service name, duration, staff
// name).
export async function getMembershipSessions(membershipId: string) {
  const rows = await db
    .select({ session: booking, branchName: branch.name })
    .from(booking)
    .innerJoin(branch, eq(branch.id, booking.branchId))
    .where(and(eq(booking.spaMembershipId, membershipId), eq(booking.status, 'completed')))
    .orderBy(desc(booking.bookingDate), desc(booking.createdAt))
  const bookings = rows.map((r) => ({ ...r.session, branchName: r.branchName }))

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
  /** The tier's usual hours and price at sale time (agreed-versus-usual). */
  tierUsualHoursMinutes: number
  tierUsualPricePaise: number
  totalHoursMinutes: number
  pricePaidPaise: number
  startsAt: Date
  expiresAt: Date
  createdBy: string
  notes?: string | null
  /** The selling branch: it issues the purchase invoice. */
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
    tierUsualHoursMinutes: params.tierUsualHoursMinutes,
    tierUsualPricePaise: params.tierUsualPricePaise,
    // The same branch as the purchase invoice, by construction.
    sellingBranchId: params.branchId,
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

  // The paid purchase invoice counts toward the customer's LTV, so the CRM KPI
  // recompute runs last in the same atomic batch (see customer-stats.ts).
  const results = await db.batch([
    db.insert(spaMembership).values(membershipValues).returning(),
    db.insert(invoice).values(invoiceValues).returning(),
    db.insert(invoiceItem).values(invoiceItemValues),
    refreshCustomerStatsStatement(params.customerId),
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
  // Client idempotency key. With it, a retried request can never record the
  // session twice; see getMembershipSessionByKey for the replay side.
  idempotencyKey?: string | null
}

export type RecordMembershipSessionResult =
  | {
      ok: true
      booking: typeof booking.$inferSelect
      invoice: typeof invoice.$inferSelect
      // Read in the same transaction, after this session's deduction.
      remainingMinutes: number
    }
  // When the write ran, the membership was not active, had expired or no
  // longer had the minutes. Nothing was written.
  | { ok: false; reason: 'unavailable' }
  // An earlier request already used this idempotency key. Nothing was written.
  | { ok: false; reason: 'duplicate_key' }

// The session idempotency key lives in booking.redemption_key, whose partial
// unique index (booking_redemption_key_uidx) already de-dupes gems
// redemptions. The prefix keeps the two key spaces apart, and replay lookups
// also require a session of the same membership, so a key from anywhere else
// never resolves to a session.
const SESSION_KEY_PREFIX = 'msess:'
const REDEMPTION_KEY_INDEX = 'booking_redemption_key_uidx'
// Postgres SQLSTATEs: division_by_zero (raised by the balance guard) and
// unique_violation.
const DIVISION_BY_ZERO = '22012'
const UNIQUE_VIOLATION = '23505'
// How far down an error's `cause` chain to look; bounded so a cycle can't hang.
const MAX_CAUSE_DEPTH = 5

function sessionKey(idempotencyKey: string): string {
  return `${SESSION_KEY_PREFIX}${idempotencyKey}`
}

type DriverErrorLike = { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown }

// The first error in the (bounded) `cause` chain carrying `sqlState`. A
// neon-http batch surfaces the driver error directly; Drizzle may wrap it.
function findDriverError(error: unknown, sqlState: string): DriverErrorLike | null {
  let current: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return null
    }
    const e = current as DriverErrorLike
    if (e.code === sqlState) {
      return e
    }
    current = e.cause
  }
  return null
}

// The balance guard below is the only statement in the session batch that
// divides, so a division_by_zero means it matched no row. Like the other guard
// predicates, fall back to the message when a wrapper drops the SQLSTATE.
function isBalanceGuardAbort(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return false
    }
    const e = current as DriverErrorLike
    if (e.code === DIVISION_BY_ZERO) {
      return true
    }
    if (typeof e.message === 'string' && e.message.toLowerCase().includes('division by zero')) {
      return true
    }
    current = e.cause
  }
  return false
}

function isSessionKeyConflict(error: unknown): boolean {
  const e = findDriverError(error, UNIQUE_VIOLATION)
  if (!e) {
    return false
  }
  if (typeof e.constraint === 'string') {
    return e.constraint === REDEMPTION_KEY_INDEX
  }
  return typeof e.message === 'string' && e.message.includes(REDEMPTION_KEY_INDEX)
}

// Record a membership session atomically via db.batch() (one transaction): a
// completed ₹0 booking flagged as a membership session, its booking_service
// snapshot rows, the guarded deduction of the membership's minutes, and a
// membership_session invoice (₹0, zero gems) with its invoice_item rows.
// Booking and invoice ids are pre-generated so children reference them within
// the same batch.
//
// The deduction is guarded in the write itself: it only matches while the
// membership is active, unexpired and still has the minutes, and when it
// matches no row the whole batch rolls back. Concurrent requests serialize on
// the membership row lock, and each re-checks the guard against the committed
// balance, so two receptionists can never spend the same hours. Any read the
// caller did beforehand is advisory.
export async function recordMembershipSession(
  params: RecordMembershipSessionParams,
): Promise<RecordMembershipSessionResult> {
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
    redemptionKey: params.idempotencyKey ? sessionKey(params.idempotencyKey) : null,
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

  // The balance guard. When the UPDATE matches no row, `1 / count(*)` divides
  // by zero (SQLSTATE 22012) and the whole batch rolls back, so no booking or
  // invoice is ever left without its deduction. `count(*)` is a runtime
  // aggregate, so the abort fires only when the guard really failed.
  const spendMinutes = db.execute(sql`
    WITH guard AS (
      UPDATE spa_membership
         SET used_hours_minutes = used_hours_minutes + ${totalMinutes},
             updated_at         = now()
       WHERE id = ${params.membershipId}
         AND status = 'active'
         AND expires_at >= now()
         AND used_hours_minutes + ${totalMinutes} <= total_hours_minutes
      RETURNING id
    )
    SELECT 1 / count(*)::int AS ok FROM guard
  `)

  const results = await db
    .batch([
      // First, so a reused idempotency key fails on its unique index even when
      // the minutes are already spent: a retry is a replay, not "no hours left".
      db.insert(booking).values(bookingValues).returning(),
      db.insert(bookingService).values(bookingServiceValues),
      spendMinutes,
      // Same transaction, after the guard: the balance this session leaves.
      db
        .select({
          total: spaMembership.totalHoursMinutes,
          used: spaMembership.usedHoursMinutes,
        })
        .from(spaMembership)
        .where(eq(spaMembership.id, params.membershipId)),
      db.insert(invoice).values(invoiceValues).returning(),
      db.insert(invoiceItem).values(invoiceItemValues),
      // A session is a completed booking, i.e. a visit: recompute the CRM KPIs
      // last so they see it (see customer-stats.ts).
      refreshCustomerStatsStatement(params.customerId),
    ])
    .catch((error: unknown) => {
      if (isBalanceGuardAbort(error)) {
        return 'unavailable' as const
      }
      if (isSessionKeyConflict(error)) {
        return 'duplicate_key' as const
      }
      throw error
    })

  if (results === 'unavailable') {
    return { ok: false, reason: 'unavailable' }
  }
  if (results === 'duplicate_key') {
    return { ok: false, reason: 'duplicate_key' }
  }

  const balance = results[3][0]
  return {
    ok: true,
    booking: results[0][0] as typeof booking.$inferSelect,
    invoice: results[4][0] as typeof invoice.$inferSelect,
    remainingMinutes: balance ? balance.total - balance.used : 0,
  }
}

// The session that an earlier request recorded on this membership with this
// idempotency key, with what a replay needs: the booking, its invoice, its
// service lines (so the caller can check the retry asks for the same session)
// and the membership's current balance. Null when the key has not recorded a
// session on this membership.
export async function getMembershipSessionByKey(membershipId: string, idempotencyKey: string) {
  const rows = await db
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.redemptionKey, sessionKey(idempotencyKey)),
        eq(booking.spaMembershipId, membershipId),
        eq(booking.isMembershipSession, true),
      ),
    )
    .limit(1)
  const found = rows[0]
  if (!found) {
    return null
  }

  const [services, invoices, balances] = await Promise.all([
    db
      .select({
        serviceId: bookingService.serviceId,
        durationMinutes: bookingService.durationMinutes,
        staffId: bookingService.staffId,
      })
      .from(bookingService)
      .where(eq(bookingService.bookingId, found.id))
      .orderBy(asc(bookingService.displayOrder)),
    db.select().from(invoice).where(eq(invoice.bookingId, found.id)).limit(1),
    db
      .select({
        total: spaMembership.totalHoursMinutes,
        used: spaMembership.usedHoursMinutes,
      })
      .from(spaMembership)
      .where(eq(spaMembership.id, membershipId))
      .limit(1),
  ])

  const balance = balances[0]
  return {
    booking: found,
    invoice: invoices[0] ?? null,
    services,
    remainingMinutes: balance ? balance.total - balance.used : 0,
  }
}

// Cancel an active membership sold at `sellingBranchId`, appending the reason
// to its notes. One guarded statement: when the membership isn't active (any
// more) or wasn't sold there, it changes nothing and returns null, so two
// concurrent cancellations, or a cancellation racing expiry, apply once.
export async function cancelMembership(id: string, sellingBranchId: string, reason: string) {
  const [updated] = await db
    .update(spaMembership)
    .set({
      status: 'cancelled',
      notes: sql`coalesce(${spaMembership.notes} || chr(10), '') || ${`Cancelled: ${reason}`}`,
    })
    .where(
      and(
        eq(spaMembership.id, id),
        eq(spaMembership.status, 'active'),
        sql`${sellingBranchIdSql} = ${sellingBranchId}`,
      ),
    )
    .returning({ id: spaMembership.id, status: spaMembership.status })

  return updated ?? null
}
