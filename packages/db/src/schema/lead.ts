/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : lead
 * Scope        : Database Schema — Lead
 *
 * Description  : Defines lead pipeline tables for Meta ad lead capture,
 *                tracking, and conversion to bookings.
 *
 * Responsibilities :
 * - Define lead table with contact info and UTM attribution
 * - Define lead_note table for follow-up communication tracking
 * - Support lead lifecycle: new → contacted → follow_up → booked → won/lost
 * - Link converted leads to their resulting bookings
 *
 * Features / Functionality :
 * - Full UTM parameter tracking (campaign, medium, source, content, term)
 * - Lead assignment to staff members for follow-up
 * - Partial indexes on active lead statuses and UTM campaigns
 * - Service interest linking for targeted follow-ups
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./booking,
 *                ./enums, ./service
 *
 * Notes        : Leads arrive from /book page (Meta ad landing) with 3 fields:
 *                name, phone, service interest. Source defaults to 'meta_ad'.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { booking } from './booking'
import { leadStatusEnum } from './enums'
import { service } from './service'

export const lead = pgTable(
  'lead',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    serviceInterestedId: text('service_interested_id').references(() => service.id, {
      onDelete: 'set null',
    }),
    status: leadStatusEnum('status').notNull().default('new'),
    source: text('source').notNull().default('meta_ad'),
    utmCampaign: text('utm_campaign'),
    utmMedium: text('utm_medium'),
    utmSource: text('utm_source'),
    utmContent: text('utm_content'),
    utmTerm: text('utm_term'),
    assignedTo: text('assigned_to').references(() => user.id, { onDelete: 'set null' }),
    convertedBookingId: text('converted_booking_id').references(() => booking.id, {
      onDelete: 'set null',
    }),
    lastContactedAt: timestamp('last_contacted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('lead_status_idx').on(table.status),
    index('lead_assigned_to_idx').on(table.assignedTo).where(sql`status NOT IN ('won', 'lost')`),
    index('lead_utm_campaign_idx').on(table.utmCampaign).where(sql`utm_campaign IS NOT NULL`),
  ],
)

export const leadNote = pgTable('lead_note', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  leadId: text('lead_id')
    .notNull()
    .references(() => lead.id, { onDelete: 'cascade' }),
  authorId: text('author_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})
