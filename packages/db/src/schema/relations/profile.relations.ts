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
