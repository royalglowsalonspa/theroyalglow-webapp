import { conflict, ERROR_CODES } from '@rgss/errors'
import { sql } from 'drizzle-orm'
import { db } from '../index'
import { booking } from '../schema/booking'
import { branch } from '../schema/branch'
import { holiday } from '../schema/schedule'
import { findDriverError } from './driver-errors'

export type CustomerBookingAdmission = {
  branchName: string
  todayISO: string
  maxUpcoming: number
}

const BRANCH_CLOSED = 'customer_booking_branch_inactive'
const DATE_CLOSED = 'customer_booking_date_closed'
const LIMIT_REACHED = 'customer_booking_limit_reached'

// Closure creation takes the exclusive variant before it writes. A shared
// lock lets independent bookings proceed together, including at other branches.
export function bookingClosureDayLock(date: string, shared: boolean) {
  const lock = shared ? sql`pg_advisory_xact_lock_shared` : sql`pg_advisory_xact_lock`
  return sql`${lock}(hashtext('rgss.booking.closure'), ${date}::date - DATE '2000-01-01')`
}

/** Run these before inserting a customer booking in the same READ COMMITTED batch. */
export function customerBookingAdmissionStatements(
  input: { customerId: string; branchId: string; date: string },
  admission: CustomerBookingAdmission,
) {
  const { customerId, branchId, date } = input
  return [
    // Both ordinary and gems bookings take this lock before any capacity read.
    // A new statement then sees the previous transaction's committed booking.
    db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`rgss.booking.customer:${customerId}`}, 0))`,
    ),
    db.execute(sql`select ${bookingClosureDayLock(date, true)}`),
    db.execute(sql`
      select (case
        when not exists (
          select 1 from ${branch} where ${branch.id} = ${branchId}
            and ${branch.status} = 'operational' for share
        ) then ${BRANCH_CLOSED}
        when exists (
          select 1 from ${holiday} where ${holiday.date} = ${date}
            and (${holiday.branchId} is null or ${holiday.branchId} = ${branchId})
        ) then ${DATE_CLOSED}
        when (
          select count(*) from ${booking}
           where ${booking.customerId} = ${customerId} and ${booking.branchId} = ${branchId}
             and ${booking.status} in ('pending', 'confirmed')
             and ${booking.bookingDate} >= ${admission.todayISO}::date
        ) >= ${admission.maxUpcoming} then ${LIMIT_REACHED}
        else '1'
      end)::int as ok
    `),
  ] as const
}

export function customerBookingAdmissionError(error: unknown, branchName: string) {
  // The wrapper can include every bound marker in the SQL parameters. Read
  // the Postgres error itself to identify which guard actually refused.
  const driverError = findDriverError(error, ['22P02'])
  const message = typeof driverError?.message === 'string' ? driverError.message : ''
  if (message.includes(`"${LIMIT_REACHED}"`)) {
    return conflict(
      ERROR_CODES.BOOKING_LIMIT_REACHED,
      `You have reached the upcoming booking limit at ${branchName}. Cancel one, or book again after your visit.`,
    )
  }
  if (message.includes(`"${BRANCH_CLOSED}"`)) {
    return conflict(ERROR_CODES.BRANCH_INACTIVE, `${branchName} is no longer accepting bookings.`)
  }
  if (message.includes(`"${DATE_CLOSED}"`)) {
    return conflict(
      ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
      `${branchName} is closed that day. Choose another date.`,
    )
  }
  return null
}
