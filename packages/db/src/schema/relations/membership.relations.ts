import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { booking } from '../booking'
import { invoice } from '../invoice'
import { spaMembership, spaMembershipTier } from '../membership'

export const spaMembershipTierRelations = relations(spaMembershipTier, ({ many }) => ({
  memberships: many(spaMembership),
}))

export const spaMembershipRelations = relations(spaMembership, ({ one, many }) => ({
  customer: one(user, { fields: [spaMembership.customerId], references: [user.id] }),
  tier: one(spaMembershipTier, {
    fields: [spaMembership.tierId],
    references: [spaMembershipTier.id],
  }),
  createdBy: one(user, { fields: [spaMembership.createdBy], references: [user.id] }),
  invoice: one(invoice),
  bookings: many(booking),
}))
