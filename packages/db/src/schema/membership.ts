import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { spaMembershipStatusEnum } from './enums'
import { user } from './auth'

export const spaMembershipTier = pgTable('spa_membership_tier', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  defaultHoursMinutes: integer('default_hours_minutes').notNull(),
  defaultPricePaise: integer('default_price_paise').notNull(),
  defaultValidityDays: integer('default_validity_days').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export const spaMembership = pgTable('spa_membership', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  membershipNumber: text('membership_number').notNull().unique(),
  customerId: text('customer_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  tierId: text('tier_id').notNull().references(() => spaMembershipTier.id, { onDelete: 'restrict' }),
  tierNameSnapshot: text('tier_name_snapshot').notNull(),
  totalHoursMinutes: integer('total_hours_minutes').notNull(),
  usedHoursMinutes: integer('used_hours_minutes').notNull().default(0),
  pricePaidPaise: integer('price_paid_paise').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  status: spaMembershipStatusEnum('status').notNull().default('active'),
  createdBy: text('created_by').notNull().references(() => user.id, { onDelete: 'restrict' }),
  invoiceId: text('invoice_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex('spa_membership_active_customer_idx').on(table.customerId).where(sql`status = 'active'`),
  index('spa_membership_expires_at_idx').on(table.expiresAt).where(sql`status = 'active'`),
  index('spa_membership_customer_id_idx').on(table.customerId),
])
