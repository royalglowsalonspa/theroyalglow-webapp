import { boolean, date, index, integer, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { discountTypeEnum } from './enums'
import { user } from './auth'
import { service } from './service'

export const offer = pgTable('offer', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
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
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index('offer_display_order_active_idx').on(table.displayOrder).where(sql`is_active = true`),
])

export const offerService = pgTable('offer_service', {
  offerId: text('offer_id').notNull().references(() => offer.id, { onDelete: 'cascade' }),
  serviceId: text('service_id').notNull().references(() => service.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.offerId, table.serviceId] }),
])

export const offerRedemption = pgTable('offer_redemption', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  offerId: text('offer_id').notNull().references(() => offer.id, { onDelete: 'restrict' }),
  customerId: text('customer_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  bookingId: text('booking_id'),
  redeemedDate: date('redeemed_date', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  unique('offer_redemption_customer_id_redeemed_date_unique').on(table.customerId, table.redeemedDate),
  index('offer_redemption_customer_id_redeemed_date_idx').on(table.customerId, table.redeemedDate),
  index('offer_redemption_offer_id_idx').on(table.offerId),
])
