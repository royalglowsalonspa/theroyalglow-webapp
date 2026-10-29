/************************************************************
 * Module Name  : branch-shutdown
 * Scope        : Data Access — shutting a branch down (multi-branch R1.10)
 *
 * Description  : What must be resolved before a branch can shut down, and the
 *                shutdown itself. A shut-down branch takes no new bookings or
 *                invoices; its history stays readable to those with access.
 *
 * Responsibilities :
 * - getBranchShutdownBlockers(branchId) → the people, bookings, unpaid
 *   invoices and waitlist entries still open there
 * - shutDownBranch(branchId, patch)     → one transaction: clear leftover
 *   schedule days, then set the status (and any other edits)
 *
 * Notes        : The database enforces both halves (migration 0011): the
 *                `branch_shutdown_resolved` trigger refuses a shutdown while
 *                anything is open, and `booking_branch_open` /
 *                `invoice_branch_open` refuse new rows at a shut-down branch.
 *                Both lock the branch row, so a booking racing the shutdown
 *                either blocks it or is refused. The app lists blockers for the
 *                Developer; the trigger is the guarantee.
 ************************************************************/

import type { BranchUpdateInput } from '@rgss/types'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../index'
import { session, user } from '../schema/auth'
import { booking, waitlist } from '../schema/booking'
import { branch } from '../schema/branch'
import { invoice } from '../schema/invoice'
import { staffProfile } from '../schema/profile'
import { staffSchedule } from '../schema/schedule'
import { branchUpdateValues } from './branches'
import { findDriverError, isConstraintViolation, isGuardAbort, SQLSTATE } from './driver-errors'
import { realtimeRevocationStatement } from './realtime-revocations'

/** How many of each kind of blocker are listed by name. */
const LISTED = 20

export type ShutdownPerson = { userId: string; name: string; role: string }

export type ShutdownBlockers = {
  manager: { userId: string; name: string } | null
  people: ShutdownPerson[]
  bookings: {
    count: number
    upcoming: {
      id: string
      bookingNumber: string
      date: string
      startTime: string
      status: string
      customerName: string
    }[]
  }
  unpaidInvoices: { count: number; listed: { id: string; invoiceNumber: string }[] }
  waitlist: { count: number }
}

/** True when nothing stands in the way of shutting the branch down. */
export function shutdownIsClear(blockers: ShutdownBlockers): boolean {
  return (
    blockers.manager === null &&
    blockers.people.length === 0 &&
    blockers.bookings.count === 0 &&
    blockers.unpaidInvoices.count === 0 &&
    blockers.waitlist.count === 0
  )
}

const OPEN_BOOKING = ['pending', 'confirmed', 'in_progress'] as const
const OPEN_WAITLIST = ['waiting', 'notified'] as const

/**
 * Everything still open at the branch: its Manager, active staff (Receptionist
 * and Stylists/Therapists), bookings still to happen, unpaid invoices and
 * waitlist entries waiting for a slot. Null when there is no such branch.
 */
