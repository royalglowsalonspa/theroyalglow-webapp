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
