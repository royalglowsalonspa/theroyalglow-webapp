/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : lead.relations
 * Scope        : Database Relations — Lead
 *
 * Description  : Defines Drizzle ORM relations for lead pipeline entities
 *                connecting leads to services, staff, bookings, and notes.
 *
 * Responsibilities :
 * - Define lead relations to interested service, assigned staff, booking
 * - Define leadNote relations to parent lead and author
 *
 * Features / Functionality :
 * - Lead links to the service the prospect is interested in
 * - Lead links to converted booking when conversion happens
 * - Lead has many notes for follow-up tracking
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../booking, ../lead, ../service
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { booking } from '../booking'
import { lead, leadNote } from '../lead'
import { service } from '../service'

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
