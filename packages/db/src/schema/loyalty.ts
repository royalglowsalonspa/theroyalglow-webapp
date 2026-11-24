/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : loyalty
 * Scope        : Database Schema — Loyalty
 *
 * Description  : Defines loyalty (Gems) program tables for earning, redeeming,
 *                returning and expiring customer reward points, and which
 *                earned batch every spent gem came from (multi-branch R10).
 *
 * Responsibilities :
 * - Define loyalty_account table with balance and lifetime totals
 * - Define loyalty_transaction table for all gems movements
 * - Define loyalty_allocation: the batches a redemption spent, earliest
 *   expiry first, so each gem traces back to the branch that issued it
 * - Track gem expiration dates (365-day expiry from earn date)
 *
 * Features / Functionality :
 * - One loyalty account per customer (unique constraint); the balance can't
 *   go below zero
 * - Every earned transaction is a batch at the branch whose invoice earned it
 * - An expired row names the batch it expires; a returned row names the
 *   redemption it gives back, once
 * - Gems earned at 1 per ₹100 (floor) on service invoices only
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./booking,
 *                ./branch, ./enums, ./invoice
 *
 * Notes        : Gems cannot be combined with offers on the same booking.
 *                Redemption is against specific catalogue services, not ₹ discount.
 *                A batch's unspent gems are its amount minus its active
 *                allocations minus what has expired of it; the database refuses
 *                anything that would make that negative (migration 0022).
 ************************************************************/

import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { booking } from './booking'
import { branch } from './branch'
import { loyaltyTxTypeEnum } from './enums'
import { invoice } from './invoice'

export const loyaltyAccount = pgTable(
  'loyalty_account',
  {
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
  },
  (table) => [
    // A balance below zero was possible when expiry ignored spent gems
    // (settlement.md); it can't happen any more.
    check(
      'loyalty_account_balance_check',
      sql`${table.gemsBalance} >= 0 AND ${table.totalGemsEarned} >= 0 AND ${table.totalGemsRedeemed} >= 0`,
    ),
  ],
)

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
    // Positive for earned, redeemed and returned gems; negative for expired.
    gemsAmount: integer('gems_amount').notNull(),
    invoiceId: text('invoice_id').references(() => invoice.id, { onDelete: 'restrict' }),
    // Links a 'redeemed' transaction to the booking of the free service (the
    // ₹0 redemption booking, or the booking billed at checkout), and a
    // 'returned' one to the same booking. Lazy () => reference avoids a
    // circular import.
    bookingId: text('booking_id').references(() => booking.id, { onDelete: 'set null' }),
    // The branch of the movement: the invoice's branch for earned gems (the
    // batch's issuer), the booking's for redeemed and returned gems, the
    // batch's for expired gems. Only a manual adjustment may have none.
    branchId: text('branch_id').references(() => branch.id, { onDelete: 'restrict' }),
    // For an 'expired' row: the earned batch whose unspent gems it expires.
    batchId: text('batch_id').references((): AnyPgColumn => loyaltyTransaction.id, {
      onDelete: 'restrict',
    }),
    // For a 'returned' row: the redemption it gives back.
    redemptionId: text('redemption_id').references((): AnyPgColumn => loyaltyTransaction.id, {
      onDelete: 'restrict',
    }),
    description: text('description'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('loyalty_transaction_account_created_idx').on(table.loyaltyAccountId, table.createdAt),
    index('loyalty_transaction_expires_at_idx')
      .on(table.expiresAt)
      .where(sql`type = 'earned' AND expires_at IS NOT NULL`),
    index('loyalty_transaction_branch_created_idx').on(table.branchId, table.createdAt),
    index('loyalty_transaction_booking_idx').on(table.bookingId).where(sql`booking_id IS NOT NULL`),
    index('loyalty_transaction_batch_idx').on(table.batchId).where(sql`batch_id IS NOT NULL`),
    // A redemption is given back at most once.
    uniqueIndex('loyalty_transaction_returned_unique')
      .on(table.redemptionId)
      .where(sql`redemption_id IS NOT NULL`),
    check(
      'loyalty_transaction_amount_check',
      sql`CASE WHEN ${table.type} = 'expired' THEN ${table.gemsAmount} < 0 WHEN ${table.type} = 'adjusted' THEN ${table.gemsAmount} <> 0 ELSE ${table.gemsAmount} > 0 END`,
    ),
    // Compared as text: the 'returned' value is added in the same migration
    // transaction, where it can't be used as an enum literal yet.
    check(
      'loyalty_transaction_returned_check',
      sql`(${table.type}::text = 'returned') = (${table.redemptionId} IS NOT NULL)`,
    ),
    // Enforced once 0022 has backfilled the branches and batches (0023).
    check(
      'loyalty_transaction_branch_check',
      sql`${table.type} = 'adjusted' OR ${table.branchId} IS NOT NULL`,
    ),
    check(
      'loyalty_transaction_batch_check',
      sql`(${table.type} = 'expired') = (${table.batchId} IS NOT NULL)`,
    ),
  ],
)

// The batches a redemption spent: earliest expiry first, written in the same
// transaction that deducts the balance. A released allocation (the free
// service didn't happen) gives its gems back to the batch.
export const loyaltyAllocation = pgTable(
  'loyalty_allocation',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
    redemptionId: text('redemption_id')
      .notNull()
      .references(() => loyaltyTransaction.id, { onDelete: 'restrict' }),
    batchId: text('batch_id')
      .notNull()
      .references(() => loyaltyTransaction.id, { onDelete: 'restrict' }),
    gems: integer('gems').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    unique('loyalty_allocation_redemption_batch_unique').on(table.redemptionId, table.batchId),
    index('loyalty_allocation_active_batch_idx').on(table.batchId).where(sql`released_at IS NULL`),
    check('loyalty_allocation_gems_check', sql`${table.gems} > 0`),
  ],
)
