/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : profile.relations
 * Scope        : Database Relations — Profile
 *
 * Description  : Defines Drizzle ORM relations for customer and staff profile
 *                entities connecting them to users and domain-specific children.
 *
 * Responsibilities :
 * - Define customerProfile relations to user and loyalty account
 * - Define staffProfile relations to user, services, schedules, bookings
 *
 * Features / Functionality :
 * - Customer profile links to their loyalty account
 * - Staff profile has many services (capabilities), schedules, time-offs
 * - Staff profile connects to booking_service assignments
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../booking, ../loyalty, ../profile,
 *                ../schedule, ../service
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { bookingService } from '../booking'
import { loyaltyAccount } from '../loyalty'
import { customerProfile, staffProfile } from '../profile'
import { staffSchedule, staffTimeOff } from '../schedule'
import { staffService } from '../service'

export const customerProfileRelations = relations(customerProfile, ({ one }) => ({
  user: one(user, { fields: [customerProfile.userId], references: [user.id] }),
  loyaltyAccount: one(loyaltyAccount),
}))

export const staffProfileRelations = relations(staffProfile, ({ one, many }) => ({
  user: one(user, { fields: [staffProfile.userId], references: [user.id] }),
  staffServices: many(staffService),
  staffSchedules: many(staffSchedule),
  staffTimeOffs: many(staffTimeOff),
  bookingServices: many(bookingService),
}))
