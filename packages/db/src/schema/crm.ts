/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : crm
 * Scope        : Database Schema — CRM
 *
 * Description  : Defines CRM tables for customer tagging, tag assignments,
 *                and customer notes linked to bookings.
 *
 * Responsibilities :
 * - Define customer_tag table for reusable tag definitions
 * - Define customer_tag_assignment junction with composite PK
 * - Define customer_note table with author and optional booking link
 *
 * Features / Functionality :
 * - Composite primary key on tag assignments (customer + tag)
 * - Slug-based unique tags for URL-safe filtering
 * - Notes linked to specific bookings for contextual history
 * - Partial index on booking_id for efficient note lookups
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./booking
 *
 * Notes        : Tags like VIP, No-Show Risk, SPA Member are auto-assigned
 *                by background jobs based on customer behavior.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { booking } from './booking'

export const customerTag = pgTable('customer_tag', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  color: text('color'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const customerTagAssignment = pgTable(
  'customer_tag_assignment',
  {
    customerId: text('customer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => customerTag.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.customerId, table.tagId] }),
    index('customer_tag_assignment_tag_id_idx').on(table.tagId),
  ],
)

export const customerNote = pgTable(
  'customer_note',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    customerId: text('customer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    bookingId: text('booking_id').references(() => booking.id, { onDelete: 'set null' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('customer_note_booking_id_idx').on(table.bookingId).where(sql`booking_id IS NOT NULL`),
  ],
)
