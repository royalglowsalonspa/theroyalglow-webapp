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
