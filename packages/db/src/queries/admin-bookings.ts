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
 * - List one branch's bookings with filters (status, serviceType, date)
 * - Fetch single booking detail at a branch with customer info and services
 * - Issue the service invoice on completion (number, issuer, per-line tax)
 * - Approve / reject / (re)assign bookings with status-log audit entries
 * - Mark a confirmed booking as a no-show
 * - Start a confirmed booking: in progress from the database's clock
 * - Complete a booking atomically: status → completed + service invoice (GST
 *   split) + invoice items + gems credit + status log, in one db.batch()
 *
 * Features / Functionality :
 * - Every read and write names the branch with the booking id, so a booking
 *   at another branch reads as not found (multi-branch R2.3)
 * - Filtered admin booking list with customer names
 * - Completion guarded on the booking's status, one invoice per booking
 * - Gems spent at checkout come from the earliest-expiring batches; gems
 *   spent on the booking record what the issuing branch owes (R10)
 * - A rejected or missed booking gives back the gems it was booked with
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

import { AppError, conflict, ERROR_CODES } from '@rgss/errors'
import type { SettlementSetting } from '@rgss/types'
import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking, bookingService, bookingStatusLog } from '../schema/booking'
import { branch } from '../schema/branch'
import type { invoice } from '../schema/invoice'
import { loyaltyAccount, loyaltyTransaction } from '../schema/loyalty'
import { staffProfile } from '../schema/profile'
import { refreshCustomerStatsStatement } from './customer-stats'
import { isConstraintViolation, isGuardAbort, SQLSTATE } from './driver-errors'
import {
  allocateRedemption,
  gemsSettlementEntries,
  isGemsShortfall,
  returnGemsOfEndedRedemptions,
} from './gems-ledger'
import {
  type InvoiceIssue,
  type InvoiceIssueLine,
  invoiceNumberOf,
  isDuplicateBookingInvoice,
  issueInvoiceStatements,
} from './invoice-issue'
import { getOrCreateLoyaltyAccount } from './loyalty'
import {
  assigneeRefusal,
  assigneeRefusalMessage,
  getOpenReassignmentsFor,
  resolveReassignmentStatement,
} from './reassignments'

type BookingStatus = (typeof booking.$inferSelect)['status']
type ServiceType = (typeof booking.$inferSelect)['serviceType']

// Gems earned on a service invoice expire 365 days from the earn date
// (auto-swept by QStash gems-auto-expire job). Mirrors the loyalty-domain expiry constant.
const LOYALTY_EXPIRY_DAYS = 365

type BookingFilters = {
  status?: string
  serviceType?: string
  date?: string // YYYY-MM-DD
}

// A booking at one branch: every admin read and write names the branch with the
// id, so a booking at another branch reads as not found (multi-branch R2.3).
function atBranch(id: string, branchId: string) {
  return and(eq(booking.id, id), eq(booking.branchId, branchId))
}

// Cross-customer admin booking listing for one branch (Requirements 10.2–10.5,
// multi-branch R2.3). Returns the branch's bookings — newest first — with the
// owning customer's name/email, its booking_service rows (each carrying the
// assigned staff member's name, or null when none is assigned yet), and the
// booking status. The optional status, date, and service-type filters are
// applied conditionally as parameterized equality predicates in the WHERE
// clause; an absent filter widens the result within the branch.
export async function listBookings(branchId: string, filters: BookingFilters = {}) {
  const conditions = [eq(booking.branchId, branchId)]
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
    .where(and(...conditions))
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
  // Bookings whose assignee was taken off them, waiting for someone else (R1.7).
  const reassignments = await getOpenReassignmentsFor(bookingIds)

  return rows.map((r) => ({
    ...r.booking,
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    services: servicesWithStaff.filter((s) => s.bookingId === r.booking.id),
    reassignment: reassignments.get(r.booking.id) ?? null,
  }))
}

