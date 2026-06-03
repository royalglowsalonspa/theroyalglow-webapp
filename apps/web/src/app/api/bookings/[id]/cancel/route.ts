/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/bookings/[id]/cancel
 * Scope        : API — Customer Booking
 *
 * Description  : Allows authenticated customers to cancel their own bookings.
 *                Only pending or confirmed bookings can be cancelled.
 *
 * Responsibilities :
 * - Validate booking ownership and cancellable status
 * - Accept optional cancellation reason
 * - Transition booking to cancelled state
 *
 * Features / Functionality :
 * - Status guard (only pending/confirmed → cancelled)
 * - Optional cancellation reason capture
 * - Conflict error for non-cancellable statuses
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Body is optional; missing/empty payloads are tolerated.
 * - Returns 409 Conflict when booking is in a non-cancellable state.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { cancelBooking, getBookingById } from '@rgss/db/queries'
import { ERROR_CODES, conflict, notFound } from '@rgss/errors'
import { cancelBookingSchema } from '@rgss/types'

const CANCELLABLE_STATUSES = new Set(['pending', 'confirmed'])

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireSession()
    const { id } = await ctx.params

    const existing = await getBookingById(id)
    // Return 404 rather than 403 so we don't reveal which booking ids exist.
    if (!existing || existing.customerId !== session.user.id) {
      throw notFound('Booking not found.')
    }

    if (!CANCELLABLE_STATUSES.has(existing.status)) {
      throw conflict(
        ERROR_CODES.BOOKING_ALREADY_CANCELLED,
        `Booking cannot be cancelled from status "${existing.status}".`,
      )
    }

    // Body is optional; tolerate an empty/missing payload.
    const raw = await req.json().catch(() => ({}))
    const parsed = cancelBookingSchema.safeParse(raw ?? {})
    const reason = parsed.success ? (parsed.data.reason ?? null) : null

    const updated = await cancelBooking(id, reason)
    if (!updated) {
      throw notFound('Booking not found.')
    }

    return apiSuccess({
      id: updated.id,
      status: updated.status,
      cancelledAt: updated.cancelledAt,
    })
  },
)
