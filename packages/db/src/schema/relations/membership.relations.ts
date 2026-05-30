import { relations } from 'drizzle-orm'
import { spaMembershipTier, spaMembership } from '../membership'
import { user } from '../auth'
import { invoice } from '../invoice'
import { booking } from '../booking'

export const spaMembershipTierRelations = relations(spaMembershipTier, ({ many }) => ({
  memberships: many(spaMembership),
}))

export const spaMembershipRelations = relations(spaMembership, ({ one, many }) => ({
  customer: one(user, { fields: [spaMembership.customerId], references: [user.id] }),
  tier: one(spaMembershipTier, { fields: [spaMembership.tierId], references: [spaMembershipTier.id] }),
  createdBy: one(user, { fields: [spaMembership.createdBy], references: [user.id] }),
  invoice: one(invoice),
  bookings: many(booking),
}))
