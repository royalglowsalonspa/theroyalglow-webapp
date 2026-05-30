import { relations } from 'drizzle-orm'
import { dailySalesSummary, auditLog, systemSetting } from '../system'
import { branch } from '../branch'
import { user } from '../auth'

export const dailySalesSummaryRelations = relations(dailySalesSummary, ({ one }) => ({
  branch: one(branch, { fields: [dailySalesSummary.branchId], references: [branch.id] }),
}))

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, { fields: [auditLog.actorId], references: [user.id] }),
}))

export const systemSettingRelations = relations(systemSetting, ({ one }) => ({
  updatedBy: one(user, { fields: [systemSetting.updatedBy], references: [user.id] }),
}))
