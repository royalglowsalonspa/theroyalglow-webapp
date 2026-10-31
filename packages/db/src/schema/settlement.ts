/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : settlement
 * Scope        : Database Schema — cross-branch settlement (R10)
 *
 * Description  : What branches owe each other when a customer uses SPA
 *                membership hours or spends gems at a branch other than the
 *                one that took the money or issued the gems (settlement.md).
 *                Entries are recorded as the service is delivered; each IST
 *                calendar month closes into one statement per pair of
 *                branches and one net position per branch.
 *
 * Responsibilities :
 * - settlement_period: one row per IST month with entries; closed once
 * - settlement_entry: the ledger, one entry per session booking and per
 *   (redemption, earning branch); corrections are reversing entries
 * - branch_settlement: a closed month's statement for a pair of branches,
 *   with what each owes the other, the net, and its payment once paid
 * - settlement_position: each branch's net across all its counterparts
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, ./auth, ./booking,
 *                ./branch, ./enums, ./loyalty, ./membership
 *
 * Notes        :
 * - Amounts are paise in 64-bit integers. An entry stores the share and value
 *   per gem it used, so a later settings change affects later entries only.
 * - The database, not the caller, picks an entry's month: the IST month it
 *   is recorded in, or the next open one when that month has closed (0022).
 * - Entries, statements and positions never change; a statement only gains
 *   its payment, once. A statement's entries are its month's entries between
 *   its two branches; internal entries (one branch both ways) are in none.
 * - Branch pairs are ordered by byte value (COLLATE "C"), the same order the
 *   application uses.
 ************************************************************/

import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { booking } from './booking'
import { branch } from './branch'
import { settlementEntryKindEnum } from './enums'
import { loyaltyTransaction } from './loyalty'
import { spaMembership } from './membership'

// The IST calendar month an entry is recorded in.
const IST_MONTH = sql`(date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')))::date`

