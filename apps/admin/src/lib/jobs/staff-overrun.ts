/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : jobs/staff-overrun (admin)
 * Scope        : Background Jobs — bookings held up by an overrun (MS-08)
 *
 * Description  : Flags confirmed bookings whose person is still with another
 *                customer when they are due, and tells each one's branch
 *                front desk, with who is free to take it instead
 *                (membership-scheduling.md slice 2b).
 *
 * Responsibilities :
 * - raiseStaffOverruns({ bookingId? }) → { flagged, heldUp, notified }
 *
 * Tech Stack   : TypeScript
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/business, @rgss/db/queries, ./branch-alerts
 *
 * Notes        :
 * - Called by the staff-overrun-check job for every booking due soon, and by
 *   a refused start for that booking.
 * - Alerts are idempotent per person and booking (alertBranchFrontDesk), so
 *   the next run tells only the people not yet told: a failed alert is
 *   retried. A flag is never raised twice for one hold-up.
 * - Nothing moves on its own: no booking is started, rescheduled or
 *   reassigned here. Suggestions are not a lock; assigning rechecks.
 ************************************************************/

import { formatDateIN, replacementSuggestions } from '@rgss/business'
import {
  flagStaffOverruns,
  getLiveStaffOverruns,
  getStaffAvailability,
  OVERRUN_GRACE_MINUTES,
  OVERRUN_LEAD_MINUTES,
} from '@rgss/db/queries'
import { alertBranchFrontDesk } from './branch-alerts'

/** What one pass found and did. */
export type StaffOverrunRun = {
  /** Bookings flagged in this pass. */
  flagged: number
  /** Bookings held up now, flagged in this pass or before. */
  heldUp: number
  /** People told in this pass. */
  notified: number
}

/**
 * Flag the bookings held up now (with `bookingId`, that booking only, and
 * only once it is due), then tell the front desk of each held-up booking's
 * branch, naming up to three people free to take it.
 */
export async function raiseStaffOverruns(
  params: { bookingId?: string | undefined } = {},
): Promise<StaffOverrunRun> {
  const { bookingId } = params
  const flagged = await flagStaffOverruns({
    leadMinutes: bookingId ? 0 : OVERRUN_LEAD_MINUTES,
    graceMinutes: OVERRUN_GRACE_MINUTES,
    bookingId,
  })
  const heldUp = await getLiveStaffOverruns({ bookingId })

  let notified = 0
  for (const overrun of heldUp) {
    const people = await getStaffAvailability({
      branchId: overrun.branchId,
      slot: {
        dateISO: overrun.bookingDate,
        startTime: overrun.startTime,
        endTime: overrun.endTime,
        kind: overrun.kind,
        excludeBookingId: overrun.bookingId,
      },
      serviceIds: overrun.serviceIds,
    })
    const free = replacementSuggestions(people, { kind: overrun.kind, exclude: overrun.staffId })
    const result = await alertBranchFrontDesk({
      branchId: overrun.branchId,
      bookingId: overrun.bookingId,
      type: 'staff_overrun',
      data: {
        staffName: overrun.staffName,
        time: overrun.startTime,
        date: formatDateIN(new Date(`${overrun.bookingDate}T00:00:00.000Z`)),
        ...(free.length > 0 ? { suggestions: free.join(', ') } : {}),
      },
    })
    notified += result.notified
  }
  return { flagged: flagged.length, heldUp: heldUp.length, notified }
}
