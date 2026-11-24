/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : offers
 * Scope        : Data Access — Offers
 *
 * Description  : Reads of the app's offer mirror. Payload owns the offers
 *                (multi-branch offers.md): its sync writes `offer` and
 *                `offer_service`, and checkout records `offer_redemption`
 *                inside the completion batch (completeBookingWithInvoice).
 *
 * Responsibilities :
 * - The public list: live offers shown on the website
 * - The checkout list: live offers, counter-only ones included
 * - Every offer for the admin portal's read-only Offers page
 * - One offer by id, and a customer's redemption on an IST day
 *
 * Features / Functionality :
 * - Each offer carries its linked services (ids and names)
 * - "Live" = active and today's IST date within its dates, inclusive
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index, ../schema/offer, ../schema/service
 *
 * Notes        : Offers apply to salon services only. One offer per customer
 *                per IST day is enforced by the unique (customer_id,
 *                redeemed_date). The admin portal no longer writes offers
 *                (410); legacy rows it made have no `cms_id`.
 ************************************************************/

import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import { db } from '../index'
import { offer, offerRedemption, offerService } from '../schema/offer'
import { service } from '../schema/service'

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

async function withServices(rows: OfferRow[]) {
  if (rows.length === 0) {
    return []
  }
  const links = await getServicesForOffers(rows.map((o) => o.id))
  return rows.map((o) => attachServices(o, links))
}

/** Active, with today's IST date within its dates, inclusive. */
function liveOn(todayIST: string): SQL {
  return sql`${offer.isActive} AND ${offer.startDate} <= ${todayIST}::date AND ${offer.endDate} >= ${todayIST}::date`
}

/** 'YYYY-MM-DD' of `now` on the IST calendar. */
function istDate(now: Date): string {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// The public list (GET /api/offers): live offers shown on the website, in
// display order, each with its linked services. Counter-only rules
// (show_on_website false) never appear here.
export async function getActiveOffers(now: Date = new Date()) {
  const rows = await db
    .select()
    .from(offer)
    .where(and(liveOn(istDate(now)), eq(offer.showOnWebsite, true)))
    .orderBy(asc(offer.displayOrder))
  return withServices(rows)
}

// The offers checkout can apply now: live, counter-only ones included, each
// with its linked services. The route keeps those that save something on the
// booking (checkoutOfferChoices in @rgss/business).
export async function getOffersForCheckout(now: Date = new Date()) {
  const rows = await db
    .select()
    .from(offer)
    .where(liveOn(istDate(now)))
    .orderBy(asc(offer.displayOrder), asc(offer.name))
  return withServices(rows)
}

// All offers (admin view), newest first, each with its linked services.
export async function getAllOffersAdmin() {
  const rows = await db.select().from(offer).orderBy(desc(offer.createdAt))
  return withServices(rows)
}

// A single offer with its linked services, or null if not found.
export async function getOfferById(id: string) {
  const rows = await db.select().from(offer).where(eq(offer.id, id)).limit(1)
  const found = rows[0]
  if (!found) {
    return null
  }
  const [withLinks] = await withServices([found])
  return withLinks ?? null
}

// The customer's offer redemption on an IST calendar day ('YYYY-MM-DD'), or
// null: the checkout list says when the customer has used today's offer. The
// unique (customer_id, redeemed_date) is what enforces it, in the completion.
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
