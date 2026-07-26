/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/offers
 * Scope        : API — Admin Offers
 *
 * Description  : Admin offers management. GET lists all offers (newest first);
 *                POST creates a new offer with linked services.
 *
 * Responsibilities :
 * - Return all offers with linked services for admin view (GET)
 * - Create new offer with discount rules and service links (POST)
 * - Generate URL-safe slug from offer name
 *
 * Features / Functionality :
 * - Admin offer list with service associations
 * - Offer creation (percentage, flat, combo_price types)
 * - Auto-generated unique slug (name + nanoid suffix)
 * - Date range for offer validity period
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types, nanoid
 *
 * Notes        :
 * - Requires min role: manager.
 * - Offers are salon-only (not SPA memberships).
 ************************************************************/

import { createOfferWithServices, getAllOffersAdmin } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { createOfferSchema } from '@rgss/types'
import { nanoid } from 'nanoid'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

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

// GET /api/offers — all offers (admin view), newest first, each with its
// linked services. Manager+.
export const GET = withErrorHandler(async () => {
  await requireRole('manager')

  const offers = await getAllOffersAdmin()
  return apiSuccess({ offers })
})

// POST /api/offers — create an offer + its service links. Manager+.
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
