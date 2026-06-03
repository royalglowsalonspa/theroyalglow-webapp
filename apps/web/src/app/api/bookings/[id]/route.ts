/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/bookings/[id]
 * Scope        : API — Customer Booking
 *
 * Description  : Returns a single booking detail for the authenticated customer.
 *                Returns 404 for non-existent or non-owned bookings.
 *
 * Responsibilities :
 * - Authenticate the caller and extract booking ID from params
 * - Verify booking ownership (customer can only see their own)
 * - Return full booking detail with services and status
 *
 * Features / Functionality :
 * - Ownership-scoped booking retrieval
 * - 404 instead of 403 to avoid ID enumeration
 * - Full booking detail with service snapshots
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries, @rgss/errors
 *
 * Notes        :
 * - Returns 404 (not 403) for other users' bookings to prevent ID enumeration.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { getBookingById } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireSession()
    const { id } = await ctx.params

    const booking = await getBookingById(id)
    // Return 404 rather than 403 so we don't reveal which booking ids exist.
    if (!booking || booking.customerId !== session.user.id) {
      throw notFound('Booking not found.')
    }

    return apiSuccess({ booking })
  },
)
