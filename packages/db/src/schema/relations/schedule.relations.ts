/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : schedule.relations
 * Scope        : Database Relations — Schedule
 *
 * Description  : Defines Drizzle ORM relations for scheduling entities
 *                connecting staff schedules and time-off to staff profiles.
 *
 * Responsibilities :
 * - Define staffSchedule relations to staff profile
 * - Define staffTimeOff relations to staff profile and reviewer
 *
 * Features / Functionality :
 * - Schedule rows link to the staff member they belong to
 * - Time-off links to both the requesting staff and the reviewing manager
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../profile, ../schedule
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { staffProfile } from '../profile'
import { staffSchedule, staffTimeOff } from '../schedule'

export const staffScheduleRelations = relations(staffSchedule, ({ one }) => ({
  staff: one(staffProfile, { fields: [staffSchedule.staffId], references: [staffProfile.id] }),
}))

export const staffTimeOffRelations = relations(staffTimeOff, ({ one }) => ({
  staff: one(staffProfile, { fields: [staffTimeOff.staffId], references: [staffProfile.id] }),
  reviewedBy: one(user, { fields: [staffTimeOff.reviewedBy], references: [user.id] }),
}))
