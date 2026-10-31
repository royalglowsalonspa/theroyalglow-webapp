/************************************************************
 * Module Name  : closures
 * Scope        : Data Access — branch closures (multi-branch R1.8)
 *
 * Description  : Reads and writes the days a branch is closed (the `holiday`
 *                table). A row with a branch closes that branch; a row
 *                without one closes every branch.
 *
 * Responsibilities :
 * - getBranchClosures(branchId, from, to?)   → that branch's and every-branch closures
 * - getClosureOn(branchId, date)             → the closure for one date, or null
 * - getClosureById(id)
 * - createClosures({ branchId, dates, name }) → created rows; dates already closed
 * - deleteClosure({ id, branchId })           → compare-and-delete
 * - getActiveBookingsOnDates(dates, branchId) → bookings a new closure leaves to move
 *
 * Notes        : Partial unique indexes keep one closure per date per branch
 *                and one per date for every branch, so a retried or concurrent
 *                add creates nothing twice (ON CONFLICT DO NOTHING).
 ************************************************************/

import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking } from '../schema/booking'
import { branch } from '../schema/branch'
import { holiday } from '../schema/schedule'

export type ClosureRow = {
  id: string
  branchId: string | null
  date: string
  name: string
  createdAt: Date
}

const CLOSURE_COLUMNS = {
  id: holiday.id,
  branchId: holiday.branchId,
  date: holiday.date,
  name: holiday.name,
  createdAt: holiday.createdAt,
}

/** This branch's closures and every-branch closures. */
function appliesTo(branchId: string) {
  return or(eq(holiday.branchId, branchId), isNull(holiday.branchId))
}

/**
 * The closures that apply to a branch from `fromISO` (to `toISO`, inclusive),
 * by date; on a date closed both ways, the every-branch closure comes first.
 */
export async function getBranchClosures(
  branchId: string,
  fromISO: string,
  toISO?: string,
): Promise<ClosureRow[]> {
  return db
    .select(CLOSURE_COLUMNS)
    .from(holiday)
    .where(
      and(
        appliesTo(branchId),
        gte(holiday.date, fromISO),
        toISO === undefined ? undefined : lte(holiday.date, toISO),
      ),
    )
    .orderBy(asc(holiday.date), sql`${holiday.branchId} is not null`, asc(holiday.id))
}

/**
 * Whether the branch is closed on a date, and why. The branch's own closure
 * names the day when it has one; otherwise the every-branch one does.
 */
export async function getClosureOn(
  branchId: string,
  dateISO: string,
): Promise<{ name: string; allBranches: boolean } | null> {
  const rows = await db
    .select({ name: holiday.name, branchId: holiday.branchId })
    .from(holiday)
    .where(and(appliesTo(branchId), eq(holiday.date, dateISO)))
    .orderBy(sql`${holiday.branchId} is null`)
    .limit(1)
  const row = rows[0]
  return row ? { name: row.name, allBranches: row.branchId === null } : null
}

export async function getClosureById(id: string): Promise<ClosureRow | null> {
  const rows = await db.select(CLOSURE_COLUMNS).from(holiday).where(eq(holiday.id, id)).limit(1)
  return rows[0] ?? null
}

/**
 * Close a branch (or, with `branchId` null, every branch) on each date. A
 * date already closed the same way is left as it is and reported back.
 */
export async function createClosures(params: {
  branchId: string | null
  dates: readonly string[]
  name: string
}): Promise<{ created: ClosureRow[]; alreadyClosed: string[] }> {
  const dates = [...new Set(params.dates)].sort()
  if (dates.length === 0) {
    return { created: [], alreadyClosed: [] }
  }
  const created = await db
    .insert(holiday)
    .values(dates.map((date) => ({ branchId: params.branchId, date, name: params.name })))
    .onConflictDoNothing()
    .returning(CLOSURE_COLUMNS)
  const createdDates = new Set(created.map((row) => row.date))
  return {
    created: created.sort((a, b) => a.date.localeCompare(b.date)),
    alreadyClosed: dates.filter((date) => !createdDates.has(date)),
  }
}