export async function getBranchShutdownBlockers(
  branchId: string,
): Promise<ShutdownBlockers | null> {
  const [branches, people, bookingCount, upcoming, invoiceCount, invoices, waiting] =
    await db.batch([
      db
        .select({ managerId: user.id, managerName: user.name })
        .from(branch)
        .leftJoin(user, eq(user.id, branch.managerUserId))
        .where(eq(branch.id, branchId))
        .limit(1),
      db
        .select({ userId: user.id, name: user.name, role: staffProfile.roleWitness })
        .from(staffProfile)
        .innerJoin(user, eq(user.id, staffProfile.userId))
        .where(and(eq(staffProfile.branchId, branchId), eq(staffProfile.isActive, true)))
        .orderBy(asc(user.name), asc(user.id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(booking)
        .where(and(eq(booking.branchId, branchId), inArray(booking.status, [...OPEN_BOOKING]))),
      db
        .select({
          id: booking.id,
          bookingNumber: booking.bookingNumber,
          bookingDate: booking.bookingDate,
          startTime: booking.startTime,
          status: booking.status,
          customerName: user.name,
        })
        .from(booking)
        .innerJoin(user, eq(user.id, booking.customerId))
        .where(and(eq(booking.branchId, branchId), inArray(booking.status, [...OPEN_BOOKING])))
        .orderBy(asc(booking.bookingDate), asc(booking.startTime), asc(booking.id))
        .limit(LISTED),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoice)
        .where(and(eq(invoice.branchId, branchId), eq(invoice.paymentStatus, 'pending'))),
      db
        .select({ id: invoice.id, invoiceNumber: invoice.invoiceNumber })
        .from(invoice)
        .where(and(eq(invoice.branchId, branchId), eq(invoice.paymentStatus, 'pending')))
        .orderBy(asc(invoice.createdAt), asc(invoice.id))
        .limit(LISTED),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(waitlist)
        .where(and(eq(waitlist.branchId, branchId), inArray(waitlist.status, [...OPEN_WAITLIST]))),
    ])

  const found = branches[0]
  if (!found) {
    return null
  }
  return {
    manager:
      found.managerId !== null && found.managerName !== null
        ? { userId: found.managerId, name: found.managerName }
        : null,
    people: people.map((p) => ({ userId: p.userId, name: p.name, role: p.role ?? 'staff' })),
    bookings: {
      count: bookingCount[0]?.count ?? 0,
      upcoming: upcoming.map((b) => ({
        id: b.id,
        bookingNumber: b.bookingNumber,
        date: b.bookingDate.toISOString().slice(0, 10),
        startTime: b.startTime.slice(0, 5),
        status: b.status,
        customerName: b.customerName,
      })),
    },
    unpaidInvoices: { count: invoiceCount[0]?.count ?? 0, listed: invoices },
    waitlist: { count: waiting[0]?.count ?? 0 },
  }
}

export type ShutDownResult =
  | { ok: true; branch: typeof branch.$inferSelect }
  | { ok: false; reason: 'not_found' | 'unresolved' }

/**
 * Shut the branch down, with any other edits, in one transaction. Leftover
 * schedule days at the branch (people who no longer work there) are cleared
 * first. The database refuses the status change while anything is still open
 * there; that comes back as `unresolved`, with nothing written.
 */
export async function shutDownBranch(
  branchId: string,
  patch: BranchUpdateInput,
): Promise<ShutDownResult> {
  const values = { ...branchUpdateValues(patch), status: 'shutdown' as const }
  try {
    const [, updated] = await db.batch([
      db
        .update(staffSchedule)
        .set({ isWorking: false, startTime: null, endTime: null, branchId: null })
        .where(eq(staffSchedule.branchId, branchId)),
      db.update(branch).set(values).where(eq(branch.id, branchId)).returning(),
    ])
    const row = updated[0]
    return row ? { ok: true, branch: row } : { ok: false, reason: 'not_found' }
  } catch (error) {
    if (isConstraintViolation(error, SQLSTATE.checkViolation, ['branch_shutdown_unresolved'])) {
      return { ok: false, reason: 'unresolved' }
    }
    throw error
  }
}

/** True when a write was refused because its branch is shut down. */
export function isBranchShutDownError(error: unknown): boolean {
  return isConstraintViolation(error, SQLSTATE.checkViolation, ['branch_shut_down'])
}

export type DeleteBranchResult =
  | {
      ok: true
      /** The Owner who owned no other branch and is a Customer again. */
      demotedOwnerId: string | null
    }
  | { ok: false; reason: 'not_found' | 'not_shut_down' | 'not_empty' | 'changed' }

/**
 * Delete a shut-down branch with no records left (multi-branch R1.1, R1.10).
 * The foreign keys decide "no records": any booking, invoice, lead, waitlist
 * entry, note, staff profile, schedule day, sales summary or membership sold
 * there keeps it (`not_empty`). Its closures go with it; audit entries stay.
 *
 * One transaction: the delete (only while it is still shut down and owned by
 * the same person), then, when that Owner owns no other branch, their return
 * to Customer with their sessions ended and live updates queued for
 * revocation. Anything that changed meanwhile comes back as `changed`.
 */
export async function deleteShutDownBranch(branchId: string): Promise<DeleteBranchResult> {
  const rows = await db
    .select({ status: branch.status, ownerUserId: branch.ownerUserId })
    .from(branch)
    .where(eq(branch.id, branchId))
    .limit(1)
  const found = rows[0]
  if (!found) {
    return { ok: false, reason: 'not_found' }
  }
  if (found.status !== 'shutdown') {
    return { ok: false, reason: 'not_shut_down' }
  }
  const ownerId = found.ownerUserId

  const others = await db
    .select({ id: branch.id })
    .from(branch)
    .where(and(eq(branch.ownerUserId, ownerId), ne(branch.id, branchId)))
    .limit(1)
  const demote = others.length === 0

  const deleteBranch = db.execute(sql`with gone as (
      delete from ${branch}
      where ${branch.id} = ${branchId} and ${branch.status} = 'shutdown'
        and ${branch.ownerUserId} = ${ownerId}
      returning 1)
    select 1 / count(*)::int as ok from gone`)

  // Still owns no other branch at the moment of the change, or nothing happens.
  const demoteOwner = db.execute(sql`with changed as (
      update ${user} set ${sql.identifier(user.role.name)} = 'customer',
        ${sql.identifier(user.updatedAt.name)} = now()
      where ${user.id} = ${ownerId} and ${user.role} = 'owner'
        and not exists (select 1 from ${branch} where ${branch.ownerUserId} = ${ownerId})
      returning 1)
    select 1 / count(*)::int as ok from changed`)

  try {
    if (demote) {
      await db.batch([
        deleteBranch,
        demoteOwner,
        db.delete(session).where(eq(session.userId, ownerId)),
        realtimeRevocationStatement(ownerId),
      ])
    } else {
      await db.batch([deleteBranch])
    }
  } catch (error) {
    // Every table that records activity at a branch references it ON DELETE
    // RESTRICT (23001) or NO ACTION (23503), so any such refusal here means
    // records remain. Matching the SQLSTATE rather than constraint names keeps
    // a future table covered.
    if (findDriverError(error, [SQLSTATE.restrictViolation, SQLSTATE.foreignKeyViolation])) {
      return { ok: false, reason: 'not_empty' }
    }
    if (isGuardAbort(error)) {
      return { ok: false, reason: 'changed' }
    }
    throw error
  }
  return { ok: true, demotedOwnerId: demote ? ownerId : null }
}
