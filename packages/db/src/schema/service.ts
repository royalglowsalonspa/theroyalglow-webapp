/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : service
 * Scope        : Database Schema — Service
 *
 * Description  : Defines service catalog tables including categories, services,
 *                and the staff-service capability mapping.
 *
 * Responsibilities :
 * - Define service_category with salon/spa type classification
 * - Define service table with pricing, duration, and gems eligibility
 * - Define staff_service junction mapping staff to their capabilities
 * - Support gems redemption catalogue with required gems and ordering
 *
 * Features / Functionality :
 * - Service type inherited from category (salon vs spa)
 * - Pricing in paise with GST-inclusive amounts
 * - Gems redeemable flag and required gems for loyalty catalogue
 * - Partial index on gems-redeemable active services
 * - Display order for UI listing within categories
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./enums, ./profile
 *
 * Notes        : Services are soft-toggled via isActive flag, never deleted.
 *                Price changes take effect on new bookings only (snapshots frozen).
 ************************************************************/

import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { serviceTypeEnum } from './enums'
import { staffProfile } from './profile'

export const serviceCategory = pgTable('service_category', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  serviceType: serviceTypeEnum('service_type').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const service = pgTable(
  'service',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    categoryId: text('category_id')
      .notNull()
      .references(() => serviceCategory.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    durationMinutes: integer('duration_minutes').notNull(),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    pricePaise: integer('price_paise').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    imageUrl: text('image_url'),
    displayOrder: integer('display_order').notNull().default(0),
    gemsRedeemable: boolean('gems_redeemable').notNull().default(false),
    gemsRequired: integer('gems_required'),
    gemsCatalogueOrder: integer('gems_catalogue_order'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('service_category_id_idx').on(table.categoryId),
    index('service_gems_redeemable_idx')
      .on(table.id)
      .where(sql`gems_redeemable = true AND is_active = true`),
  ],
)

export const staffService = pgTable(
  'staff_service',
  {
    staffId: text('staff_id')
      .notNull()
      .references(() => staffProfile.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.staffId, table.serviceId] })],
)