/**
 * Delete a closure only while it still belongs where the caller read it
 * (`branchId`, null for every branch). Returns the deleted row, or null.
 */
export async function deleteClosure(params: {
  id: string
  branchId: string | null
}): Promise<ClosureRow | null> {
  const rows = await db
    .delete(holiday)
    .where(
      and(
        eq(holiday.id, params.id),
        params.branchId === null ? isNull(holiday.branchId) : eq(holiday.branchId, params.branchId),
      ),
    )
    .returning(CLOSURE_COLUMNS)
  return rows[0] ?? null
}

/**
 * Bookings still to happen on these dates: at one branch, or at every branch
 * when `branchId` is null. Pending, confirmed and in-progress only.
 */
export async function getActiveBookingsOnDates(dates: readonly string[], branchId: string | null) {
  if (dates.length === 0) {
    return []
  }
  const days = [...new Set(dates)].map((date) => new Date(`${date}T00:00:00.000Z`))
  const rows = await db
    .select({
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      branchName: branch.name,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      status: booking.status,
      customerName: user.name,
    })
    .from(booking)
    .innerJoin(branch, eq(branch.id, booking.branchId))
    .innerJoin(user, eq(user.id, booking.customerId))
    .where(
      and(
        inArray(booking.bookingDate, days),
        inArray(booking.status, ['pending', 'confirmed', 'in_progress']),
        branchId === null ? undefined : eq(booking.branchId, branchId),
      ),
    )
    .orderBy(asc(booking.bookingDate), asc(booking.startTime), asc(booking.id))
  return rows.map((row) => ({
    id: row.id,
    bookingNumber: row.bookingNumber,
    branchName: row.branchName,
    date: row.bookingDate.toISOString().slice(0, 10),
    startTime: row.startTime.slice(0, 5),
    status: row.status,
    customerName: row.customerName,
  }))
}

/** A booking still to happen at a branch on a day that branch is now closed. */
export type ClosedDayBooking = {
  id: string
  bookingNumber: string
  /** YYYY-MM-DD, the IST business date. */
  date: string
  /** HH:MM. */
  startTime: string
  status: string
  customerName: string
  /** The closure that day: the branch's own, else the every-branch one. */
  closureName: string
}

/**
 * The branch's pending and confirmed bookings, today or later in IST, on a
 * day it is closed (R1.8, MS-09), soonest first. A closure never cancels a
 * booking: each stays listed until reception moves or cancels it, whichever
 * way it was confirmed (approval on a closed day is refused, but one racing
 * the closure still shows here).
 */
export async function getBookingsOnClosedDays(branchId: string): Promise<ClosedDayBooking[]> {
  const result = await db.execute(sql`
    select distinct on (b.booking_date, b.start_time, b.id)
           b.id, b.booking_number, to_char(b.booking_date, 'YYYY-MM-DD') as date,
           to_char(b.start_time, 'HH24:MI') as start_time, b.status::text as status,
           u.name as customer_name, h.name as closure_name
      from booking b
      join "user" u on u.id = b.customer_id
      join holiday h on h.date = to_char(b.booking_date, 'YYYY-MM-DD')
                    and (h.branch_id = b.branch_id or h.branch_id is null)
     where b.branch_id = ${branchId}
       and b.status in ('pending', 'confirmed')
       and b.booking_date >= (now() at time zone 'Asia/Kolkata')::date
     order by b.booking_date, b.start_time, b.id, (h.branch_id is null)`)
  const rows = result.rows as {
    id: string
    booking_number: string
    date: string
    start_time: string
    status: string
    customer_name: string
    closure_name: string
  }[]
  return rows.map((row) => ({
    id: row.id,
    bookingNumber: row.booking_number,
    date: row.date,
    startTime: row.start_time,
    status: row.status,
    customerName: row.customer_name,
    closureName: row.closure_name,
  }))
}
