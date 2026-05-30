import { boolean, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { serviceTypeEnum } from './enums'
import { staffProfile } from './profile'

export const serviceCategory = pgTable('service_category', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  serviceType: serviceTypeEnum('service_type').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const service = pgTable('service', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  categoryId: text('category_id').notNull().references(() => serviceCategory.id, { onDelete: 'restrict' }),
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
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('service_category_id_idx').on(table.categoryId),
  index('service_gems_redeemable_idx').on(table.id).where(sql`gems_redeemable = true AND is_active = true`),
])

export const staffService = pgTable('staff_service', {
  staffId: text('staff_id').notNull().references(() => staffProfile.id, { onDelete: 'cascade' }),
  serviceId: text('service_id').notNull().references(() => service.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.staffId, table.serviceId] }),
])
