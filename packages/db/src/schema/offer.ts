/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : offer
 * Scope        : Database Schema — Offer
 *
 * Description  : Defines offer tables for promotions, discounts, and combo
 *                pricing with per-customer-per-day redemption enforcement.
 *
 * Responsibilities :
 * - Define offer table with percentage/flat/combo discount types
 * - Define offer_service junction for applicable services
 * - Define offer_redemption with unique constraint (customer + date)
 * - Track offer active status, date range, and display ordering
 *
 * Features / Functionality :
 * - Three discount types: percentage, flat amount, combo price
 * - One offer per customer per day enforced via DB unique constraint
 * - Partial index on active offers for customer-facing queries
 * - Auto-expiry via QStash offer-auto-expire job deactivating past-end-date offers
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./enums,
 *                ./service
 *
 * Notes        : Offers apply to salon services only (not SPA memberships).
 *                Cannot combine with gems redemption on the same booking.
 ************************************************************/

import { sql } from 'drizzle-orm'
import {
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
} from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { discountTypeEnum } from './enums'
import { service } from './service'

export const offer = pgTable(
  'offer',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    offerType: discountTypeEnum('offer_type').notNull(),
    discountPercentage: integer('discount_percentage'),
    discountAmountPaise: integer('discount_amount_paise'),
    comboPricePaise: integer('combo_price_paise'),
    startDate: date('start_date', { mode: 'date' }).notNull(),
    endDate: date('end_date', { mode: 'date' }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    terms: text('terms'),
    imageUrl: text('image_url'),
    displayOrder: integer('display_order').notNull().default(0),
    // The Payload offer this row mirrors (offers.md): its id is
    // `cms_offer_<cms_id>`. Null for the legacy offers made in the admin
    // portal before the move to the CMS.
    cmsId: integer('cms_id').unique(),
    // Off for a counter-only discount: the rule applies at checkout, but no
    // public list shows it (R4.8).
    showOnWebsite: boolean('show_on_website').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('offer_display_order_active_idx').on(table.displayOrder).where(sql`is_active = true`),
    // A mirrored rule is whole: its id follows the CMS id, its dates are in
    // order, and only its type's value is set, in range. Legacy rows are exempt
    // (test data, removed by the clean-up allowlist).
    check(
      'offer_cms_rule_check',
      sql`${table.cmsId} IS NULL OR (
        ${table.id} = 'cms_offer_' || ${table.cmsId}::text
        AND ${table.endDate} >= ${table.startDate}
        AND (
          (${table.offerType} = 'percentage'
            AND coalesce(${table.discountPercentage}, 0) BETWEEN 1 AND 100
            AND ${table.discountAmountPaise} IS NULL AND ${table.comboPricePaise} IS NULL)
          OR (${table.offerType} = 'flat'
            AND coalesce(${table.discountAmountPaise}, 0) > 0
            AND ${table.discountPercentage} IS NULL AND ${table.comboPricePaise} IS NULL)
          OR (${table.offerType} = 'combo_price'
            AND coalesce(${table.comboPricePaise}, 0) > 0
            AND ${table.discountPercentage} IS NULL AND ${table.discountAmountPaise} IS NULL)
        )
      )`,
    ),
  ],
)

export const offerService = pgTable(
  'offer_service',
  {
    offerId: text('offer_id')
      .notNull()
      .references(() => offer.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.offerId, table.serviceId] })],
)

export const offerRedemption = pgTable(
  'offer_redemption',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    offerId: text('offer_id')
      .notNull()
      .references(() => offer.id, { onDelete: 'restrict' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    bookingId: text('booking_id'),
    redeemedDate: date('redeemed_date', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('offer_redemption_customer_id_redeemed_date_unique').on(
      table.customerId,
      table.redeemedDate,
    ),
    index('offer_redemption_customer_id_redeemed_date_idx').on(
      table.customerId,
      table.redeemedDate,
    ),
    index('offer_redemption_offer_id_idx').on(table.offerId),
  ],
)
