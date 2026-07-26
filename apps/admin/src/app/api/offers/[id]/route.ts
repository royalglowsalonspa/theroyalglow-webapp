/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|PATCH /api/offers/[id]
 * Scope        : API — Admin Offers
 *
 * Description  : Admin offer detail and update. GET returns a single offer;
 *                PATCH updates fields or toggles active status.
 *
 * Responsibilities :
 * - Return single offer with linked services (GET)
 * - Update offer fields and service links (PATCH)
 * - Support offer deactivation toggle
 *
 * Features / Functionality :
 * - Offer detail retrieval with service links
 * - Partial update (name, dates, discount, services, active flag)
 * - Quick deactivation via `{ isActive: false }` shorthand
 * - Date conversion for start/end date fields
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: manager.
 * - Deactivated offers stop appearing on the public /api/offers endpoint.
 ************************************************************/

import { deactivateOffer, getOfferById, updateOffer } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { updateOfferSchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

// Convert a YYYY-MM-DD calendar date string to a UTC midnight Date for the
// date-mode column.
function toDateValue(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

// GET /api/offers/[id] — single offer with its linked services. Manager+.
export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('manager')
    const { id } = await ctx.params

    const offer = await getOfferById(id)
    if (!offer) {
      throw notFound('Offer not found.')
    }

    return apiSuccess({ offer })
  },
)

// PATCH /api/offers/[id] — update offer fields or toggle active. Manager+.
// A bare `{ isActive: false }` deactivates via the dedicated query; any other
// combination maps the provided fields (dates converted to Date) and updates.
export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('manager')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = updateOfferSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    const data = parsed.data

    // Pure deactivation toggle: `{ isActive: false }` with no other fields.
    const otherKeys = Object.keys(data).filter((key) => key !== 'isActive')
    if (data.isActive === false && otherKeys.length === 0) {
      const offer = await deactivateOffer(id)
      if (!offer) {
        throw notFound('Offer not found.')
      }
      return apiSuccess({ offer })
    }

    const patch: Parameters<typeof updateOffer>[1] = {}
    if (data.name !== undefined) {
      patch.name = data.name
    }
    if (data.description !== undefined) {
      patch.description = data.description
    }
    if (data.offerType !== undefined) {
      patch.offerType = data.offerType
    }
    if (data.discountPercentage !== undefined) {
      patch.discountPercentage = data.discountPercentage
    }
    if (data.discountAmountPaise !== undefined) {
      patch.discountAmountPaise = data.discountAmountPaise
    }
    if (data.comboPricePaise !== undefined) {
      patch.comboPricePaise = data.comboPricePaise
    }
    if (data.startDate !== undefined) {
      patch.startDate = toDateValue(data.startDate)
    }
    if (data.endDate !== undefined) {
      patch.endDate = toDateValue(data.endDate)
    }
    if (data.terms !== undefined) {
      patch.terms = data.terms
    }
    if (data.serviceIds !== undefined) {
      patch.serviceIds = data.serviceIds
    }
    if (data.isActive !== undefined) {
      patch.isActive = data.isActive
    }

    const offer = await updateOffer(id, patch)
    if (!offer) {
      throw notFound('Offer not found.')
    }

    return apiSuccess({ offer })
  },
)
