/************************************************************
 * Module Name  : bookings/reassignment-work (admin)
 * Scope        : Page loaders — dashboard reassignment list (multi-branch R1.7)
 *
 * Description  : The active branch's confirmed bookings whose assignee was
 *                taken off them (they left the branch, or approved leave
 *                covers the day), soonest first. Reception assigns someone
 *                else from each booking; an entry goes away once someone is
 *                assigned or the booking ends.
 *
 * Responsibilities :
 * - reassignmentWork() → { branchName, total, items } | null
 *
 * Notes        : Authorizes like the dashboard (Receptionist or above at the
 *                active branch). A failed read hides the list rather than
 *                breaking the dashboard; the bookings themselves still show
 *                "Needs staff".
 ************************************************************/

import { getOpenReassignments } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { unstable_rethrow } from 'next/navigation'
import { reassignmentReasonText } from '@/lib/admin/bookings'
import { branchForPage } from '@/lib/api/branch-page'

const logger = createLogger({
  service: 'admin:bookings:reassignment-work',
  environment: process.env.NODE_ENV ?? 'development',
})

/** How many bookings the dashboard lists before "and N more". */
export const REASSIGNMENT_WORK_LIMIT = 8

export type ReassignmentWorkItem = {
  bookingId: string
  bookingNumber: string
  /** YYYY-MM-DD, the IST business date. */
  date: string
  startTime: string
  customerName: string
  reasonText: string
}

export type ReassignmentWork = {
  branchName: string
  total: number
  items: ReassignmentWorkItem[]
}

export async function reassignmentWork(): Promise<ReassignmentWork | null> {
  try {
    const access = await branchForPage('receptionist')
    if (!access.ok) {
      return null
    }
    const open = await getOpenReassignments(access.branch.id)
    if (open.length === 0) {
      return null
    }
    return {
      branchName: access.branch.name,
      total: open.length,
      items: open.slice(0, REASSIGNMENT_WORK_LIMIT).map((work) => ({
        bookingId: work.bookingId,
        bookingNumber: work.bookingNumber,
        date: work.bookingDate.toISOString().slice(0, 10),
        startTime: work.startTime,
        customerName: work.customerName,
        reasonText: reassignmentReasonText(work),
      })),
    }
  } catch (error) {
    // Let Next.js handle its own control-flow errors (dynamic rendering, redirects).
    unstable_rethrow(error)
    logger.warn('reassignment list failed; hidden', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
