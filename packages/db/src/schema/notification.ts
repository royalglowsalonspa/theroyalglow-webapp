/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : notification
 * Scope        : Database Schema — Notification
 *
 * Description  : Defines notification and push subscription tables for
 *                Web Push API and email notification delivery.
 *
 * Responsibilities :
 * - Define notification table with type, channel, and delivery status
 * - Define push_subscription table for Web Push API endpoints
 * - Track notification read/sent timestamps for user engagement
 * - Support both push and email notification channels
 *
 * Features / Functionality :
 * - 24 notification types covering all booking/membership/lead events
 * - Partial index on pending notifications for dispatch queue
 * - Active push subscription tracking with user-scoped deactivation
 * - Optional booking linkage for contextual notifications
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, drizzle-orm/pg-core, nanoid, ./auth, ./booking,
 *                ./enums
 *
 * Notes        : Notifications are idempotent — duplicate sends are prevented
 *                by checking existing notification rows before dispatch.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'
import { user } from './auth'
import { booking } from './booking'
import { notificationChannelEnum, notificationStatusEnum, notificationTypeEnum } from './enums'

export const notification = pgTable(
  'notification',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    bookingId: text('booking_id').references(() => booking.id, { onDelete: 'set null' }),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    status: notificationStatusEnum('status').notNull().default('pending'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('notification_status_created_at_idx')
      .on(table.status, table.createdAt)
      .where(sql`status = 'pending'`),
  ],
)

export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dhKey: text('p256dh_key').notNull(),
    authKey: text('auth_key').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('push_subscription_user_id_active_idx').on(table.userId).where(sql`is_active = true`),
  ],
)
