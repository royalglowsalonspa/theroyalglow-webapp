import { relations } from 'drizzle-orm'
import { customerProfile, staffProfile } from '../profile'
import { user } from '../auth'
import { loyaltyAccount } from '../loyalty'
import { staffService } from '../service'
import { staffSchedule, staffTimeOff } from '../schedule'
import { bookingService } from '../booking'

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
