/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/bookings/[id]
 * Scope        : API — Customer Booking
 *
 * Description  : Returns a single booking owned by the authenticated customer,
 *                including its service snapshot rows and lifecycle timestamps.
 *
 * Responsibilities :
 * - Validate session and booking ownership
 * - Return the full booking with services for the detail page
 *
 * Features / Functionality :
 * - Ownership check returns 404 (not 403) to avoid leaking booking-id existence
 * - Includes status timestamps (confirmed/completed/cancelled/rejected) for the
 *   client-rendered status timeline
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors
 *
 * Notes        : Read-only. Mutations live in ./cancel and ./reschedule.
 ************************************************************/

import { getBookingByIdForCustomer } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'
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

    return apiSuccess({ booking: existing })
  },
)
