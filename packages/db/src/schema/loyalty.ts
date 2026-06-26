/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : loyalty
 * Scope        : Database Schema — Loyalty
 *
 * Description  : Defines loyalty (Gems) program tables for earning, redeeming,
 *                and expiring customer reward points.
 *
 * Responsibilities :
 * - Define loyalty_account table with balance and lifetime totals
 * - Define loyalty_transaction table for all gems movements
 * - Support 4 transaction types: earned, redeemed, expired, adjusted
 * - Track gem expiration dates (365-day expiry from earn date)
 *
 * Features / Functionality :
 * - One loyalty account per customer (unique constraint)
 * - Composite index on account + created_at for transaction history
 * - Partial index on expirable earned transactions for cron job
 * - Gems earned at 1 per ₹100 (floor) on service invoices only
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./enums,
 *                ./invoice
 *
 * Notes        : Gems cannot be combined with offers on the same booking.
 *                Redemption is against specific catalogue services, not ₹ discount.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { booking } from './booking'
import { loyaltyTxTypeEnum } from './enums'
import { invoice } from './invoice'

export const loyaltyAccount = pgTable('loyalty_account', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  customerId: text('customer_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  gemsBalance: integer('gems_balance').notNull().default(0),
  totalGemsEarned: integer('total_gems_earned').notNull().default(0),
  totalGemsRedeemed: integer('total_gems_redeemed').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const loyaltyTransaction = pgTable(
  'loyalty_transaction',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    loyaltyAccountId: text('loyalty_account_id')
      .notNull()
      .references(() => loyaltyAccount.id, { onDelete: 'restrict' }),
    type: loyaltyTxTypeEnum('type').notNull(),
    gemsAmount: integer('gems_amount').notNull(),
    invoiceId: text('invoice_id').references(() => invoice.id, { onDelete: 'restrict' }),
    // Links a 'redeemed' transaction to the ₹0 booking it created (null for
    // earned/expired/adjusted). Lazy () => reference avoids a circular import.
    bookingId: text('booking_id').references(() => booking.id, { onDelete: 'set null' }),
    description: text('description'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('loyalty_transaction_account_created_idx').on(table.loyaltyAccountId, table.createdAt),
    index('loyalty_transaction_expires_at_idx')
      .on(table.expiresAt)
      .where(sql`type = 'earned' AND expires_at IS NOT NULL`),
  ],
)