// Single booking at the branch with customer info + its booking_service rows,
// or null when there is no such booking there.
export async function getBookingForAdmin(id: string, branchId: string) {
  const rows = await db
    .select({
      booking,
      customerName: user.name,
      customerEmail: user.email,
    })
    .from(booking)
    .innerJoin(user, eq(booking.customerId, user.id))
    .where(atBranch(id, branchId))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  // Each service with its assignee's name (null when nobody is assigned).
  const services = await db
    .select({ service: bookingService, staffName: user.name })
    .from(bookingService)
    .leftJoin(staffProfile, eq(bookingService.staffId, staffProfile.id))
    .leftJoin(user, eq(staffProfile.userId, user.id))
    .where(eq(bookingService.bookingId, found.booking.id))
    .orderBy(asc(bookingService.displayOrder))
  const reassignments = await getOpenReassignmentsFor([found.booking.id])

  return {
    ...found.booking,
    customerName: found.customerName,
    customerEmail: found.customerEmail,
    services: services.map((s) => ({ ...s.service, staffName: s.staffName })),
    reassignment: reassignments.get(found.booking.id) ?? null,
  }
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

// ────────────────────────────────────────────────────────────────────────────
// Admin mutation queries (Requirements 11.1, 11.2, 11.4, 12.1)
//
// LAYER NOTE: packages/db must not import packages/business (the STRICT layer
// rule — @rgss/business is not a dependency of @rgss/db). The invoice's tax
// (prepareInvoiceTax: each line at the branch's rate in force) and the gems
// award (calculateGemsEarned) are therefore computed by the admin route/business
// layer and passed in as already-resolved values; this layer only persists them
// atomically. The invoice number is the one exception: it comes from the
// branch's counter inside the same batch (invoice-issue.ts). Status-transition
// guards (e.g. approve/reject require `pending`, completion requires
// `confirmed`/`in_progress`) are enforced by the route before these writers
// run, and completion re-checks its own in SQL — the prior status is read here
// to stamp the booking_status_log `fromStatus`, mirroring cancelBooking /
// rescheduleBooking in queries/bookings.ts.
//
// neon-http has no interactive transactions (db.transaction throws), so each
// multi-statement write uses db.batch() — a single atomic, server-side
// transaction round-trip.
// ────────────────────────────────────────────────────────────────────────────

// The booking_service rows of a booking at the branch.
function servicesOfBookingAt(id: string, branchId: string) {
  return inArray(
    bookingService.bookingId,
    db.select({ id: booking.id }).from(booking).where(atBranch(id, branchId)),
  )
}

/**
 * Run `writes` that assign `staffId` at `branchId` in one transaction. The
 * database refuses an assignee who doesn't work at the branch, or who is on
 * approved leave that day (trigger booking_assignee_guard, migration 0014),
 * and one who has another booking then or is still with another customer
 * (staff occupancy, 0028); each is a 409 saying which.
 * The branch row and the staff profile are locked first, in the order a role
 * change and a leave decision take them, so a concurrent change either waits
 * for this write and then releases what it assigned, or commits first and
 * this write is refused (R1.7, MS-09). Returns the writes' results.
 */
async function runAssigning(
  branchId: string,
  staffId: string,
  writes: readonly BatchItem<'pg'>[],
): Promise<unknown[]> {
  const statements: BatchItem<'pg'>[] = [
    db.execute(sql`select ${branch.id} from ${branch} where ${branch.id} = ${branchId} for share`),
    db.execute(
      sql`select ${staffProfile.id} from ${staffProfile} where ${staffProfile.id} = ${staffId} for share`,
    ),
    ...writes,
  ]
  try {
    const results = await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
    return results.slice(2)
  } catch (error) {
    const refusal = assigneeRefusal(error)
    if (refusal) {
      throw new AppError({
        code: ERROR_CODES.CONFLICT,
        message: assigneeRefusalMessage(refusal),
        statusCode: 409,
      })
    }
    throw error
  }
}

// Approve a pending booking: set status → `confirmed` (+ confirmedAt), assign the
// chosen staff member to every booking_service row, close any reassignment work,
// and append a status-log entry capturing the prior → confirmed transition with
// the acting user (Req 11.1, 11.4). Returns the updated booking, or null when the
// booking does not exist; 409 when the person can't take it (runAssigning).
export async function approveBooking(
  id: string,
  branchId: string,
  changedById: string,
  staffId: string,
) {
  const rows = await db
    .select({ status: booking.status })
    .from(booking)
    .where(atBranch(id, branchId))
    .limit(1)
  const current = rows[0]
  if (!current) {
    return null
  }

  const updateStmt = db
    .update(booking)
    .set({ status: 'confirmed', confirmedAt: new Date() })
    .where(atBranch(id, branchId))
    .returning()

  const assignStmt = db
    .update(bookingService)
    .set({ staffId })
    .where(servicesOfBookingAt(id, branchId))

  const logStmt = db.insert(bookingStatusLog).values({
    bookingId: id,
    fromStatus: current.status,
    toStatus: 'confirmed',
    changedById,
    notes: 'Approved',
  })

  const [updateResult] = await runAssigning(branchId, staffId, [
    updateStmt,
    assignStmt,
    resolveReassignmentStatement(id, branchId, changedById),
    logStmt,
  ])
  return ((updateResult as (typeof booking.$inferSelect)[])[0] ?? null) as
    | typeof booking.$inferSelect
    | null
}

/**
 * End a booking that won't go ahead, in one transaction: move it from
 * `fromStatus` to `toStatus` (with `set`'s columns), log the move, and give
 * back any gems it was booked with, to the batches they came from (ST-03).
 * The move applies only while the booking is still at the branch with the
 * status the caller read, so a double submit or a concurrent change rolls the
 * whole write back with 409. Returns the updated booking.
 */
async function endBookingAt(params: {
  id: string
  branchId: string
  changedById: string
  fromStatus: BookingStatus
  toStatus: 'rejected' | 'no_show'
  /** Further columns the move sets, as `column = value` pairs; null for none. */
  set: SQL | null
  notes: string
  action: string
}): Promise<typeof booking.$inferSelect> {
  const { id, branchId, changedById, fromStatus, toStatus } = params
  const extra = params.set ? sql`, ${params.set}` : sql``
  const move = db.execute(sql`
    WITH moved AS (
      UPDATE booking
         SET status = ${toStatus}::booking_status, updated_at = now()${extra}
       WHERE id = ${id}
         AND branch_id = ${branchId}
         AND status = ${fromStatus}::booking_status
      RETURNING 1
    )
    SELECT 1 / count(*)::int AS ok FROM moved
  `)
  const log = db.insert(bookingStatusLog).values({
    bookingId: id,
    fromStatus,
    toStatus,
    changedById,
    notes: params.notes,
  })
  const read = db.select().from(booking).where(atBranch(id, branchId))
  try {
    const results = await db.batch([
      move,
      log,
      ...returnGemsOfEndedRedemptions(sql`r.booking_id = ${id}`),
      read,
    ])
    return (results.at(-1) as (typeof booking.$inferSelect)[])[0] as typeof booking.$inferSelect
  } catch (error) {
    if (isGuardAbort(error)) {
      throw conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        `This booking changed while you were ${params.action} it. Reload it to see where it stands.`,
      )
    }
    throw error
  }
}

