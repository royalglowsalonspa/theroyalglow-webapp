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
import type { SettlementSetting } from '@rgss/types'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking, bookingService, bookingStatusLog } from '../schema/booking'
import { branch } from '../schema/branch'
import { invoice } from '../schema/invoice'
import { spaMembership, spaMembershipTier } from '../schema/membership'
import { staffProfile } from '../schema/profile'
import { isBranchAvailabilityRefusal, serviceNoLongerOffered } from './catalogue-availability'
import { refreshCustomerStatsStatement } from './customer-stats'
import { isConstraintViolation, isGuardAbort, SQLSTATE } from './driver-errors'
import { type InvoiceIssue, type InvoiceIssueLine, issueInvoiceStatements } from './invoice-issue'
import { type AssigneeRefusal, assigneeRefusal } from './reassignments'

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
type NewBooking = typeof booking.$inferInsert
type NewBookingService = typeof bookingService.$inferInsert

type MembershipStatus = (typeof spaMembership.$inferSelect)['status']

// Membership tiers in display order: the active ones for the sale form, or
// every tier for the tiers screen and the list filter.
export async function getMembershipTiers(options: { includeInactive?: boolean } = {}) {
  return db
    .select()
    .from(spaMembershipTier)
    .where(options.includeInactive ? undefined : eq(spaMembershipTier.isActive, true))
    .orderBy(asc(spaMembershipTier.displayOrder), asc(spaMembershipTier.name))
}

// One tier, active or not, or null.
export async function getMembershipTierById(id: string) {
  const rows = await db
    .select()
    .from(spaMembershipTier)
    .where(eq(spaMembershipTier.id, id))
    .limit(1)
  return rows[0] ?? null
}

type MembershipTierRow = typeof spaMembershipTier.$inferSelect

/** The writable tier fields, as stored (hours as minutes). */
export type MembershipTierValues = {
  name: string
  defaultHoursMinutes: number
  defaultPricePaise: number
  defaultValidityDays: number
  sacCode: string
  isActive: boolean
  displayOrder: number
}

const TIER_NAME_UNIQUE = 'spa_membership_tier_name_unique'
const TIER_SLUG_UNIQUE = 'spa_membership_tier_slug_unique'

function duplicateTierName(name: string) {
  return conflict(ERROR_CODES.CONFLICT, `A tier called ${name} already exists.`)
}

// Create a tier. A slug another name already uses gets a short suffix; a name
// that already exists is a 409.
export async function createMembershipTier(
  values: MembershipTierValues & { slug: string },
): Promise<MembershipTierRow> {
  for (const slug of [values.slug, `${values.slug}-${nanoid(4).toLowerCase()}`]) {
    try {
      const [created] = await db
        .insert(spaMembershipTier)
        .values({ ...values, slug })
        .returning()
      return created as MembershipTierRow
    } catch (error) {
      if (isConstraintViolation(error, SQLSTATE.uniqueViolation, [TIER_NAME_UNIQUE])) {
        throw duplicateTierName(values.name)
      }
      if (!isConstraintViolation(error, SQLSTATE.uniqueViolation, [TIER_SLUG_UNIQUE])) {
        throw error
      }
    }
  }
  throw duplicateTierName(values.name)
}

