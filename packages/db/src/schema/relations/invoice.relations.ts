import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { booking } from '../booking'
import { branch } from '../branch'
import { invoice, invoiceItem } from '../invoice'
import { loyaltyTransaction } from '../loyalty'
import { service } from '../service'

export const invoiceRelations = relations(invoice, ({ one, many }) => ({
  branch: one(branch, { fields: [invoice.branchId], references: [branch.id] }),
  booking: one(booking, { fields: [invoice.bookingId], references: [booking.id] }),
  customer: one(user, { fields: [invoice.customerId], references: [user.id] }),
  gemsRedeemedService: one(service, {
    fields: [invoice.gemsRedeemedServiceId],
    references: [service.id],
  }),
  items: many(invoiceItem),
  loyaltyTransactions: many(loyaltyTransaction),
}))

export const invoiceItemRelations = relations(invoiceItem, ({ one }) => ({
  invoice: one(invoice, { fields: [invoiceItem.invoiceId], references: [invoice.id] }),
  service: one(service, { fields: [invoiceItem.serviceId], references: [service.id] }),
}))
