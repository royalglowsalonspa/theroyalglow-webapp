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
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { branch } from './branch'
import { serviceTypeEnum } from './enums'
import { staffProfile } from './profile'

export const serviceCategory = pgTable(
  'service_category',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    serviceType: serviceTypeEnum('service_type').notNull(),
    // The category's tax classification (SAC code), used for a service that
    // doesn't set its own (tax-settings.md §1). Payload owns it (tasks §6);
    // 0018 seeded it from the category slug.
    sacCode: text('sac_code'),
    // Offered at every branch, including branches added later (R4.2). When
    // false, `service_category_branch` lists the branches; Payload owns both.
    allBranches: boolean('all_branches').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      'service_category_sac_code_check',
      sql`${table.sacCode} IS NULL OR ${table.sacCode} ~ '^[0-9]{6}$'`,
    ),
  ],
)

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
    // The service's own tax classification (SAC code); null uses its
    // category's. Payload owns it (tasks §6).
    sacCode: text('sac_code'),
    // Offered at every branch its category is (R4.2). When false,
    // `service_branch` lists the branches; Payload owns both.
    allBranches: boolean('all_branches').notNull().default(true),
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
    check(
      'service_sac_code_check',
      sql`${table.sacCode} IS NULL OR ${table.sacCode} ~ '^[0-9]{6}$'`,
    ),
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

// The branches a service is offered at while `service.all_branches` is false
// (ignored, and kept empty by the CMS sync, while it is true). A service is
// offered at a branch only when its category is too: see
// `service_available_at` (0034), which every new booking line must pass.
export const serviceBranch = pgTable(
  'service_branch',
  {
    serviceId: text('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
    branchId: text('branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.serviceId, table.branchId] }),
    index('service_branch_branch_id_idx').on(table.branchId),
  ],
)

// The branches a category is offered at while `service_category.all_branches`
// is false. Same rules as `service_branch`.
export const serviceCategoryBranch = pgTable(
  'service_category_branch',
  {
    categoryId: text('category_id')
      .notNull()
      .references(() => serviceCategory.id, { onDelete: 'cascade' }),
    branchId: text('branch_id')
      .notNull()
      .references(() => branch.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.categoryId, table.branchId] }),
    index('service_category_branch_branch_id_idx').on(table.branchId),
  ],
)