// Change a tier's fields; later sales use them, existing memberships keep
// their own values (R9.4). Null when there is no such tier.
export async function updateMembershipTier(
  id: string,
  patch: Partial<MembershipTierValues>,
): Promise<MembershipTierRow | null> {
  try {
    const [updated] = await db
      .update(spaMembershipTier)
      .set(patch)
      .where(eq(spaMembershipTier.id, id))
      .returning()
    return updated ?? null
  } catch (error) {
    if (patch.name && isConstraintViolation(error, SQLSTATE.uniqueViolation, [TIER_NAME_UNIQUE])) {
      throw duplicateTierName(patch.name)
    }
    throw error
  }
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

/** A membership as its customer sees it: no tier and no usual price (R9.1, MS-17). */
export type OwnMembership = {
  id: string
  membershipNumber: string
  totalHoursMinutes: number
  usedHoursMinutes: number
  /** Held by sessions booked or in progress; free = total − used − reserved. */
  reservedMinutes: number
  pricePaidPaise: number
  startsAt: Date
  expiresAt: Date
  status: MembershipStatus
  /** Where it was bought; the hours can be used at any branch. */
  sellingBranchName: string | null
}

// The customer's own memberships, split into the single active one (if any)
// and past ones (expired or cancelled), newest first. Only the columns a
// customer may see are read.
export async function getOwnMemberships(
  customerId: string,
): Promise<{ active: OwnMembership | null; past: OwnMembership[] }> {
  const rows = await db
    .select({
      id: spaMembership.id,
      membershipNumber: spaMembership.membershipNumber,
      totalHoursMinutes: spaMembership.totalHoursMinutes,
      usedHoursMinutes: spaMembership.usedHoursMinutes,
      reservedMinutes: spaMembership.reservedMinutes,
      pricePaidPaise: spaMembership.pricePaidPaise,
      startsAt: spaMembership.startsAt,
      expiresAt: spaMembership.expiresAt,
      status: spaMembership.status,
      sellingBranchName: branch.name,
    })
    .from(spaMembership)
    .leftJoin(branch, eq(branch.id, sellingBranchIdSql))
    .where(eq(spaMembership.customerId, customerId))
    .orderBy(desc(spaMembership.createdAt), desc(spaMembership.id))

  return {
    active: rows.find((m) => m.status === 'active') ?? null,
    past: rows.filter((m) => m.status !== 'active'),
  }
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

// The sessions that count against a membership's minutes, newest first: those
// completed (their minutes consumed) and those booked or in progress (their
// minutes held, 0026). Each comes with the name of the branch that performs it
// (any branch: the hours are shared), its status and its booking_service
// snapshot rows (service name, duration, staff name). Cancelled, rejected,
// no-show and rescheduled sessions released their minutes and are left out.
const MEMBERSHIP_SESSION_STATUSES = ['confirmed', 'in_progress', 'completed'] as const

export async function getMembershipSessions(membershipId: string) {
  const rows = await db
    .select({ session: booking, branchName: branch.name })
    .from(booking)
    .innerJoin(branch, eq(branch.id, booking.branchId))
    .where(
      and(
        eq(booking.spaMembershipId, membershipId),
        inArray(booking.status, [...MEMBERSHIP_SESSION_STATUSES]),
      ),
    )
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
  /**
   * The purchase invoice: amounts, tax point, financial year and review
   * status, computed by @rgss/business (prepareInvoiceTax).
   */
  invoice: Omit<
    InvoiceIssue,
    'id' | 'branchId' | 'bookingId' | 'customerId' | 'invoiceType' | 'gemsEarned'
  >
  /**
   * Its one line. The name the customer reads gives the hours and expiry,
   * never the tier (R9.1).
   */
  invoiceLine: Omit<InvoiceIssueLine, 'serviceId' | 'staffNameSnapshot' | 'displayOrder'>
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

  // The selling branch issues the purchase invoice: its next number, its
  // issuer snapshot, the line's tax facts (multi-branch R6). No gems.
  const { counter, insertInvoice, insertLines } = issueInvoiceStatements(
    {
      ...params.invoice,
      id: invoiceId,
      branchId: params.branchId,
      bookingId: null,
      customerId: params.customerId,
      invoiceType: 'membership_purchase',
      gemsEarned: 0,
    },
    [{ ...params.invoiceLine, serviceId: null, staffNameSnapshot: null, displayOrder: 0 }],
  )

  // The paid purchase invoice counts toward the customer's LTV, so the CRM KPI
  // recompute runs last in the same atomic batch (see customer-stats.ts).
  const statements: [BatchItem<'pg'>, ...BatchItem<'pg'>[]] = [
    db.insert(spaMembership).values(membershipValues).returning(),
    counter,
    insertInvoice,
  ]
  if (insertLines) {
    statements.push(insertLines)
  }
  statements.push(refreshCustomerStatsStatement(params.customerId))
  const results = await db.batch(statements)

  return {
    membership: (
      results[0] as (typeof spaMembership.$inferSelect)[]
    )[0] as typeof spaMembership.$inferSelect,
    invoice: (results[2] as (typeof invoice.$inferSelect)[])[0] as typeof invoice.$inferSelect,
  }
}

type SessionServiceInput = {
  serviceId: string
  staffId?: string | null
  serviceNameSnapshot: string
  staffNameSnapshot?: string | null
  durationMinutes: number
}

/** A session line's tax facts at ₹0: its SAC code and the rate in force (TX-07). */
type SessionLineTax = Pick<InvoiceIssueLine, 'sacCode' | 'taxVersionId' | 'rateBps'>

type RecordMembershipSessionParams = {
  membershipId: string
  bookingNumber: string
  branchId: string
  customerId: string
  bookingDate: Date
  startTime: string
  endTime: string
  notes?: string | null
  services: SessionServiceInput[]
  // Client idempotency key. With it, a retried request can never start the
  // session twice; see getMembershipSessionByKey for the replay side.
  idempotencyKey?: string | null
  /** Who recorded the session; on its status log. */
  recordedById: string
  /**
   * 'now' (default): "Record now", in progress from now. 'ahead': booked for
   * its planned date and times, confirmed; it starts from its booking.
   */
  when?: 'now' | 'ahead'
  /** The branch settings revision that accepted a session booked ahead. */
  settingsRevision?: number | null
}

export type RecordMembershipSessionResult =
  | {
      ok: true
      booking: typeof booking.$inferSelect
      // Read in the same transaction, after this session's hold.
      remainingMinutes: number
    }
  // When the write ran, the membership was not active, had expired, or no
  // longer had the minutes free. Nothing was written.
  | { ok: false; reason: 'unavailable' }
  // An earlier request already used this idempotency key. Nothing was written.
  | { ok: false; reason: 'duplicate_key' }
  // The database refused the assignee (0014, 0028). Nothing was written.
  | { ok: false; reason: 'staff'; refusal: AssigneeRefusal }

// The session idempotency key lives in booking.redemption_key, whose partial
// unique index (booking_redemption_key_uidx) already de-dupes gems
// redemptions. The prefix keeps the two key spaces apart, and replay lookups
// also require a session of the same membership, so a key from anywhere else
// never resolves to a session.
const SESSION_KEY_PREFIX = 'msess:'
const REDEMPTION_KEY_INDEX = 'booking_redemption_key_uidx'
// What the database refuses a new hold with (0025, 0026): too few minutes
// free, or a membership that can't be used at the session's start.
const HOLD_REFUSALS = ['spa_membership_reserved_check', 'membership_hold_validity'] as const

function sessionKey(idempotencyKey: string): string {
  return `${SESSION_KEY_PREFIX}${idempotencyKey}`
}

/** Minutes free on a membership: purchased, less consumed, less held. */
function freeMinutes(m: { total: number; used: number; reserved: number } | undefined): number {
  return m ? m.total - m.used - m.reserved : 0
}

const balanceColumns = {
  total: spaMembership.totalHoursMinutes,
  used: spaMembership.usedHoursMinutes,
  reserved: spaMembership.reservedMinutes,
}

// "Record now": start a membership session at the delivering branch, in one
// transaction. The booking goes in as in progress, started now; the database
// holds its minutes from the membership when it is written (0026), refusing
// a membership that isn't active, isn't valid now or hasn't the minutes free.
// Booked ahead (`when: 'ahead'`), it goes in as confirmed for its planned
// slot instead, and validity is checked at that planned start; it starts later
// from its booking (startBooking), which checks validity again at that instant.
// Concurrent sessions serialize on the membership row and each checks the
// committed balance, so two receptionists can never hold the same minutes
// (MS-01). Completing the session (completeMembershipSession) consumes the
// hold and issues the ₹0 invoice and the settlement entry.
export async function recordMembershipSession(
  params: RecordMembershipSessionParams,
): Promise<RecordMembershipSessionResult> {
  const bookingId = nanoid()
  const now = new Date()
  const totalMinutes = params.services.reduce((sum, s) => sum + s.durationMinutes, 0)
  if (params.services.length === 0) {
    throw new Error('recordMembershipSession: a session has at least one service')
  }
  // Booked ahead, the session is confirmed and starts from its booking; the
  // database holds its minutes and checks validity at its planned start.
  const ahead = params.when === 'ahead'
  const status = ahead ? ('confirmed' as const) : ('in_progress' as const)

  const bookingValues: NewBooking = {
    id: bookingId,
    bookingNumber: params.bookingNumber,
    branchId: params.branchId,
    customerId: params.customerId,
    status,
    serviceType: 'spa',
    bookingDate: params.bookingDate,
    startTime: params.startTime,
    endTime: params.endTime,
    totalAmountPaise: 0,
    totalDurationMinutes: totalMinutes,
    isMembershipSession: true,
    spaMembershipId: params.membershipId,
    confirmedAt: now,
    startedAt: ahead ? null : now,
    settingsRevision: params.settingsRevision ?? null,
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

  const results = await db
    .batch([
      // The hold is written with the booking; a reused idempotency key fails
      // on its unique index first, so a retry is a replay, not "no hours left".
      db.insert(booking).values(bookingValues).returning(),
      db.insert(bookingService).values(bookingServiceValues),
      db.insert(bookingStatusLog).values({
        bookingId,
        fromStatus: null,
        toStatus: status,
        changedById: params.recordedById,
        notes: ahead
          ? 'Membership session booked ahead'
          : 'Membership session recorded as starting now',
        settingsRevision: params.settingsRevision ?? null,
      }),
      // Same transaction, after the hold: the minutes this session leaves free.
      db
        .select(balanceColumns)
        .from(spaMembership)
        .where(eq(spaMembership.id, params.membershipId)),
    ])
    .catch((error: unknown) => {
      // A service stopped being offered at the branch after the route
      // checked (0034). Nothing was written.
      if (isBranchAvailabilityRefusal(error)) {
        throw serviceNoLongerOffered()
      }
      if (isConstraintViolation(error, SQLSTATE.checkViolation, HOLD_REFUSALS)) {
        return 'unavailable' as const
      }
      if (isConstraintViolation(error, SQLSTATE.uniqueViolation, [REDEMPTION_KEY_INDEX])) {
        return 'duplicate_key' as const
      }
      // The assignee can't take it now: left the branch, on leave, booked
      // then or still with another customer (0014, 0028).
      const refusal = assigneeRefusal(error)
      if (refusal) {
        return { refusal }
      }
      throw error
    })

  if (results === 'unavailable') {
    return { ok: false, reason: 'unavailable' }
  }
  if (results === 'duplicate_key') {
    return { ok: false, reason: 'duplicate_key' }
  }
  if ('refusal' in results) {
    return { ok: false, reason: 'staff', refusal: results.refusal }
  }

  return {
    ok: true,
    booking: results[0][0] as typeof booking.$inferSelect,
    remainingMinutes: freeMinutes(results[3][0]),
  }
}

type CompleteMembershipSessionParams = {
  bookingId: string
  /** The delivering branch, which issues the session invoice. */
  branchId: string
  changedById: string
  /**
   * The ₹0 session invoice's issue facts. Each line records its service's SAC
   * code and the rate in force, so a zero value is never read as exempt.
   */
  invoice: Pick<InvoiceIssue, 'taxPointAt' | 'financialYear' | 'taxReviewStatus'> & {
    lineTax: SessionLineTax[]
  }
  /** The booking's lines, in display order, with the names to snapshot. */
  lines: { serviceId: string; serviceNameSnapshot: string; staffNameSnapshot: string | null }[]
  /**
   * The Developer's settlement share, stored on the session's settlement
   * entry (R10): what the selling branch owes the delivering branch.
   */
  settlement: Pick<SettlementSetting, 'shareBps'>
}

export type CompleteMembershipSessionResult =
  | {
      ok: true
      booking: typeof booking.$inferSelect
      invoice: typeof invoice.$inferSelect
      remainingMinutes: number
    }
  // The booking wasn't an in-progress membership session at the branch when
  // the write ran (already completed, or never started). Nothing was written.
  | { ok: false; reason: 'not_in_progress' }

// Complete a membership session in one transaction (MS-02): the booking moves
// from in progress to completed, which consumes its hold (0026 trigger); the
// ₹0 membership_session invoice is issued by the delivering branch with each
// line's SAC code and rate (TX-07); and the settlement entry records what the
// selling branch owes for the session (MS-20 to MS-23).
//
// The status move is guarded: when the booking isn't in progress any more,
// `1 / count(*)` divides by zero and nothing is written, so a double submit
// or a retry with another key completes nothing twice. The consumption locks
// the membership row until commit, so the entry's "minutes used before" is
// exact even when two sessions of one membership finish together: its value
// is floor(P(c+n)/T) − floor(Pc/T) on the price paid, and the same on the
// purchase invoice's GST for the GST share (TX-12), in 64-bit integers. A
// session at the selling branch is an internal entry. Mirrors
// membershipSessionValue in @rgss/business.
export async function completeMembershipSession(
  params: CompleteMembershipSessionParams,
): Promise<CompleteMembershipSessionResult> {
  const { bookingId, branchId } = params
  const invoiceId = nanoid()
  if (params.invoice.lineTax.length !== params.lines.length) {
    throw new Error('completeMembershipSession: one line tax per service')
  }

  const complete = db.execute(sql`
    WITH done AS (
      UPDATE booking
         SET status = 'completed', completed_at = now(), updated_at = now()
       WHERE id = ${bookingId}
         AND branch_id = ${branchId}
         AND is_membership_session
         AND status = 'in_progress'
      RETURNING id
    )
    SELECT 1 / count(*)::int AS ok FROM done
  `)

  const customer = await db
    .select({ customerId: booking.customerId })
    .from(booking)
    .where(and(eq(booking.id, bookingId), eq(booking.branchId, branchId)))
    .limit(1)
  const customerId = customer[0]?.customerId
  if (!customerId) {
    return { ok: false, reason: 'not_in_progress' }
  }

  const { counter, insertInvoice, insertLines } = issueInvoiceStatements(
    {
      id: invoiceId,
      branchId,
      bookingId,
      customerId,
      invoiceType: 'membership_session',
      paymentMethod: 'cash',
      subtotalPaise: 0,
      discountAmountPaise: 0,
      taxableValuePaise: 0,
      gstAmountPaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      totalAmountPaise: 0,
      gemsEarned: 0,
      taxPointAt: params.invoice.taxPointAt,
      financialYear: params.invoice.financialYear,
      taxReviewStatus: params.invoice.taxReviewStatus,
    },
    params.lines.map((line, index) => {
      const tax = params.invoice.lineTax[index] as SessionLineTax
      return {
        serviceId: line.serviceId,
        serviceNameSnapshot: line.serviceNameSnapshot,
        staffNameSnapshot: line.staffNameSnapshot,
        quantity: 1,
        unitPricePaise: 0,
        totalPricePaise: 0,
        displayOrder: index,
        ...tax,
        discountPaise: 0,
        taxableValuePaise: 0,
        taxPaise: 0,
        cgstPaise: 0,
        sgstPaise: 0,
      }
    }),
  )
  if (!insertLines) {
    throw new Error('completeMembershipSession: a session has at least one service')
  }

  const entry = db.execute(sql`
    WITH held AS (
      SELECT h.spa_membership_id AS membership_id, h.branch_id, h.minutes,
             m.used_hours_minutes AS used, m.total_hours_minutes AS total,
             m.price_paid_paise::bigint AS price, m.invoice_id,
             coalesce(m.selling_branch_id,
                      (SELECT i.branch_id FROM invoice i WHERE i.id = m.invoice_id),
                      h.branch_id) AS selling_branch_id
        FROM membership_hold h
        JOIN spa_membership m ON m.id = h.spa_membership_id
       WHERE h.booking_id = ${bookingId}
         AND h.state = 'consumed'
    ),
    valued AS (
      SELECT x.*,
             (x.price * x.used) / x.total - (x.price * (x.used - x.minutes)) / x.total AS value,
             (p.gst * x.used) / x.total - (p.gst * (x.used - x.minutes)) / x.total AS gst
        FROM held x
       CROSS JOIN LATERAL (
         SELECT coalesce((SELECT i.gst_amount_paise FROM invoice i WHERE i.id = x.invoice_id),
                         0)::bigint AS gst
       ) p
    )
    INSERT INTO settlement_entry
      (kind, owing_branch_id, owed_branch_id, spa_membership_id, booking_id, minutes,
       value_paise, gst_share_paise, amount_owed_paise, share_bps, created_by)
    SELECT 'membership_session', v.selling_branch_id, v.branch_id, v.membership_id, ${bookingId},
           v.minutes, v.value, v.gst,
           ((v.value - v.gst) * ${params.settlement.shareBps}::int) / 10000,
           ${params.settlement.shareBps}::int, ${params.changedById}
      FROM valued v
  `)

  const results = await db
    .batch([
      complete,
      db.insert(bookingStatusLog).values({
        bookingId,
        fromStatus: 'in_progress',
        toStatus: 'completed',
        changedById: params.changedById,
        notes: 'Membership session completed',
      }),
      counter,
      insertInvoice,
      insertLines,
      entry,
      // A completed session is a visit: recompute the CRM KPIs after it.
      refreshCustomerStatsStatement(customerId),
      db.select().from(booking).where(eq(booking.id, bookingId)),
      db
        .select(balanceColumns)
        .from(spaMembership)
        .where(
          sql`${spaMembership.id} = (select ${booking.spaMembershipId} from ${booking} where ${booking.id} = ${bookingId})`,
        ),
    ])
    .catch((error: unknown) => {
      if (isGuardAbort(error)) {
        return 'not_in_progress' as const
      }
      throw error
    })

  if (results === 'not_in_progress') {
    return { ok: false, reason: 'not_in_progress' }
  }

  // [complete, log, counter, invoice, lines, entry, KPIs, booking, balance]
  return {
    ok: true,
    booking: (results[7] as (typeof booking.$inferSelect)[])[0] as typeof booking.$inferSelect,
    invoice: (results[3] as (typeof invoice.$inferSelect)[])[0] as typeof invoice.$inferSelect,
    remainingMinutes: freeMinutes(
      (results[8] as { total: number; used: number; reserved: number }[])[0],
    ),
  }
}

// The session that an earlier request recorded on this membership with this
// idempotency key, with what a replay needs: the booking, its invoice once it
// has completed, its service lines (so the caller can check the retry asks
// for the same session) and the minutes the membership has free now. Null
// when the key has not recorded a session on this membership.
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
      .select(balanceColumns)
      .from(spaMembership)
      .where(eq(spaMembership.id, membershipId))
      .limit(1),
  ])

  return {
    booking: found,
    invoice: invoices[0] ?? null,
    services,
    remainingMinutes: freeMinutes(balances[0]),
  }
}

