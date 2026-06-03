/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : service.relations
 * Scope        : Database Relations — Service
 *
 * Description  : Defines Drizzle ORM relations for service catalog entities
 *                connecting categories, services, and staff capabilities.
 *
 * Responsibilities :
 * - Define serviceCategory relations to its services
 * - Define service relations to category, staff, bookings, offers, invoices
 * - Define staffService relations to staff profile and service
 *
 * Features / Functionality :
 * - Category has many services grouped under it
 * - Service connects to booking_services, offer_services, and invoice_items
 * - StaffService maps which staff can perform which services
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../booking, ../invoice, ../offer, ../profile,
 *                ../service
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { bookingService } from '../booking'
import { invoiceItem } from '../invoice'
import { offerService } from '../offer'
import { staffProfile } from '../profile'
import { service, serviceCategory, staffService } from '../service'

export const serviceCategoryRelations = relations(serviceCategory, ({ many }) => ({
  services: many(service),
}))

export const serviceRelations = relations(service, ({ one, many }) => ({
  category: one(serviceCategory, {
    fields: [service.categoryId],
    references: [serviceCategory.id],
  }),
  staffServices: many(staffService),
  bookingServices: many(bookingService),
  offerServices: many(offerService),
  invoiceItems: many(invoiceItem),
}))

export const staffServiceRelations = relations(staffService, ({ one }) => ({
  staff: one(staffProfile, { fields: [staffService.staffId], references: [staffProfile.id] }),
  service: one(service, { fields: [staffService.serviceId], references: [service.id] }),
}))
