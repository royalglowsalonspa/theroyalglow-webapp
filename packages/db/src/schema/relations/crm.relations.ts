/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : crm.relations
 * Scope        : Database Relations — CRM
 *
 * Description  : Defines Drizzle ORM relations for CRM entities including
 *                customer tags, tag assignments, and customer notes.
 *
 * Responsibilities :
 * - Define customerTag relations to its assignments
 * - Define customerTagAssignment relations to customer, tag, and assigner
 * - Define customerNote relations to customer, author, and booking
 *
 * Features / Functionality :
 * - Tag assignments link customer, tag, and the staff who assigned it
 * - Notes can optionally reference a specific booking for context
 *
 * Tech Stack   : TypeScript, Drizzle ORM, PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../auth, ../booking, ../crm
 *
 * Notes        : None
 ************************************************************/

import { relations } from 'drizzle-orm'
import { user } from '../auth'
import { booking } from '../booking'
import { customerNote, customerTag, customerTagAssignment } from '../crm'

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
