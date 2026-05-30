import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { loyaltyTxTypeEnum } from './enums'
import { user } from './auth'
import { invoice } from './invoice'

export const loyaltyAccount = pgTable('loyalty_account', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  customerId: text('customer_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  gemsBalance: integer('gems_balance').notNull().default(0),
  totalGemsEarned: integer('total_gems_earned').notNull().default(0),
  totalGemsRedeemed: integer('total_gems_redeemed').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const loyaltyTransaction = pgTable('loyalty_transaction', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  loyaltyAccountId: text('loyalty_account_id').notNull().references(() => loyaltyAccount.id, { onDelete: 'restrict' }),
  type: loyaltyTxTypeEnum('type').notNull(),
  gemsAmount: integer('gems_amount').notNull(),
  invoiceId: text('invoice_id').references(() => invoice.id, { onDelete: 'restrict' }),
  description: text('description'),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('loyalty_transaction_account_created_idx').on(table.loyaltyAccountId, table.createdAt),
  index('loyalty_transaction_expires_at_idx').on(table.expiresAt).where(sql`type = 'earned' AND expires_at IS NOT NULL`),
])
