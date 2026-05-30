import { relations } from 'drizzle-orm'
import { notification, pushSubscription } from '../notification'
import { user } from '../auth'
import { booking } from '../booking'

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, { fields: [notification.userId], references: [user.id] }),
  booking: one(booking, { fields: [notification.bookingId], references: [booking.id] }),
}))

export const pushSubscriptionRelations = relations(pushSubscription, ({ one }) => ({
  user: one(user, { fields: [pushSubscription.userId], references: [user.id] }),
}))
