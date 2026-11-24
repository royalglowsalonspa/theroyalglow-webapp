/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-11-2026 & Updated - 21-11-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/bookings/[id]/offers
 * Scope        : API — Admin Booking checkout
 *
 * Description  : The offers checkout can apply to a booking at the active
 *                branch, with what each saves (multi-branch offers.md, R4.5).
 *                Payload owns the offers; this reads the app's mirror.
 *
 * Responsibilities :
 * - 404 for a booking at another branch
 * - Live offers (active, today in IST within their dates), counter-only
 *   ones included, that save something on the booking's lines; best first
 * - None, with the reason, for a SPA booking, a membership session, a
 *   booking made with gems, or a customer who used an offer today
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @rgss/business, @rgss/db/queries, @rgss/errors
 *
 * Notes        :
 * - Receptionist or above at the active branch.
 * - Advisory: POST /api/bookings/[id]/complete revalidates the offer and the
 *   one-a-day rule as it writes.
 ************************************************************/

import { checkoutOfferChoices, istToday } from '@rgss/business'
import {
  getBookingForAdmin,
  getOfferRedemptionForCustomerOnDate,
  getOffersForCheckout,
} from '@rgss/db/queries'
import { notFound } from '@rgss/errors'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(
  async (_req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const existing = await getBookingForAdmin(id, ctx.branch.id)
    if (!existing) {
      throw notFound('Booking not found.')
    }

    // Offers apply to salon bookings paid for in money only.
    const note = existing.isMembershipSession
      ? 'A membership session takes no offer.'
      : existing.isGemsRedemption
        ? 'A booking made with gems takes no offer.'
        : existing.serviceType !== 'salon'
          ? 'Offers apply to salon bookings only.'
          : null
    if (note) {
      return apiSuccess({ offers: [], usedOfferToday: false, note })
    }

    const now = new Date()
    const [offers, usedToday] = await Promise.all([
      getOffersForCheckout(now),
      getOfferRedemptionForCustomerOnDate(existing.customerId, istToday(now)),
    ])
    if (usedToday) {
      return apiSuccess({
        offers: [],
        usedOfferToday: true,
        note: 'This customer has already used an offer today.',
      })
    }

    const choices = checkoutOfferChoices({
      offers,
      lines: existing.services.map((s) => ({
        serviceId: s.serviceId,
        grossPaise: s.priceAtBookingPaise,
      })),
      serviceType: existing.serviceType,
      now,
    })
    return apiSuccess({
      offers: choices,
      usedOfferToday: false,
      note: choices.length === 0 ? 'No offer applies to this booking today.' : null,
    })
  },
)
