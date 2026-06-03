/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoice.relations
 * Scope        : Database Relations — Invoice
 *
 * Description  : Defines Drizzle ORM relations for invoice entities connecting
 *                invoices to branches, bookings, customers, and line items.
 *
 * Responsibilities :
 * - Define invoice relations to branch, booking, customer, items
 * - Define invoiceItem relations to invoice and service
 * - Link invoice to loyalty transactions for gems tracking
 *
 * Features / Functionality :
 * - Invoice connects to gems-redeemed service reference
 * - Invoice has many items and loyalty transactions
 * - InvoiceItem links back to the service catalogue entry
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../booking, ../branch, ../invoice,
 *                ../loyalty, ../service
 *
 * Notes        : None
 ************************************************************/

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
