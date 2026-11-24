/************************************************************
 * Module Name  : bookings/unoffered-service-bookings (admin)
 * Scope        : Page loaders — dashboard list of bookings with a service
 *                the branch no longer offers (multi-branch R4.4)
 *
 * Description  : The active branch's pending and confirmed bookings, today or
 *                later, with a service the branch no longer offers since the
 *                catalogue changed, soonest first. Removing availability never
 *                changes a booking: reception keeps it (checkout honours what
 *                was booked), or cancels it and helps the customer rebook at
 *                a branch that offers the service.
 *
 * Responsibilities :
 * - unofferedServiceBookings() → { total, items } | null
 *
 * Notes        : Authorizes like the dashboard (Receptionist or above at the
 *                active branch). A failed read hides the list rather than
 *                breaking the dashboard.
 ************************************************************/

import { getBookingsWithServicesNotOffered } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { unstable_rethrow } from 'next/navigation'
import { branchForPage } from '@/lib/api/branch-page'

const logger = createLogger({
  service: 'admin:bookings:unoffered-service-bookings',
  environment: process.env.NODE_ENV ?? 'development',
})

/** How many bookings the dashboard lists before "and N more". */
export const UNOFFERED_SERVICE_BOOKINGS_LIMIT = 8

export type UnofferedServiceBookingItem = {
  bookingId: string
  bookingNumber: string
  /** YYYY-MM-DD, the IST business date. */
  date: string
  startTime: string
  customerName: string
  /** The booked services' names, alphabetical. */
  services: string[]
}

export type UnofferedServiceBookings = {
  branchName: string
  total: number
  items: UnofferedServiceBookingItem[]
}

export async function unofferedServiceBookings(): Promise<UnofferedServiceBookings | null> {
  try {
    const access = await branchForPage('receptionist')
    if (!access.ok) {
      return null
    }
    const rows = await getBookingsWithServicesNotOffered(access.branch.id)
    if (rows.length === 0) {
      return null
    }
    return {
      branchName: access.branch.name,
      total: rows.length,
      items: rows.slice(0, UNOFFERED_SERVICE_BOOKINGS_LIMIT).map((row) => ({
        bookingId: row.id,
        bookingNumber: row.bookingNumber,
        date: row.date,
        startTime: row.startTime,
        customerName: row.customerName,
        services: row.services,
      })),
    }
  } catch (error) {
    // Let Next.js handle its own control-flow errors (dynamic rendering, redirects).
    unstable_rethrow(error)
    logger.warn('unoffered-service booking list failed; hidden', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