// Reject a pending booking: set status → `rejected` (+ rejectedAt), store the
// customer-facing rejection reason, append a status-log entry capturing the
// prior → rejected transition with the acting user (Req 11.2, 11.4), and give
// back any gems it was booked with. Returns the updated booking, or null when
// the booking does not exist; 409 when it is no longer pending.
export async function rejectBooking(
  id: string,
  branchId: string,
  changedById: string,
  rejectionReason: string,
) {
  const rows = await db
    .select({ status: booking.status })
    .from(booking)
    .where(atBranch(id, branchId))
    .limit(1)
  const current = rows[0]
  if (!current) {
    return null
  }
  if (current.status !== 'pending') {
    throw conflict(
      ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
      `Only pending bookings can be rejected (current status: "${current.status}").`,
    )
  }

  return endBookingAt({
    id,
    branchId,
    changedById,
    fromStatus: current.status,
    toStatus: 'rejected',
    set: sql`rejection_reason = ${rejectionReason}, rejected_at = now()`,
    notes: `Rejected: ${rejectionReason}`,
    action: 'rejecting',
  })
}

// Mark a confirmed booking as a no-show after its appointment: status →
// `no_show`, a status-log entry with the acting user, and any gems it was
// booked with given back (ST-03). Returns the updated booking, or null when
// the booking does not exist; 409 when it is no longer confirmed.
export async function markBookingNoShow(id: string, branchId: string, changedById: string) {
  const rows = await db
    .select({ status: booking.status })
    .from(booking)
    .where(atBranch(id, branchId))
    .limit(1)
  const current = rows[0]
  if (!current) {
    return null
  }
  if (current.status !== 'confirmed') {
    throw conflict(
      ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
      `Only confirmed bookings can be marked as no-show (current status: "${current.status}").`,
    )
  }

  return endBookingAt({
    id,
    branchId,
    changedById,
    fromStatus: current.status,
    toStatus: 'no_show',
    set: null,
    notes: 'Marked no-show',
    action: 'marking',
  })
}