export const settlementPeriod = pgTable(
  'settlement_period',
  {
    // The first day of the IST month.
    month: date('month', { mode: 'string' }).primaryKey(),
    // Set once by the close; entries recorded later go to the next month.
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [check('settlement_period_month_check', sql`extract(day from ${table.month}) = 1`)],
)

export const settlementEntry = pgTable(
  'settlement_entry',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
    kind: settlementEntryKindEnum('kind').notNull(),
    // Chosen by the database when the entry is recorded (0022 trigger).
    postingMonth: date('posting_month', { mode: 'string' })
      .notNull()
      .default(IST_MONTH)
      .references(() => settlementPeriod.month, { onDelete: 'restrict' }),
    // The branch that took the money or issued the gems, and the branch that
    // delivered the service. The same branch both ways is an internal entry.
    owingBranchId: text('owing_branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'restrict' }),
    owedBranchId: text('owed_branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'restrict' }),
    spaMembershipId: text('spa_membership_id').references(() => spaMembership.id, {
      onDelete: 'restrict',
    }),
    // The booking the service was delivered on.
    bookingId: text('booking_id').references(() => booking.id, { onDelete: 'restrict' }),
    // For gems: the redemption whose gems were spent.
    loyaltyTransactionId: text('loyalty_transaction_id').references(() => loyaltyTransaction.id, {
      onDelete: 'restrict',
    }),
    // For a correction: the entry it reverses, once.
    reversesEntryId: text('reverses_entry_id').references((): AnyPgColumn => settlementEntry.id, {
      onDelete: 'restrict',
    }),
    minutes: integer('minutes'),
    gems: integer('gems'),
    // What the service was worth, the part of it that was GST the selling
    // branch already collected, and what the owing branch owes at the share.
    valuePaise: bigint('value_paise', { mode: 'number' }).notNull(),
    gstSharePaise: bigint('gst_share_paise', { mode: 'number' }).notNull().default(0),
    amountOwedPaise: bigint('amount_owed_paise', { mode: 'number' }).notNull(),
    shareBps: integer('share_bps').notNull(),
    gemValuePaise: integer('gem_value_paise'),
    // Why a correction was made.
    note: text('note'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // One entry per session booking; a retried completion adds nothing.
    uniqueIndex('settlement_entry_session_unique')
      .on(table.bookingId)
      .where(sql`kind = 'membership_session'`),
    // One entry per redemption and earning branch (ST-02).
    uniqueIndex('settlement_entry_gems_unique')
      .on(table.loyaltyTransactionId, table.owingBranchId)
      .where(sql`kind = 'gems_redemption'`),
    uniqueIndex('settlement_entry_reversal_unique')
      .on(table.reversesEntryId)
      .where(sql`reverses_entry_id IS NOT NULL`),
    index('settlement_entry_month_pair_idx').on(
      table.postingMonth,
      table.owingBranchId,
      table.owedBranchId,
    ),
    index('settlement_entry_owed_month_idx').on(table.owedBranchId, table.postingMonth),
    index('settlement_entry_membership_idx')
      .on(table.spaMembershipId)
      .where(sql`spa_membership_id IS NOT NULL`),
    index('settlement_entry_booking_idx').on(table.bookingId).where(sql`booking_id IS NOT NULL`),
    check('settlement_entry_share_check', sql`${table.shareBps} BETWEEN 0 AND 10000`),
    // Integer division truncates toward zero, so a reversal (all negated)
    // satisfies the same formula as the entry it reverses.
    check(
      'settlement_entry_amount_check',
      sql`${table.amountOwedPaise} = ((${table.valuePaise} - ${table.gstSharePaise}) * ${table.shareBps}) / 10000`,
    ),
    // A session's GST share is not capped at its value: both are floor
    // differences, so on a membership worth under a paisa a minute one
    // session's share can exceed its value by a paisa. The membership's
    // entries still add up exactly (0024).
    check(
      'settlement_entry_shape_check',
      sql`CASE ${table.kind}
        WHEN 'membership_session' THEN
          ${table.spaMembershipId} IS NOT NULL AND ${table.bookingId} IS NOT NULL
          AND ${table.minutes} > 0 AND ${table.gems} IS NULL AND ${table.gemValuePaise} IS NULL
          AND ${table.loyaltyTransactionId} IS NULL AND ${table.reversesEntryId} IS NULL
          AND ${table.valuePaise} >= 0 AND ${table.gstSharePaise} >= 0
        WHEN 'gems_redemption' THEN
          ${table.loyaltyTransactionId} IS NOT NULL AND ${table.bookingId} IS NOT NULL
          AND ${table.gems} > 0 AND ${table.gemValuePaise} > 0 AND ${table.minutes} IS NULL
          AND ${table.spaMembershipId} IS NULL AND ${table.reversesEntryId} IS NULL
          AND ${table.valuePaise} = ${table.gems}::bigint * ${table.gemValuePaise}
          AND ${table.gstSharePaise} = 0
        WHEN 'reversal' THEN
          ${table.reversesEntryId} IS NOT NULL AND ${table.note} IS NOT NULL
          AND length(btrim(${table.note})) > 0
          AND ${table.valuePaise} <= 0 AND ${table.gstSharePaise} <= 0
        ELSE false
      END`,
    ),
  ],
)

export const branchSettlement = pgTable(
  'branch_settlement',
  {
    id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
    month: date('month', { mode: 'string' })
      .notNull()
      .references(() => settlementPeriod.month, { onDelete: 'restrict' }),
    // The pair, in byte order: branch_a_id sorts first.
    branchAId: text('branch_a_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'restrict' }),
    branchBId: text('branch_b_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'restrict' }),
    // What A owes B: for memberships (amount owed, with the sessions' value
    // and GST share, TX-12) and for gems.
    aOwesBMembershipPaise: bigint('a_owes_b_membership_paise', { mode: 'number' }).notNull(),
    aOwesBMembershipValuePaise: bigint('a_owes_b_membership_value_paise', {
      mode: 'number',
    }).notNull(),
    aOwesBMembershipGstPaise: bigint('a_owes_b_membership_gst_paise', { mode: 'number' }).notNull(),
    aOwesBGemsPaise: bigint('a_owes_b_gems_paise', { mode: 'number' }).notNull(),
    // What B owes A, the same way.
    bOwesAMembershipPaise: bigint('b_owes_a_membership_paise', { mode: 'number' }).notNull(),
    bOwesAMembershipValuePaise: bigint('b_owes_a_membership_value_paise', {
      mode: 'number',
    }).notNull(),
    bOwesAMembershipGstPaise: bigint('b_owes_a_membership_gst_paise', { mode: 'number' }).notNull(),
    bOwesAGemsPaise: bigint('b_owes_a_gems_paise', { mode: 'number' }).notNull(),
    // Who pays whom the difference; both null when it nets to zero.
    payingBranchId: text('paying_branch_id').references(() => branch.id, { onDelete: 'restrict' }),
    receivingBranchId: text('receiving_branch_id').references(() => branch.id, {
      onDelete: 'restrict',
    }),
    netPaise: bigint('net_paise', { mode: 'number' }).notNull(),
    entryCount: integer('entry_count').notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }).notNull(),
    // The payment, recorded once by the paying branch's Owner or the
    // Developer. The money moves outside the system.
    paidOn: date('paid_on', { mode: 'string' }),
    paymentReference: text('payment_reference'),
    // One Owner owns both branches: the money moved between their accounts.
    internalTransfer: boolean('internal_transfer').notNull().default(false),
    paidRecordedBy: text('paid_recorded_by').references(() => user.id, { onDelete: 'restrict' }),
    paidRecordedAt: timestamp('paid_recorded_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    unique('branch_settlement_month_pair_unique').on(table.month, table.branchAId, table.branchBId),
    index('branch_settlement_branch_a_idx').on(table.branchAId, table.month),
    index('branch_settlement_branch_b_idx').on(table.branchBId, table.month),
    check(
      'branch_settlement_pair_check',
      sql`${table.branchAId} COLLATE "C" < ${table.branchBId} COLLATE "C"`,
    ),
    check('branch_settlement_entries_check', sql`${table.entryCount} > 0`),
    check(
      'branch_settlement_net_check',
      sql`${table.netPaise} = abs((${table.aOwesBMembershipPaise} + ${table.aOwesBGemsPaise}) - (${table.bOwesAMembershipPaise} + ${table.bOwesAGemsPaise}))
        AND CASE
          WHEN (${table.aOwesBMembershipPaise} + ${table.aOwesBGemsPaise}) > (${table.bOwesAMembershipPaise} + ${table.bOwesAGemsPaise})
            THEN ${table.payingBranchId} IS NOT DISTINCT FROM ${table.branchAId}
             AND ${table.receivingBranchId} IS NOT DISTINCT FROM ${table.branchBId}
          WHEN (${table.aOwesBMembershipPaise} + ${table.aOwesBGemsPaise}) < (${table.bOwesAMembershipPaise} + ${table.bOwesAGemsPaise})
            THEN ${table.payingBranchId} IS NOT DISTINCT FROM ${table.branchBId}
             AND ${table.receivingBranchId} IS NOT DISTINCT FROM ${table.branchAId}
          ELSE ${table.payingBranchId} IS NULL AND ${table.receivingBranchId} IS NULL
        END`,
    ),
    check(
      'branch_settlement_paid_check',
      sql`(${table.paidOn} IS NULL AND ${table.paymentReference} IS NULL
           AND ${table.paidRecordedBy} IS NULL AND ${table.paidRecordedAt} IS NULL
           AND NOT ${table.internalTransfer})
        OR (${table.paidOn} IS NOT NULL AND ${table.paymentReference} IS NOT NULL
           AND length(btrim(${table.paymentReference})) > 0
           AND ${table.paidRecordedBy} IS NOT NULL AND ${table.paidRecordedAt} IS NOT NULL
           AND ${table.netPaise} > 0)`,
    ),
  ],
)

export const settlementPosition = pgTable(
  'settlement_position',
  {
    month: date('month', { mode: 'string' })
      .notNull()
      .references(() => settlementPeriod.month, { onDelete: 'restrict' }),
    branchId: text('branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'restrict' }),
    // What the branch's counterparts owed it, what it owed them, and the
    // difference. A month's net positions add up to zero (ST-08).
    receivablePaise: bigint('receivable_paise', { mode: 'number' }).notNull(),
    payablePaise: bigint('payable_paise', { mode: 'number' }).notNull(),
    netPaise: bigint('net_paise', { mode: 'number' }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    primaryKey({ name: 'settlement_position_pkey', columns: [table.month, table.branchId] }),
    index('settlement_position_branch_idx').on(table.branchId, table.month),
    check(
      'settlement_position_net_check',
      sql`${table.netPaise} = ${table.receivablePaise} - ${table.payablePaise}`,
    ),
  ],
)
