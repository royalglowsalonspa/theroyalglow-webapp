/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/bookings/[id]/start
 * Scope        : API — Admin Booking
 *
 * Description  : Starts a confirmed booking now: the customer is in the
 *                chair. The booking moves to in_progress with the database's
 *                clock as its actual start ("Start" in membership-scheduling.md).
 *
 * Responsibilities :
 * - Validate the booking is at the active branch, confirmed and assigned
 * - Move it to in_progress with a status-log entry, once
 * - For a membership session: keep its held minutes; the database rechecks
 *   the membership's validity at the actual start (MS-06)
 *
 * Features / Functionality :
 * - Status guard (only confirmed → in_progress), re-checked in the write: a
 *   double submit or a concurrent change is a 409, never a second start
 * - A booking for a later day (IST) can't start yet: move it to today first
 * - A session delayed past its membership's expiry can't start on its earlier
 *   reservation; the refusal says why
 * - The start opens the assignee's actual work, refused while their earlier
 *   work runs: a running SPA blocks any start, a running salon service a SPA
 *   start (staff occupancy, 0028; 409 STAFF_BUSY). A booking held up more
 *   than 10 minutes is flagged for the dashboard and its branch is told
 *   (slice 2b); a start ends the flag (0030)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @/lib/realtime/publish, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Receptionist or above at the active branch. The body names the branch the
 *   page was rendered for ({ branchId }).
 * - An ordinary booking may still complete straight from confirmed; a
 *   membership session must start first.
 ************************************************************/

import { formatDateIN, istToday, membershipUnusableAt } from '@rgss/business'
import { getBookingForAdmin, getMembershipById, startBooking } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { createLogger } from '@rgss/logger'
import { bookingStartSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { raiseStaffOverruns } from '@/lib/jobs/staff-overrun'
import { publishBookingEvent } from '@/lib/realtime/publish'

const logger = createLogger({
  service: 'admin:bookings:start',
  environment: process.env.NODE_ENV ?? 'development',
})

// Why the membership of a session can't be used now, from a fresh read. The
// database refused the start; this only words the refusal.
async function membershipRefusal(membershipId: string | null, now: Date) {
  const membership = membershipId ? await getMembershipById(membershipId) : null
  const reason = membership ? membershipUnusableAt(membership, now) : null
  if (membership && reason === 'not_started') {
    return conflict(
      ERROR_CODES.MEMBERSHIP_NOT_STARTED,
      `This membership starts on ${formatDateIN(membership.startsAt)}. The session can start from then.`,
    )
  }
  if (membership && reason === 'expired') {
    return conflict(
      ERROR_CODES.MEMBERSHIP_EXPIRED,
      `This membership expired on ${formatDateIN(membership.expiresAt)}, so the session can't start.`,
    )
  }
  if (reason === 'cancelled') {
    return conflict(
      ERROR_CODES.MEMBERSHIP_EXPIRED,
      "This membership was cancelled, so the session can't start.",
    )
  }
  return conflict(
    ERROR_CODES.MEMBERSHIP_EXPIRED,
    "The membership can't be used right now. Reload the booking to see where it stands.",
  )
}

export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = bookingStartSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)
    const branchId = ctx.branch.id

    // A booking at another branch is not found (R2.3).
    const existing = await getBookingForAdmin(id, branchId)
    if (!existing) {
      throw notFound('Booking not found.')
    }
    if (existing.status !== 'confirmed') {
      throw conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        `Only a confirmed booking can be started (current status: "${existing.status}").`,
      )
    }
    // A booking starts on its day (IST), or later when it runs late; one for a
    // later day is moved to today first, so its day and its work agree.
    const bookingDay = existing.bookingDate.toISOString().slice(0, 10)
    if (bookingDay > istToday(new Date())) {
      throw conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        `This booking is for ${formatDateIN(new Date(`${bookingDay}T00:00:00.000Z`))}. Start it on that day, or move it to today first.`,
      )
    }
    // Someone has to do the work (R1.7), and one person does all of it (0028).
    if (existing.services.some((s) => s.staffId === null)) {
      throw conflict(
        ERROR_CODES.CONFLICT,
        'Nobody is assigned to this booking. Assign who is doing it, then start it.',
      )
    }
    if (new Set(existing.services.map((s) => s.staffId)).size > 1) {
      throw conflict(
        ERROR_CODES.CONFLICT,
        'This booking names more than one person. Assign one person to all of it, then start it.',
      )
    }

    const result = await startBooking({
      bookingId: id,
      branchId,
      changedById: ctx.session.user.id,
    })
    if (!result.ok) {
      if (result.reason === 'membership_unavailable') {
        throw await membershipRefusal(existing.spaMembershipId, new Date())
      }
      // Their earlier work hasn't finished (MS-08): reception waits, or
      // assigns someone else. Nothing moves on its own. Once the booking is
      // held up past the grace, it is flagged for the dashboard and the
      // front desk is told (slice 2b); that is best-effort, so the refusal
      // stands either way.
      if (result.reason === 'staff_busy') {
        await raiseStaffOverruns({ bookingId: id }).catch((error: unknown) => {
          logger.warn('[bookings:start] could not flag the held-up booking', {
            bookingId: id,
            error: error instanceof Error ? error.message : String(error),
          })
        })
        const who = existing.services[0]?.staffName ?? 'The person assigned'
        throw conflict(
          ERROR_CODES.STAFF_BUSY,
          `${who} is still with another customer. Complete that booking first, or assign someone else to this one.`,
        )
      }
      if (result.reason === 'not_one_assignee') {
        throw conflict(
          ERROR_CODES.CONFLICT,
          'This booking names more than one person. Assign one person to all of it, then start it.',
        )
      }
      throw conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        'This booking was started or changed meanwhile. Reload it to see where it stands.',
      )
    }

    await publishBookingEvent({
      bookingId: id,
      branchId,
      customerId: existing.customerId,
      event: 'status_changed',
      data: { status: 'in_progress' },
    })

    return apiSuccess({ booking: result.booking })
  },
)
