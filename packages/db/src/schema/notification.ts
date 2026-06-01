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
