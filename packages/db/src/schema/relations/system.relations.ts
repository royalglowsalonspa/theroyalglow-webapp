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
