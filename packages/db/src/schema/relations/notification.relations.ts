/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : notification.relations
 * Scope        : Database Relations — Notification
 *
 * Description  : Defines Drizzle ORM relations for notification entities
 *                connecting notifications and push subscriptions to users.
 *
 * Responsibilities :
 * - Define notification relations to user and booking
 * - Define pushSubscription relations to user
 *
 * Features / Functionality :
 * - Notification optionally links to triggering booking
 * - Push subscription belongs to a single user
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../booking, ../notification
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { booking } from '../booking'
import { notification, pushSubscription } from '../notification'

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, { fields: [notification.userId], references: [user.id] }),
  booking: one(booking, { fields: [notification.bookingId], references: [booking.id] }),
}))

export const pushSubscriptionRelations = relations(pushSubscription, ({ one }) => ({
  user: one(user, { fields: [pushSubscription.userId], references: [user.id] }),
}))
