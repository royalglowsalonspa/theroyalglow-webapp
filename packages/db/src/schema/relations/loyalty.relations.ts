import { relations } from 'drizzle-orm'
import { loyaltyAccount, loyaltyTransaction } from '../loyalty'
import { user } from '../auth'
import { invoice } from '../invoice'

export const loyaltyAccountRelations = relations(loyaltyAccount, ({ one, many }) => ({
  customer: one(user, { fields: [loyaltyAccount.customerId], references: [user.id] }),
  transactions: many(loyaltyTransaction),
}))

export const loyaltyTransactionRelations = relations(loyaltyTransaction, ({ one }) => ({
  account: one(loyaltyAccount, { fields: [loyaltyTransaction.loyaltyAccountId], references: [loyaltyAccount.id] }),
  invoice: one(invoice, { fields: [loyaltyTransaction.invoiceId], references: [invoice.id] }),
}))
