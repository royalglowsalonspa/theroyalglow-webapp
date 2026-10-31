/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : membership
 * Scope        : Database Schema — Membership
 *
 * Description  : Defines SPA membership tables including tier definitions
 *                and individual customer memberships with hour tracking.
 *
 * Responsibilities :
 * - Define spa_membership_tier table with defaults for Silver/Gold/Platinum
 * - Define spa_membership table with hour usage and expiry tracking
 * - Enforce one active membership per customer via partial unique index
 * - Track membership lifecycle: active → expired/cancelled
 *
 * Features / Functionality :
 * - Hour-based sessions stored in minutes for precision
 * - Membership number format: RG-MEM-{YY}-{branch}-{random}
 * - Tier name snapshot frozen at purchase time
 * - Partial unique index ensures single active membership per customer
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./enums
 *
 * Notes        : No gems earned on membership purchase or sessions.
 *                Hard expiry with reminder notifications at 30d/7d/1d.
 ************************************************************/

import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { branch } from './branch'
import { spaMembershipStatusEnum } from './enums'

// Starting templates for a sale, shared by every branch and never shown to
// customers (multi-branch R9.1, R9.4). Edits change later sales only: a
// membership keeps its own hours, price and a snapshot of the tier.
export const spaMembershipTier = pgTable(
  'spa_membership_tier',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    // 0 usual hours or price: agreed at the counter (a "custom" tier).
    defaultHoursMinutes: integer('default_hours_minutes').notNull(),
    defaultPricePaise: integer('default_price_paise').notNull(),
    defaultValidityDays: integer('default_validity_days').notNull(),
    // The tax classification of a sale, one of the reviewed SAC codes
    // (tax-settings.md §1). Only the Developer changes it.
    sacCode: text('sac_code').notNull().default('999723'),
    isActive: boolean('is_active').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      'spa_membership_tier_usual_values_check',
      sql`${table.defaultHoursMinutes} >= 0 AND ${table.defaultPricePaise} >= 0 AND ${table.defaultValidityDays} > 0`,
    ),
    check('spa_membership_tier_sac_code_check', sql`${table.sacCode} ~ '^[0-9]{6}$'`),
  ],
)

export const spaMembership = pgTable(
  'spa_membership',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    membershipNumber: text('membership_number').notNull().unique(),
    customerId: text('customer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    tierId: text('tier_id')
      .notNull()
      .references(() => spaMembershipTier.id, { onDelete: 'restrict' }),
    tierNameSnapshot: text('tier_name_snapshot').notNull(),
    // The tier's usual hours and price when this membership was sold, for the
    // agreed-versus-usual comparison. Null for memberships sold before the
    // snapshot existed (multi-branch §4b).
    tierUsualHoursMinutes: integer('tier_usual_hours_minutes'),
    tierUsualPricePaise: integer('tier_usual_price_paise'),
    // The branch that sold the membership and issued its purchase invoice. Its
    // money and its cancellation stay with that branch; the hours can be used
    // at any branch (multi-branch R9, route inventory gap 5).
    sellingBranchId: text('selling_branch_id').references(() => branch.id, {
      onDelete: 'restrict',
    }),
    totalHoursMinutes: integer('total_hours_minutes').notNull(),
    // Consumed minutes: the sum of the membership's consumed holds.
    usedHoursMinutes: integer('used_hours_minutes').notNull().default(0),
    // Minutes held by confirmed and in-progress sessions: the sum of its held
    // holds. Both totals are kept by the hold triggers and checked at commit
    // (migration 0026); nothing else writes them.
    reservedMinutes: integer('reserved_minutes').notNull().default(0),
    pricePaidPaise: integer('price_paid_paise').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    status: spaMembershipStatusEnum('status').notNull().default('active'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    invoiceId: text('invoice_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Minute accounting can't go negative or past the pool (MS-10), and a
    // membership ends after it starts.
    check(
      'spa_membership_minutes_check',
      sql`${table.totalHoursMinutes} > 0 AND ${table.usedHoursMinutes} >= 0 AND ${table.usedHoursMinutes} <= ${table.totalHoursMinutes}`,
    ),
    check('spa_membership_validity_check', sql`${table.expiresAt} > ${table.startsAt}`),
    // Held and consumed minutes together never exceed the pool (MS-01).
    check(
      'spa_membership_reserved_check',
      sql`${table.reservedMinutes} >= 0 AND ${table.usedHoursMinutes} + ${table.reservedMinutes} <= ${table.totalHoursMinutes}`,
    ),
    uniqueIndex('spa_membership_active_customer_idx')
      .on(table.customerId)
      .where(sql`status = 'active'`),
    index('spa_membership_expires_at_idx').on(table.expiresAt).where(sql`status = 'active'`),
    index('spa_membership_customer_id_idx').on(table.customerId),
    index('spa_membership_selling_branch_id_idx').on(table.sellingBranchId),
  ],
)
