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
