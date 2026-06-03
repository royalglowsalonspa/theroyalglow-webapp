/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : offer.relations
 * Scope        : Database Relations — Offer
 *
 * Description  : Defines Drizzle ORM relations for offer entities connecting
 *                offers to services, redemptions, and bookings.
 *
 * Responsibilities :
 * - Define offer relations to offer_services, redemptions, and bookings
 * - Define offerService relations to offer and service
 * - Define offerRedemption relations to offer, customer, and booking
 *
 * Features / Functionality :
 * - Offer has many linked services and redemption records
 * - Offer links to bookings that applied it
 * - Redemption tracks which customer used which offer on which booking
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../booking, ../offer, ../service
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { booking } from '../booking'
import { offer, offerRedemption, offerService } from '../offer'
import { service } from '../service'

export const offerRelations = relations(offer, ({ many }) => ({
  offerServices: many(offerService),
  offerRedemptions: many(offerRedemption),
  bookings: many(booking),
}))

export const offerServiceRelations = relations(offerService, ({ one }) => ({
  offer: one(offer, { fields: [offerService.offerId], references: [offer.id] }),
  service: one(service, { fields: [offerService.serviceId], references: [service.id] }),
}))

export const offerRedemptionRelations = relations(offerRedemption, ({ one }) => ({
  offer: one(offer, { fields: [offerRedemption.offerId], references: [offer.id] }),
  customer: one(user, { fields: [offerRedemption.customerId], references: [user.id] }),
  booking: one(booking, { fields: [offerRedemption.bookingId], references: [booking.id] }),
}))
