import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { deactivateOffer, getOfferById, updateOffer } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { updateOfferSchema } from '@rgss/types'

// Convert a YYYY-MM-DD calendar date string to a UTC midnight Date for the
// date-mode column.
function toDateValue(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

// GET /api/admin/offers/[id] — single offer with its linked services. Manager+.
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

// PATCH /api/admin/offers/[id] — update offer fields or toggle active. Manager+.
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
