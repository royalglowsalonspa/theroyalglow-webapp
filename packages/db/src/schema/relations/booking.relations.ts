/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : booking.relations
 * Scope        : Database Relations — Booking
 *
 * Description  : Defines Drizzle ORM relations for booking domain entities
 *                including booking, booking_service, status_log, and waitlist.
 *
 * Responsibilities :
 * - Define booking relations to customer, branch, services, invoice
 * - Define booking_service relations to booking, service, staff
 * - Define booking_status_log relations to booking and changed_by user
 * - Define waitlist relations to customer, service, preferred staff
 *
 * Features / Functionality :
 * - Booking connects to offer, spa_membership, and notifications
 * - Enables loading full booking details with nested includes
 * - Staff assignment tracked per booking_service row
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../booking, ../branch, ../invoice,
 *                ../membership, ../notification, ../offer, ../profile, ../service
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { booking, bookingService, bookingStatusLog, waitlist } from '../booking'
import { branch } from '../branch'
import { invoice } from '../invoice'
import { spaMembership } from '../membership'
import { notification } from '../notification'
import { offer, offerRedemption } from '../offer'
import { staffProfile } from '../profile'
import { service } from '../service'

export const bookingRelations = relations(booking, ({ one, many }) => ({
  customer: one(user, { fields: [booking.customerId], references: [user.id] }),
  branch: one(branch, { fields: [booking.branchId], references: [branch.id] }),
  offer: one(offer, { fields: [booking.offerId], references: [offer.id] }),
  spaMembership: one(spaMembership, {
    fields: [booking.spaMembershipId],
    references: [spaMembership.id],
  }),
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
  preferredStaff: one(staffProfile, {
    fields: [waitlist.preferredStaffId],
    references: [staffProfile.id],
  }),
}))
