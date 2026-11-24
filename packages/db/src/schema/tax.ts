/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-10-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : tax
 * Scope        : Database Schema — branch tax versions and invoice numbering
 *
 * Description  : Effective-dated tax rates per branch and SAC code, and the
 *                per-branch, per-financial-year invoice counter (multi-branch
 *                R6, tax-settings.md §2).
 *
 * Responsibilities :
 * - branch_tax_version: one rate per branch, SAC code and start instant, in
 *   integer basis points (500 = 5%), with the launch review status
 * - invoice_sequence: the last number issued per branch and financial year;
 *   the issuing statement takes the next one under the row lock
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./branch,
 *                ./enums
 *
 * Notes        :
 * - A version applies from its start (00:00 IST on its date) until the next
 *   version for the same branch and SAC code. Versions an invoice used can't
 *   change (0018 trigger); invoice items reference them.
 * - Only tax-inclusive prices are supported (the catalogue convention).
 * - Counters cascade with their branch: a branch with invoices can't be
 *   deleted, so a counter that was used never goes away.
 ************************************************************/

import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { branch } from './branch'
import { taxReviewStatusEnum } from './enums'

export const branchTaxVersion = pgTable(
  'branch_tax_version',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    branchId: text('branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'cascade' }),
    // The tax class is the SAC code the rate applies to (tax-settings.md §1).
    sacCode: text('sac_code').notNull(),
    // Total GST in basis points: 500 = 5% (split CGST/SGST on the invoice).
    rateBps: integer('rate_bps').notNull(),
    pricesIncludeTax: boolean('prices_include_tax').notNull().default(true),
    // 00:00 IST on the version's calendar date, stored as an instant.
    effectiveFrom: timestamp('effective_from', { withTimezone: true, mode: 'date' }).notNull(),
    reviewStatus: taxReviewStatusEnum('review_status').notNull().default('provisional'),
    reason: text('reason').notNull(),
    // Null when a migration seeded the version.
    createdBy: text('created_by').references(() => user.id, { onDelete: 'restrict' }),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('branch_tax_version_start_uidx').on(
      table.branchId,
      table.sacCode,
      table.effectiveFrom,
    ),
    index('branch_tax_version_branch_id_idx').on(table.branchId),
    check('branch_tax_version_rate_check', sql`${table.rateBps} BETWEEN 0 AND 2800`),
    check('branch_tax_version_sac_code_check', sql`${table.sacCode} ~ '^[0-9]{6}$'`),
    check('branch_tax_version_inclusive_check', sql`${table.pricesIncludeTax}`),
    check(
      'branch_tax_version_review_check',
      sql`(${table.reviewStatus} = 'reviewed') = (${table.reviewedAt} IS NOT NULL)`,
    ),
    check('branch_tax_version_reason_check', sql`char_length(btrim(${table.reason})) > 0`),
  ],
)

export const invoiceSequence = pgTable(
  'invoice_sequence',
  {
    branchId: text('branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'cascade' }),
    // "2627" for 1 April 2026 to 31 March 2027 (IST).
    financialYear: text('financial_year').notNull(),
    lastNumber: integer('last_number').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.branchId, table.financialYear] }),
    check('invoice_sequence_financial_year_check', sql`${table.financialYear} ~ '^[0-9]{4}$'`),
    check('invoice_sequence_last_number_check', sql`${table.lastNumber} > 0`),
  ],
)
