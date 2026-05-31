import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { offer, offerRedemption, offerService } from '../schema/offer'
import { service } from '../schema/service'

type NewOffer = typeof offer.$inferInsert
type OfferType = (typeof offer.$inferSelect)['offerType']

type CreateOfferData = {
  name: string
  slug: string
  description?: string | null
  offerType: OfferType
  discountPercentage?: number | null
  discountAmountPaise?: number | null
  comboPricePaise?: number | null
  startDate: Date
  endDate: Date
  terms?: string | null
  displayOrder?: number
  serviceIds: string[]
}

type UpdateOfferData = {
  name?: string
  slug?: string
  description?: string | null
  offerType?: OfferType
  discountPercentage?: number | null
  discountAmountPaise?: number | null
  comboPricePaise?: number | null
  startDate?: Date
  endDate?: Date
  isActive?: boolean
  terms?: string | null
  displayOrder?: number
  serviceIds?: string[]
}

// Linked services (id + name) for a set of offer ids, ordered by the service's
// display order. Empty input → empty result. Used to attach `services` to each
// offer row without an N+1 query.
async function getServicesForOffers(offerIds: string[]) {
  if (offerIds.length === 0) {
    return []
  }
  return db
    .select({
      offerId: offerService.offerId,
      id: service.id,
      name: service.name,
    })
    .from(offerService)
    .innerJoin(service, eq(offerService.serviceId, service.id))
    .where(inArray(offerService.offerId, offerIds))
    .orderBy(asc(service.displayOrder))
}

type OfferRow = typeof offer.$inferSelect
type OfferServiceLink = { offerId: string; id: string; name: string }

// Flatten an offer row with its linked services, exposing the services as a
// `{ id, name }[]` plus convenience `serviceIds`/`serviceNames` arrays.
function attachServices(row: OfferRow, links: OfferServiceLink[]) {
  const services = links
    .filter((l) => l.offerId === row.id)
    .map((l) => ({ id: l.id, name: l.name }))
  return {
    ...row,
    services,
    serviceIds: services.map((s) => s.id),
    serviceNames: services.map((s) => s.name),
  }
}

// Active offers for the customer offers page: isActive AND the calendar date
// range includes `now`, ordered by display order. Each offer carries its linked
// service names. startDate/endDate are date-mode columns, so the comparison is
// by calendar date.
export async function getActiveOffers(now: Date = new Date()) {
  const offers = await db
    .select()
    .from(offer)
    .where(and(eq(offer.isActive, true), lte(offer.startDate, now), gte(offer.endDate, now)))
    .orderBy(asc(offer.displayOrder))

  if (offers.length === 0) {
    return []
  }

  const links = await getServicesForOffers(offers.map((o) => o.id))
  return offers.map((o) => attachServices(o, links))
}

// All offers (admin view), newest first, each with its linked services.
export async function getAllOffersAdmin() {
  const offers = await db.select().from(offer).orderBy(desc(offer.createdAt))

  if (offers.length === 0) {
    return []
  }

  const links = await getServicesForOffers(offers.map((o) => o.id))
  return offers.map((o) => attachServices(o, links))
}

// A single offer with its linked services, or null if not found.
export async function getOfferById(id: string) {
  const rows = await db.select().from(offer).where(eq(offer.id, id)).limit(1)
  const found = rows[0]
  if (!found) {
    return null
  }

  const links = await getServicesForOffers([found.id])
  return attachServices(found, links)
}

// Insert an offer + its offer_service rows atomically. neon-http has no
// interactive transactions, so we use db.batch() — one server-side transaction.
// The offer id is pre-generated so the offer_service rows can reference it within
// the batch. Returns the created offer.
export async function createOfferWithServices(data: CreateOfferData) {
  const offerId = nanoid()
  const offerValues: NewOffer = {
    id: offerId,
    name: data.name,
    slug: data.slug,
    description: data.description ?? null,
    offerType: data.offerType,
    discountPercentage: data.discountPercentage ?? null,
    discountAmountPaise: data.discountAmountPaise ?? null,
    comboPricePaise: data.comboPricePaise ?? null,
    startDate: data.startDate,
    endDate: data.endDate,
    terms: data.terms ?? null,
    displayOrder: data.displayOrder ?? 0,
  }
  const insertOffer = db.insert(offer).values(offerValues).returning()

  if (data.serviceIds.length === 0) {
    const [created] = await insertOffer
    return created as typeof offer.$inferSelect
  }

  const offerServiceValues = data.serviceIds.map((serviceId) => ({ offerId, serviceId }))
  const [offerResult] = await db.batch([
    insertOffer,
    db.insert(offerService).values(offerServiceValues),
  ])

  return offerResult[0] as typeof offer.$inferSelect
}

// Update an offer's columns present in `patch`. When `serviceIds` is supplied,
// the offer_service set is fully replaced (delete existing then insert the new
// set) atomically via db.batch(). Returns the updated offer, or null if no offer
// exists with that id.
export async function updateOffer(id: string, patch: UpdateOfferData) {
  const { serviceIds, ...offerPatch } = patch
  const hasOfferUpdates = Object.values(offerPatch).some((value) => value !== undefined)

  let updated: typeof offer.$inferSelect | null
  if (hasOfferUpdates) {
    const [row] = await db.update(offer).set(offerPatch).where(eq(offer.id, id)).returning()
    updated = row ?? null
  } else {
    const rows = await db.select().from(offer).where(eq(offer.id, id)).limit(1)
    updated = rows[0] ?? null
  }

  if (!updated) {
    return null
  }

  if (serviceIds) {
    if (serviceIds.length > 0) {
      await db.batch([
        db.delete(offerService).where(eq(offerService.offerId, id)),
        db
          .insert(offerService)
          .values(serviceIds.map((serviceId) => ({ offerId: id, serviceId }))),
      ])
    } else {
      await db.delete(offerService).where(eq(offerService.offerId, id))
    }
  }

  return updated
}

// Soft-disable an offer by clearing its active flag. Returns the updated row, or
// null if no offer exists with that id.
export async function deactivateOffer(id: string) {
  const [updated] = await db
    .update(offer)
    .set({ isActive: false })
    .where(eq(offer.id, id))
    .returning()

  return updated ?? null
}

// The customer's offer redemption for a given calendar date, or null. Backs the
// one-offer-per-customer-per-day pre-check. redeemedDate is a date-mode column,
// so the comparison is by calendar date.
export async function getOfferRedemptionForCustomerOnDate(customerId: string, dateISO: string) {
  const rows = await db
    .select()
    .from(offerRedemption)
    .where(
      and(
        eq(offerRedemption.customerId, customerId),
        eq(offerRedemption.redeemedDate, new Date(`${dateISO}T00:00:00.000Z`)),
      ),
    )
    .limit(1)

  return rows[0] ?? null
}

// Record an offer redemption for a customer on a calendar date. The DB unique
// constraint on (customer_id, redeemed_date) enforces one offer per customer per
// day. Returns the created row.
export async function recordOfferRedemption(
  offerId: string,
  customerId: string,
  bookingId: string,
  dateISO: string,
) {
  const [created] = await db
    .insert(offerRedemption)
    .values({
      offerId,
      customerId,
      bookingId,
      redeemedDate: new Date(`${dateISO}T00:00:00.000Z`),
    })
    .returning()

  return created as typeof offerRedemption.$inferSelect
}
