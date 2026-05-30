import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { booking } from './booking'

export const customerTag = pgTable('customer_tag', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  color: text('color'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const customerTagAssignment = pgTable('customer_tag_assignment', {
  customerId: text('customer_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').notNull().references(() => customerTag.id, { onDelete: 'cascade' }),
  assignedBy: text('assigned_by').notNull().references(() => user.id, { onDelete: 'restrict' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.customerId, table.tagId] }),
  index('customer_tag_assignment_tag_id_idx').on(table.tagId),
])

export const customerNote = pgTable('customer_note', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  customerId: text('customer_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  bookingId: text('booking_id').references(() => booking.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('customer_note_booking_id_idx').on(table.bookingId).where(sql`booking_id IS NOT NULL`),
])