/** What starting a booking did. */
export type StartBookingResult =
  | { ok: true; booking: typeof booking.$inferSelect }
  | {
      ok: false
      /**
       * not_confirmed: it was started, completed or ended meanwhile.
       * membership_unavailable: its membership can't be used at this instant.
       * staff_busy: its assignee is still with another customer (0028, MS-08).
       * not_one_assignee: its service lines name different people (0028).
       */
      reason: 'not_confirmed' | 'membership_unavailable' | 'staff_busy' | 'not_one_assignee'
    }

// Start a confirmed booking at the branch now ("Start" in
// membership-scheduling.md): in_progress, with the database's clock as its
// actual start, and a status-log entry, in one transaction. A membership
// session keeps its held minutes; the database rechecks the membership's
// validity at the actual start (0026), so a session delayed past expiry can't
// start on its earlier reservation (MS-06). The start opens the assignee's
// actual work (0028), refused while their earlier work runs (MS-08). The move
// applies only while the booking is still confirmed at the branch, so a
// double submit starts once.
export async function startBooking(params: {
  bookingId: string
  branchId: string
  changedById: string
}): Promise<StartBookingResult> {
  const { bookingId, branchId, changedById } = params
  const move = db.execute(sql`
    WITH started AS (
      UPDATE booking
         SET status = 'in_progress', started_at = now(), updated_at = now()
       WHERE id = ${bookingId}
         AND branch_id = ${branchId}
         AND status = 'confirmed'
      RETURNING 1
    )
    SELECT 1 / count(*)::int AS ok FROM started
  `)
  const log = db.insert(bookingStatusLog).values({
    bookingId,
    fromStatus: 'confirmed',
    toStatus: 'in_progress',
    changedById,
    notes: 'Started',
  })
  const read = db.select().from(booking).where(atBranch(bookingId, branchId))
  try {
    const results = await db.batch([move, log, read])
    const started = (results[2] as (typeof booking.$inferSelect)[])[0]
    if (!started) {
      throw new Error(`booking ${bookingId} vanished while starting`)
    }
    return { ok: true, booking: started }
  } catch (error) {
    if (isGuardAbort(error)) {
      return { ok: false, reason: 'not_confirmed' }
    }
    if (isConstraintViolation(error, SQLSTATE.checkViolation, ['membership_hold_validity'])) {
      return { ok: false, reason: 'membership_unavailable' }
    }
    // The assignee's earlier work hasn't finished: a running SPA blocks any
    // start, a running salon service a SPA start (0028), even when no alert
    // reached reception.
    const refusal = assigneeRefusal(error)
    if (refusal === 'working' || refusal === 'booked') {
      return { ok: false, reason: 'staff_busy' }
    }
    if (refusal === 'one_assignee') {
      return { ok: false, reason: 'not_one_assignee' }
    }
    throw error
  }
}

// (Re)assign a staff member to every booking_service row of a booking at the
// branch, regardless of the booking's lifecycle status (Req 11 — assign action),
// and close any reassignment work (R1.7). No status change and no status-log
// entry: this only moves the resource allocation. Returns the updated
// booking_service rows (empty array when the booking has no services or isn't
// at the branch); 409 when the person can't take it (runAssigning).
export async function assignStaff(
  bookingId: string,
  branchId: string,
  staffId: string,
  actorId: string,
) {
  const [assigned] = await runAssigning(branchId, staffId, [
    db
      .update(bookingService)
      .set({ staffId })
      .where(servicesOfBookingAt(bookingId, branchId))
      .returning(),
    resolveReassignmentStatement(bookingId, branchId, actorId),
  ])
  return assigned as (typeof bookingService.$inferSelect)[]
}

