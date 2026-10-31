/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/bookings/[id]
 * Scope        : API — Customer Booking
 *
 * Description  : Returns a single booking owned by the authenticated customer,
 *                including its service snapshot rows and lifecycle timestamps,
 *                and what the customer may do with it now under its branch's
 *                booking rules (R6.3).
 *
 * Responsibilities :
 * - Validate session and booking ownership
 * - Return the full booking with services for the detail page
 * - Return the cancellation and reschedule terms: whether cancelling now is
 *   late, and whether (and how many more times) it can be rescheduled
 *
 * Features / Functionality :
 * - Ownership check returns 404 (not 403) to avoid leaking booking-id existence
 * - Includes status timestamps (confirmed/completed/cancelled/rejected) for the
 *   client-rendered status timeline
 * - Response: { booking, terms: BookingTerms | null }
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/business,
 *                @rgss/db/queries, @rgss/errors
 *
 * Notes        : Read-only. Mutations live in ./cancel and ./reschedule.
 *                `terms` is null when the branch's settings can't be read;
 *                the actions then answer for themselves.
 ************************************************************/

import { appointmentStartsAt, type BookingTerms, bookingTerms } from '@rgss/business'
import { getBookingByIdForCustomer, getBranchPolicy } from '@rgss/db/queries'
import { AppError, ERROR_CODES, notFound } from '@rgss/errors'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireSession()
    const { id } = await ctx.params

    // Ownership is enforced in the WHERE clause, so a cross-customer lookup is
    // indistinguishable from a missing row — both map to 404 and never reveal
    // which booking ids exist.
    const existing = await getBookingByIdForCustomer(id, session.user.id)
    if (!existing) {
      throw notFound('Booking not found.')
    }

    let terms: BookingTerms | null = null
    try {
      const policy = await getBranchPolicy(existing.branchId)
      if (policy) {
        terms = bookingTerms({
          rules: policy.bookingRules,
          status: existing.status,
          rescheduleCount: existing.rescheduleCount,
          startsAt: appointmentStartsAt(
            existing.bookingDate.toISOString().slice(0, 10),
            existing.startTime,
          ),
          now: new Date(),
        })
      }
    } catch (error) {
      if (!(error instanceof AppError && error.code === ERROR_CODES.BRANCH_SETTINGS_INCOMPLETE)) {
        throw error
      }
    }

    return apiSuccess({ booking: existing, terms })
  },
)
