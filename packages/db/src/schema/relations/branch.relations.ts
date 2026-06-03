/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : branch.relations
 * Scope        : Database Relations — Branch
 *
 * Description  : Defines Drizzle ORM relations for the branch entity connecting
 *                it to bookings, invoices, and daily sales summaries.
 *
 * Responsibilities :
 * - Define branch relations to creator user, bookings, invoices
 * - Link branch to daily sales summary aggregations
 *
 * Features / Functionality :
 * - Branch has many bookings, invoices, and daily sales summaries
 * - CreatedBy links to the user who added the branch
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../booking, ../branch, ../invoice,
 *                ../system
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { booking } from '../booking'
import { branch } from '../branch'
import { invoice } from '../invoice'
import { dailySalesSummary } from '../system'

export const branchRelations = relations(branch, ({ one, many }) => ({
  createdBy: one(user, { fields: [branch.createdBy], references: [user.id] }),
  bookings: many(booking),
  invoices: many(invoice),
  dailySalesSummaries: many(dailySalesSummary),
}))