/** The service invoice of a completed booking: every amount and tax fact is final. */
export type CompleteBookingInvoice = Omit<
  InvoiceIssue,
  'id' | 'bookingId' | 'gemsRedeemed' | 'gemsRedeemedServiceId' | 'offer'
> & {
  /**
   * The offer applied at checkout (offers.md): its rule snapshot for the
   * invoice, and the IST day (`YYYY-MM-DD`) it is redeemed on. The batch
   * records the redemption only while the offer is still active and that day
   * is within its dates (409 OFFER_EXPIRED otherwise), and the unique
   * (customer, day) refuses a second offer that day at any branch (409
   * OFFER_NOT_APPLICABLE): either way nothing is written.
   */
  offer?: (NonNullable<InvoiceIssue['offer']> & { redeemedOn: string }) | null
  // Gems REDEEMED for one of this booking's services (optional). When present,
  // the same atomic batch deducts `gemsRequired` from the customer's loyalty
  // balance behind a `balance >= gemsRequired` guard, writes a 'redeemed'
  // loyalty_transaction, and stamps invoice.gemsRedeemed / gemsRedeemedServiceId.
  // The gem amount is the server-computed cost (assertRedeemable) — never client
  // input. A 0-row guard (balance raced below the cost) aborts the WHOLE
  // completion (nothing persists) via GEMS_INSUFFICIENT_BALANCE.
  gemsRedemption?: { serviceId: string; gemsRequired: number } | null
}

// Marker raised by the completion's status guard: casting it to an integer
// fails (SQLSTATE 22P02) with this text in the message, which tells it apart
// from the gems guard's division by zero.
const NOT_COMPLETABLE = 'booking_not_completable'
// The same for the offer redemption: the offer ended or was retired between
// the route's check and the write.
const OFFER_NOT_LIVE = 'offer_not_live'
// One offer per customer per IST day, at any branch (offers.md).
const OFFER_DAY_UNIQUE = 'offer_redemption_customer_id_redeemed_date_unique'

/** True when the batch aborted on a guard that raised `marker`. */
function abortedWith(error: unknown, marker: string): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return false
    }
    const e = current as { message?: unknown; cause?: unknown }
    if (typeof e.message === 'string' && e.message.includes(marker)) {
      return true
    }
    current = e.cause
  }
  return false
}

function isNotCompletableAbort(error: unknown): boolean {
  return abortedWith(error, NOT_COMPLETABLE)
}

