import { relations } from 'drizzle-orm'
import { customerTag, customerTagAssignment, customerNote } from '../crm'
import { user } from '../auth'
import { booking } from '../booking'

export const customerTagRelations = relations(customerTag, ({ many }) => ({
  assignments: many(customerTagAssignment),
}))

export const customerTagAssignmentRelations = relations(customerTagAssignment, ({ one }) => ({
  customer: one(user, { fields: [customerTagAssignment.customerId], references: [user.id] }),
  tag: one(customerTag, { fields: [customerTagAssignment.tagId], references: [customerTag.id] }),
  assignedBy: one(user, { fields: [customerTagAssignment.assignedBy], references: [user.id] }),
}))

export const customerNoteRelations = relations(customerNote, ({ one }) => ({
  customer: one(user, { fields: [customerNote.customerId], references: [user.id] }),
  author: one(user, { fields: [customerNote.authorId], references: [user.id] }),
  booking: one(booking, { fields: [customerNote.bookingId], references: [booking.id] }),
}))
