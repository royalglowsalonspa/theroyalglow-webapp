/************************************************************
 * Module Name  : bookings/closed-day-bookings (admin)
 * Scope        : Page loaders — dashboard list of bookings on closed days
 *                (multi-branch R1.8, membership-scheduling.md MS-09)
 *
 * Description  : The active branch's pending and confirmed bookings, today or
 *                later, on a day the branch is now closed, soonest first. A
 *                closure never cancels a booking: reception moves or cancels
 *                each from its booking, and it leaves the list then.
 *
 * Responsibilities :
 * - closedDayBookings() → { total, items } | null
 *
 * Notes        : Authorizes like the dashboard (Receptionist or above at the
 *                active branch). A failed read hides the list rather than
 *                breaking the dashboard.
 ************************************************************/

import { getBookingsOnClosedDays } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { unstable_rethrow } from 'next/navigation'
import { branchForPage } from '@/lib/api/branch-page'

const logger = createLogger({
  service: 'admin:bookings:closed-day-bookings',
  environment: process.env.NODE_ENV ?? 'development',
})

/** How many bookings the dashboard lists before "and N more". */
export const CLOSED_DAY_BOOKINGS_LIMIT = 8

export type ClosedDayBookingItem = {
  bookingId: string
  bookingNumber: string
  /** YYYY-MM-DD, the IST business date. */
  date: string
  startTime: string
  customerName: string
  closureName: string
}

export type ClosedDayBookings = {
  total: number
  items: ClosedDayBookingItem[]
}

export async function closedDayBookings(): Promise<ClosedDayBookings | null> {
  try {
    const access = await branchForPage('receptionist')
    if (!access.ok) {
      return null
    }
    const rows = await getBookingsOnClosedDays(access.branch.id)
    if (rows.length === 0) {
      return null
    }
    return {
      total: rows.length,
      items: rows.slice(0, CLOSED_DAY_BOOKINGS_LIMIT).map((row) => ({
        bookingId: row.id,
        bookingNumber: row.bookingNumber,
        date: row.date,
        startTime: row.startTime,
        customerName: row.customerName,
        closureName: row.closureName,
      })),
    }
  } catch (error) {
    // Let Next.js handle its own control-flow errors (dynamic rendering, redirects).
    unstable_rethrow(error)
    logger.warn('closed-day booking list failed; hidden', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