// Complete a booking and bill it in ONE atomic db.batch() (Req 12.1): set the
// booking → `completed` while it is still confirmed or in progress, take the
// branch's next invoice number and issue the service invoice with its issuer
// snapshot and per-line tax facts (multi-branch R6.1, R6.2), credit or redeem
// gems, append a status-log entry, and recompute the customer's CRM KPIs.
//
// Every amount and tax fact is computed by the route with @rgss/business
// (prepareInvoiceTax, calculateGemsEarned) and passed in; this layer persists
// them atomically. The loyalty account is resolved/created before the batch
// because neon-http cannot read-then-conditionally-create inside one batch.
// Returns the updated booking and the issued invoice, or null when the booking
// is not at the branch. Throws 409 when the booking stopped being completable
// or already has an invoice (a retried completion), or when gems ran short.
export async function completeBookingWithInvoice(params: {
  bookingId: string
  changedById: string
  invoice: CompleteBookingInvoice
  items: InvoiceIssueLine[]
  /**
   * The Developer's settlement settings, stored on the entries recorded when
   * gems spent on this booking were issued by another branch (R10).
   */
  settlement: SettlementSetting
}) {
  const { bookingId, changedById, invoice: inv, items, settlement } = params
  const redemption = inv.gemsRedemption ?? null

  // The invoice is issued by the booking's own branch.
  const rows = await db
    .select({ status: booking.status })
    .from(booking)
    .where(atBranch(bookingId, inv.branchId))
    .limit(1)
  const current = rows[0]
  if (!current) {
    return null
  }

  const invoiceId = nanoid()
  const completedAt = inv.taxPointAt

  // Resolve the loyalty account up-front (read + lazy create) so the gems credit
  // AND/OR the guarded redemption deduction can join the atomic batch below. Only
  // needed when gems are earned or redeemed on this booking.
  const loyaltyAccountId =
    inv.gemsEarned > 0 || redemption ? (await getOrCreateLoyaltyAccount(inv.customerId)).id : null

  const { gemsRedemption: _redemption, offer: appliedOffer, ...header } = inv
  const issue: InvoiceIssue = {
    ...header,
    id: invoiceId,
    bookingId,
    // Stamp the redemption onto the invoice (the redeemed amount and the
    // service it covered). Zero / null when no redemption took place.
    gemsRedeemed: redemption?.gemsRequired ?? 0,
    gemsRedeemedServiceId: redemption?.serviceId ?? null,
    // The offer's rule as applied, fixed on the invoice from now on.
    offer: appliedOffer
      ? {
          id: appliedOffer.id,
          name: appliedOffer.name,
          type: appliedOffer.type,
          value: appliedOffer.value,
        }
      : null,
  }
  const { counter, insertInvoice, insertLines } = issueInvoiceStatements(issue, items)
  const number = invoiceNumberOf(invoiceId)

  // The status guard: the booking moves to completed only while it is still
  // confirmed or in progress; otherwise the cast fails and the batch rolls back.
  // It also records the offer checkout applied.
  const completeStmt = db.execute(sql`
    WITH done AS (
      UPDATE booking
         SET status = 'completed', completed_at = ${completedAt}, updated_at = now()
             ${appliedOffer ? sql`, offer_id = ${appliedOffer.id}` : sql``}
       WHERE id = ${bookingId}
         AND branch_id = ${inv.branchId}
         AND status IN ('confirmed', 'in_progress')
      RETURNING id
    )
    SELECT (CASE WHEN count(*) = 0 THEN ${NOT_COMPLETABLE} ELSE '1' END)::int AS ok FROM done
  `)

  // Order: [status guard, counter, invoice, (lines), (offer redemption),
  // (guarded gems redemption + redeemed tx), (earned gems tx + credit), status
  // log, KPIs, booking read]. The invoice sits at index 2; the booking read is
  // last.
  const statements: BatchItem<'pg'>[] = [completeStmt, counter, insertInvoice]
  if (insertLines) {
    statements.push(insertLines)
  }

  // The offer redemption, revalidated in the write (R4.5): it is recorded only
  // while the offer is still active and the day is within its dates, else the
  // cast fails and nothing persists. The unique (customer, day) refuses a
  // second offer the same IST day, at this branch or another; a simultaneous
  // checkout waits on the index and then fails, rolling its invoice back.
  if (appliedOffer) {
    statements.push(
      db.execute(sql`
        WITH live AS (
          SELECT id FROM offer
           WHERE id = ${appliedOffer.id}
             AND is_active
             AND start_date <= ${appliedOffer.redeemedOn}::date
             AND end_date >= ${appliedOffer.redeemedOn}::date
        ), redeemed AS (
          INSERT INTO offer_redemption (id, offer_id, customer_id, booking_id, redeemed_date)
          SELECT ${nanoid()}, id, ${inv.customerId}, ${bookingId}, ${appliedOffer.redeemedOn}::date
            FROM live
          RETURNING id
        )
        SELECT (CASE WHEN count(*) = 0 THEN ${OFFER_NOT_LIVE} ELSE '1' END)::int AS ok
          FROM redeemed
      `),
    )
  }

  // Guarded gems redemption (Req: atomic deduction). Mirrors the guarded-CTE
  // semantics of redeemServiceWithGems: the UPDATE only deducts when the balance
  // still covers the cost; the trailing `1 / count(*)` over the guard CTE divides
  // by zero (SQLSTATE 22012) when the guard matched 0 rows, which aborts the
  // ENTIRE batch transaction so nothing — booking, invoice, items, gems — is
  // persisted. The UPDATE also locks the account, so the allocation that
  // follows reads the batches as concurrent redemptions left them, and spends
  // the earliest-expiring gems first (ST-02, ST-06). The deduction runs BEFORE
  // the earned-gems credit below so gems earned on THIS booking can never fund
  // its own redemption.
  if (loyaltyAccountId && redemption) {
    const redeemedTxId = nanoid()
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
        id: redeemedTxId,
        loyaltyAccountId,
        type: 'redeemed',
        gemsAmount: redemption.gemsRequired,
        invoiceId,
        bookingId,
        branchId: inv.branchId,
        description: sql`'Redeemed on invoice ' || ${number}`,
      }),
    )
    statements.push(allocateRedemption(redeemedTxId))
  }

  // What the branches that issued the gems spent on this booking owe this
  // branch, now that the free service is done: the gems redeemed just above,
  // or earlier when the customer booked the service with gems (ST-01).
  // Inserts nothing when no gems were spent on the booking.
  statements.push(
    gemsSettlementEntries({ bookingId, branchId: inv.branchId, actorId: changedById, settlement }),
  )

  if (loyaltyAccountId && inv.gemsEarned > 0) {
    const expiresAt = new Date(completedAt.getTime() + LOYALTY_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    statements.push(
      db.insert(loyaltyTransaction).values({
        loyaltyAccountId,
        type: 'earned',
        gemsAmount: inv.gemsEarned,
        invoiceId,
        // The batch is issued by the invoice's branch.
        branchId: inv.branchId,
        description: sql`'Earned on invoice ' || ${number}`,
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

  statements.push(
    db.insert(bookingStatusLog).values({
      bookingId,
      fromStatus: current.status,
      toStatus: 'completed',
      changedById,
      notes: sql`'Completed — invoice ' || ${number}`,
    }),
  )

  // Recompute the customer's CRM KPIs (visits, LTV, first/last visit) after
  // the completion, in the same batch, so they commit or roll back with it.
  statements.push(refreshCustomerStatsStatement(inv.customerId))
  statements.push(db.select().from(booking).where(eq(booking.id, bookingId)))

  let results: unknown[]
  try {
    results = await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (error) {
    if (isNotCompletableAbort(error)) {
      throw new AppError({
        code: ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        message: 'This booking is no longer confirmed or in progress.',
        statusCode: 409,
      })
    }
    if (isDuplicateBookingInvoice(error)) {
      throw new AppError({
        code: ERROR_CODES.CONFLICT,
        message: 'This booking already has an invoice.',
        statusCode: 409,
      })
    }
    // The offer ended or was retired after the route checked it.
    if (appliedOffer && abortedWith(error, OFFER_NOT_LIVE)) {
      throw conflict(
        ERROR_CODES.OFFER_EXPIRED,
        'This offer ended or was retired just now. Complete without it, or choose another.',
      )
    }
    // The customer used an offer today already, here or at another branch,
    // perhaps in a checkout running at the same moment.
    if (
      appliedOffer &&
      isConstraintViolation(error, SQLSTATE.uniqueViolation, [OFFER_DAY_UNIQUE])
    ) {
      throw conflict(
        ERROR_CODES.OFFER_NOT_APPLICABLE,
        'This customer has already used an offer today. Complete without it.',
      )
    }
    // The guarded redemption deduction aborted the transaction because the
    // balance raced below the cost (0-row guard → division by zero), or the
    // unexpired batches couldn't cover it. The whole batch rolled back —
    // booking, invoice, items and gems all un-persisted — preserving the
    // all-or-nothing guarantee. Surface as a clean 409.
    if (redemption && isGemsShortfall(error)) {
      throw new AppError({
        code: ERROR_CODES.GEMS_INSUFFICIENT_BALANCE,
        message: 'You do not have enough gems to redeem this service.',
        statusCode: 409,
      })
    }
    throw error
  }

  const createdInvoice = (results[2] as (typeof invoice.$inferSelect)[])[0]
  const updatedBooking = (results.at(-1) as (typeof booking.$inferSelect)[])[0]

  return { booking: updatedBooking, invoice: createdInvoice }
}
