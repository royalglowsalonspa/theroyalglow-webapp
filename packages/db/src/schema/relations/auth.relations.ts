/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : auth.relations
 * Scope        : Database Relations — Auth
 *
 * Description  : Defines Drizzle ORM relations for authentication entities
 *                (user, session, account) enabling relational queries.
 *
 * Responsibilities :
 * - Define user relations to profiles, sessions, bookings, notifications
 * - Define session-to-user relation
 * - Define account-to-user relation
 *
 * Features / Functionality :
 * - User has one customerProfile and one staffProfile
 * - User has many sessions, accounts, bookings, notifications
 * - Enables nested relational queries via Drizzle's query builder
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../booking, ../crm, ../lead,
 *                ../notification, ../profile
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { account, session, user } from '../auth'
import { booking, bookingStatusLog } from '../booking'
import { customerNote } from '../crm'
import { leadNote } from '../lead'
import { notification } from '../notification'
import { customerProfile, staffProfile } from '../profile'

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
