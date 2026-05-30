import { relations } from 'drizzle-orm'
import { user, session, account } from '../auth'
import { customerProfile, staffProfile } from '../profile'
import { booking } from '../booking'
import { notification } from '../notification'
import { leadNote } from '../lead'
import { customerNote } from '../crm'
import { bookingStatusLog } from '../booking'

export const userRelations = relations(user, ({ one, many }) => ({
  customerProfile: one(customerProfile),
  staffProfile: one(staffProfile),
  sessions: many(session),
  accounts: many(account),
  bookings: many(booking),
  notifications: many(notification),
  leadNotes: many(leadNote),
  customerNotes: many(customerNote),
  bookingStatusLogs: many(bookingStatusLog),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))
