/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 05-06-2026
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
 * - Already-cancelled → BOOKING_ALREADY_CANCELLED (409); other terminal
 *   states → BOOKING_INVALID_STATUS_TRANSITION (409)
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

import { cancelBooking, getBookingByIdForCustomer } from '@rgss/db/queries'
import { conflict, ERROR_CODES, notFound } from '@rgss/errors'
import { cancelBookingSchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { publishBookingEvent } from '@/lib/realtime/publish'

const CANCELLABLE_STATUSES = new Set(['pending', 'confirmed'])

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireSession()
    const { id } = await ctx.params

    const existing = await getBookingByIdForCustomer(id, session.user.id)
    // Ownership is part of the query's WHERE clause, so a cross-customer lookup
    // is indistinguishable from a missing row — both map to 404 and never reveal
    // which booking ids exist.
    if (!existing) {
      throw notFound('Booking not found.')
    }

    if (!CANCELLABLE_STATUSES.has(existing.status)) {
      // Already-cancelled is its own conflict; every other terminal/active
      // state (completed, in_progress, no_show, rejected, rescheduled) is an
      // invalid status transition.
      if (existing.status === 'cancelled') {
        throw conflict(ERROR_CODES.BOOKING_ALREADY_CANCELLED, 'Booking is already cancelled.')
      }
      throw conflict(
        ERROR_CODES.BOOKING_INVALID_STATUS_TRANSITION,
        `Booking cannot be cancelled from status "${existing.status}".`,
      )
    }

    // Body is optional; tolerate an empty/missing payload.
    const raw = await req.json().catch(() => ({}))
    const parsed = cancelBookingSchema.safeParse(raw ?? {})
    const reason = parsed.success ? (parsed.data.reason ?? null) : null

    const updated = await cancelBooking(id, session.user.id, reason)
    if (!updated) {
      throw notFound('Booking not found.')
    }

    // Best-effort realtime publish: notify the booking channel and the per-branch
    // admin feed of the status change. publishBookingEvent no-ops without
    // ABLY_PRIVATE_KEY and never throws, so it can never break the cancel flow or
    // change its response. branchId comes from the owned booking row read above.
    await publishBookingEvent({
      bookingId: updated.id,
      branchId: existing.branchId,
      customerId: session.user.id,
      event: 'status_changed',
      data: { status: updated.status },
    })

    return apiSuccess({
      id: updated.id,
      status: updated.status,
      cancelledAt: updated.cancelledAt,
    })
  },
)
