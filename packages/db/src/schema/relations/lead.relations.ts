import { relations } from 'drizzle-orm'
import { lead, leadNote } from '../lead'
import { service } from '../service'
import { user } from '../auth'
import { booking } from '../booking'

export const leadRelations = relations(lead, ({ one, many }) => ({
  serviceInterested: one(service, { fields: [lead.serviceInterestedId], references: [service.id] }),
  assignedTo: one(user, { fields: [lead.assignedTo], references: [user.id] }),
  convertedBooking: one(booking, { fields: [lead.convertedBookingId], references: [booking.id] }),
  notes: many(leadNote),
}))

export const leadNoteRelations = relations(leadNote, ({ one }) => ({
  lead: one(lead, { fields: [leadNote.leadId], references: [lead.id] }),
  author: one(user, { fields: [leadNote.authorId], references: [user.id] }),
}))
