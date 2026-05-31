import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { createOfferWithServices, getAllOffersAdmin } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { createOfferSchema } from '@rgss/types'
import { nanoid } from 'nanoid'

// Derive a URL-safe slug from an offer name: lowercase, spaces → hyphens, strip
// any character that is not alphanumeric or a hyphen, collapse repeated hyphens,
// and append a short nanoid suffix so concurrent offers with the same name never
// collide on the unique slug column.
function deriveSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${base || 'offer'}-${nanoid(6)}`
}

// Convert a YYYY-MM-DD calendar date string to a UTC midnight Date for the
// date-mode column.
function toDateValue(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

// GET /api/admin/offers — all offers (admin view), newest first, each with its
// linked services. Manager+.
export const GET = withErrorHandler(async () => {
  await requireRole('manager')

  const offers = await getAllOffersAdmin()
  return apiSuccess({ offers })
})

// POST /api/admin/offers — create an offer + its service links. Manager+.
// Discount fields are already paise (discountAmountPaise, comboPricePaise) and a
// percentage, validated by the schema to match the chosen offer type.
export const POST = withErrorHandler(async (req: Request) => {
  await requireRole('manager')

  const body = await req.json().catch(() => null)
  const parsed = createOfferSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  const data = parsed.data

  const offer = await createOfferWithServices({
    name: data.name,
    slug: deriveSlug(data.name),
    description: data.description ?? null,
    offerType: data.offerType,
    discountPercentage: data.discountPercentage ?? null,
    discountAmountPaise: data.discountAmountPaise ?? null,
    comboPricePaise: data.comboPricePaise ?? null,
    startDate: toDateValue(data.startDate),
    endDate: toDateValue(data.endDate),
    terms: data.terms ?? null,
    serviceIds: data.serviceIds,
  })

  return apiSuccess({ offer }, undefined, 201)
})
