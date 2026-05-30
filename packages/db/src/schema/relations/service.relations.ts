import { relations } from 'drizzle-orm'
import { serviceCategory, service, staffService } from '../service'
import { staffProfile } from '../profile'
import { bookingService } from '../booking'
import { offerService } from '../offer'
import { invoiceItem } from '../invoice'

export const serviceCategoryRelations = relations(serviceCategory, ({ many }) => ({
  services: many(service),
}))

export const serviceRelations = relations(service, ({ one, many }) => ({
  category: one(serviceCategory, { fields: [service.categoryId], references: [serviceCategory.id] }),
  staffServices: many(staffService),
  bookingServices: many(bookingService),
  offerServices: many(offerService),
  invoiceItems: many(invoiceItem),
}))

export const staffServiceRelations = relations(staffService, ({ one }) => ({
  staff: one(staffProfile, { fields: [staffService.staffId], references: [staffProfile.id] }),
  service: one(service, { fields: [staffService.serviceId], references: [service.id] }),
}))
