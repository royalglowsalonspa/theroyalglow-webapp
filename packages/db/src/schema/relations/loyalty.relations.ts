/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : loyalty.relations
 * Scope        : Database Relations — Loyalty
 *
 * Description  : Defines Drizzle ORM relations for loyalty program entities
 *                connecting accounts to customers and transactions to invoices.
 *
 * Responsibilities :
 * - Define loyaltyAccount relations to customer and transactions
 * - Define loyaltyTransaction relations to account and invoice
 *
 * Features / Functionality :
 * - Loyalty account has many transactions (earned, redeemed, expired)
 * - Each transaction optionally links to the triggering invoice
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../invoice, ../loyalty
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { invoice } from '../invoice'
import { loyaltyAccount, loyaltyTransaction } from '../loyalty'

export const loyaltyAccountRelations = relations(loyaltyAccount, ({ one, many }) => ({
  customer: one(user, { fields: [loyaltyAccount.customerId], references: [user.id] }),
  transactions: many(loyaltyTransaction),
}))

export const loyaltyTransactionRelations = relations(loyaltyTransaction, ({ one }) => ({
  account: one(loyaltyAccount, {
    fields: [loyaltyTransaction.loyaltyAccountId],
    references: [loyaltyAccount.id],
  }),
  invoice: one(invoice, { fields: [loyaltyTransaction.invoiceId], references: [invoice.id] }),
}))
