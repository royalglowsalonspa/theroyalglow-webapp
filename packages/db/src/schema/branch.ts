import { boolean, date, index, integer, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { branchStatusEnum } from './enums'
import { user } from './auth'

export const branch = pgTable('branch', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  number: integer('number').notNull().unique(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  addressLine1: text('address_line1').notNull(),
  addressLine2: text('address_line2'),
  city: text('city').notNull().default('Bengaluru'),
  state: text('state').notNull().default('Karnataka'),
  pincode: text('pincode').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  googleMapsUrl: text('google_maps_url'),
  googleMapsPlaceId: text('google_maps_place_id'),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
  status: branchStatusEnum('status').notNull().default('operational'),
  openingDate: date('opening_date', { mode: 'date' }),
  closingDate: date('closing_date', { mode: 'date' }),
  temporaryCloseReason: text('temporary_close_reason'),
  isPrimary: boolean('is_primary').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date()),
})
