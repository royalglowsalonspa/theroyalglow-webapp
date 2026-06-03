/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : membership.relations
 * Scope        : Database Relations — Membership
 *
 * Description  : Defines Drizzle ORM relations for SPA membership entities
 *                connecting tiers to memberships and memberships to customers.
 *
 * Responsibilities :
 * - Define spaMembershipTier relations to its memberships
 * - Define spaMembership relations to customer, tier, creator, invoice, bookings
 *
 * Features / Functionality :
 * - Tier has many memberships (Silver, Gold, Platinum)
 * - Membership links to creator (admin who sold it) and purchase invoice
 * - Membership has many bookings (session recordings)
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../booking, ../invoice, ../membership
 *
 * Notes        : None
 ************************************************************/

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
