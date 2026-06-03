/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : system.relations
 * Scope        : Database Relations — System
 *
 * Description  : Defines Drizzle ORM relations for system-level entities
 *                connecting summaries, audit logs, and settings to their refs.
 *
 * Responsibilities :
 * - Define dailySalesSummary relations to branch
 * - Define auditLog relations to actor user
 * - Define systemSetting relations to updatedBy user
 *
 * Features / Functionality :
 * - Daily sales summaries link to their branch
 * - Audit logs track which user performed each action
 * - System settings track who last updated each setting
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../branch, ../system
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { branch } from '../branch'
import { auditLog, dailySalesSummary, systemSetting } from '../system'

export const dailySalesSummaryRelations = relations(dailySalesSummary, ({ one }) => ({
  branch: one(branch, { fields: [dailySalesSummary.branchId], references: [branch.id] }),
}))

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, { fields: [auditLog.actorId], references: [user.id] }),
}))

export const systemSettingRelations = relations(systemSetting, ({ one }) => ({
  updatedBy: one(user, { fields: [systemSetting.updatedBy], references: [user.id] }),
}))
