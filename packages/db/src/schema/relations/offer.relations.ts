import { relations } from 'drizzle-orm'
import { offer, offerService, offerRedemption } from '../offer'
import { service } from '../service'
import { user } from '../auth'
import { booking } from '../booking'

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
