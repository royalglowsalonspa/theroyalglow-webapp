import { relations } from 'drizzle-orm'
import { booking, bookingService, bookingStatusLog, waitlist } from '../booking'
import { user } from '../auth'
import { branch } from '../branch'
import { service } from '../service'
import { staffProfile } from '../profile'
import { offer, offerRedemption } from '../offer'
import { spaMembership } from '../membership'
import { invoice } from '../invoice'
import { notification } from '../notification'

export const bookingRelations = relations(booking, ({ one, many }) => ({
  customer: one(user, { fields: [booking.customerId], references: [user.id] }),
  branch: one(branch, { fields: [booking.branchId], references: [branch.id] }),
  offer: one(offer, { fields: [booking.offerId], references: [offer.id] }),
  spaMembership: one(spaMembership, { fields: [booking.spaMembershipId], references: [spaMembership.id] }),
  services: many(bookingService),
  statusLogs: many(bookingStatusLog),
  invoice: one(invoice),
  notifications: many(notification),
  offerRedemption: one(offerRedemption),
}))

export const bookingServiceRelations = relations(bookingService, ({ one }) => ({
  booking: one(booking, { fields: [bookingService.bookingId], references: [booking.id] }),
  service: one(service, { fields: [bookingService.serviceId], references: [service.id] }),
  staff: one(staffProfile, { fields: [bookingService.staffId], references: [staffProfile.id] }),
}))

export const bookingStatusLogRelations = relations(bookingStatusLog, ({ one }) => ({
  booking: one(booking, { fields: [bookingStatusLog.bookingId], references: [booking.id] }),
  changedBy: one(user, { fields: [bookingStatusLog.changedById], references: [user.id] }),
}))

export const waitlistRelations = relations(waitlist, ({ one }) => ({
  customer: one(user, { fields: [waitlist.customerId], references: [user.id] }),
  service: one(service, { fields: [waitlist.serviceId], references: [service.id] }),
  preferredStaff: one(staffProfile, { fields: [waitlist.preferredStaffId], references: [staffProfile.id] }),
}))