// Cancel an active membership sold at `sellingBranchId`, appending the reason
// to its notes, in one transaction (MS-13). Its sessions still to happen are
// cancelled first, which gives their minutes back (0026), each with a status
// log entry by the person cancelling. A session in progress blocks the
// cancellation: the database refuses to cancel a membership whose minutes are
// still held. When the membership isn't active (any more) or wasn't sold
// there, nothing changes, so two concurrent cancellations, or a cancellation
// racing expiry, apply once.
export type CancelMembershipResult =
  | {
      ok: true
      membership: { id: string; status: MembershipStatus }
      /** Sessions still to happen that were cancelled with it. */
      cancelledSessions: number
    }
  | { ok: false; reason: 'not_active' | 'session_in_progress' }

const SESSION_CANCELLED = 'The membership was cancelled'

export async function cancelMembership(params: {
  id: string
  sellingBranchId: string
  reason: string
  actorId: string
}): Promise<CancelMembershipResult> {
  const { id, sellingBranchId, reason, actorId } = params

  const sessions = db.execute<{ cancelled: number }>(sql`
    WITH target AS (
      SELECT m.id
        FROM spa_membership m
       WHERE m.id = ${id}
         AND m.status = 'active'
         AND coalesce(m.selling_branch_id,
                      (SELECT i.branch_id FROM invoice i WHERE i.id = m.invoice_id))
             = ${sellingBranchId}
    ),
    unstarted AS (
      SELECT b.id, b.status
        FROM booking b
       WHERE b.spa_membership_id IN (SELECT id FROM target)
         AND b.is_membership_session
         AND b.status IN ('pending', 'confirmed')
         FOR UPDATE
    ),
    cancelled AS (
      UPDATE booking b
         SET status = 'cancelled', cancellation_reason = ${SESSION_CANCELLED},
             cancelled_at = now(), updated_at = now()
        FROM unstarted u
       WHERE b.id = u.id
      RETURNING b.id, u.status AS from_status
    ),
    logged AS (
      INSERT INTO booking_status_log (id, booking_id, from_status, to_status, changed_by_id, notes)
      SELECT gen_random_uuid()::text, c.id, c.from_status, 'cancelled', ${actorId},
             ${SESSION_CANCELLED}
        FROM cancelled c
      RETURNING 1
    )
    SELECT count(*)::int AS cancelled FROM logged
  `)

  const membership = db
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

  const results = await db.batch([sessions, membership]).catch((error: unknown) => {
    if (isConstraintViolation(error, SQLSTATE.checkViolation, ['spa_membership_cancel_holds'])) {
      return 'session_in_progress' as const
    }
    throw error
  })
  if (results === 'session_in_progress') {
    return { ok: false, reason: 'session_in_progress' }
  }

  const [counted, updated] = results
  const cancelled = updated[0]
  if (!cancelled) {
    return { ok: false, reason: 'not_active' }
  }
  return {
    ok: true,
    membership: cancelled,
    cancelledSessions: Number(counted.rows[0]?.cancelled ?? 0),
  }
}
