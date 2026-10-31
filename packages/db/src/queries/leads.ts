/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : leads
 * Scope        : Data Access — Leads
 *
 * Description  : Query functions for lead pipeline management including
 *                creation, retrieval, notes, and status updates.
 *
 * Responsibilities :
 * - Create leads from Meta ad /book form submissions
 * - Fetch single lead with service interest and assignment details
 * - Fetch all leads for kanban pipeline view with filtering
 * - Update lead status, assignment, and conversion tracking
 * - Manage lead notes and service interest options
 *
 * Features / Functionality :
 * - Lead creation with auto-defaulting 'new' status and 'meta_ad' source
 * - Rich lead detail with LEFT JOINed service, assignee, booking info
 * - Pipeline view with optional status filtering
 * - Service interest dropdown data for /book form
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index, ../schema/auth, ../schema/booking,
 *                ../schema/lead, ../schema/service
 *
 * Notes        : Lead conversion sets converted_booking_id when customer
 *                completes a booking after the lead was captured.
 ************************************************************/

import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking } from '../schema/booking'
import { lead, leadNote } from '../schema/lead'
import { service, serviceCategory } from '../schema/service'

type LeadStatus = (typeof lead.$inferSelect)['status']

type LeadPipelineFilters = {
  status?: string
}

type LeadPatch = {
  status?: LeadStatus
  lastContactedAt?: Date | null
  convertedBookingId?: string | null
  assignedTo?: string | null
}

// Insert a lead row and return it. The id auto-defaults in schema, so callers
// pass only the lead fields (name, phone, email?, serviceInterestedId?, source,
// utm* fields); status defaults to 'new'.
export async function createLead(data: Omit<typeof lead.$inferInsert, 'id'>) {
  const [created] = await db.insert(lead).values(data).returning()
  return created as typeof lead.$inferSelect
}

// A lead in one branch's pipeline (multi-branch R2.3).
function leadAt(id: string, branchId: string) {
  return and(eq(lead.id, id), eq(lead.branchId, branchId))
}

// Single lead in the branch's pipeline with its service-interest name,
// assigned-to user name, and the linked converted booking number (all LEFT
// JOINed, so each is null when absent), or null when the branch has no such
// lead. Notes are fetched separately via getLeadNotes.
export async function getLeadById(id: string, branchId: string) {
  const rows = await db
    .select({
      lead,
      serviceName: service.name,
      assignedToName: user.name,
      convertedBookingNumber: booking.bookingNumber,
    })
    .from(lead)
    .leftJoin(service, eq(lead.serviceInterestedId, service.id))
    .leftJoin(user, eq(lead.assignedTo, user.id))
    .leftJoin(booking, eq(lead.convertedBookingId, booking.id))
    .where(leadAt(id, branchId))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  return {
    ...found.lead,
    serviceName: found.serviceName,
    assignedToName: found.assignedToName,
    convertedBookingNumber: found.convertedBookingNumber,
  }
}

// A lead's notes, newest first, each with its author name.
export async function getLeadNotes(leadId: string) {
  return db
    .select({
      id: leadNote.id,
      leadId: leadNote.leadId,
      content: leadNote.content,
      authorId: leadNote.authorId,
      authorName: user.name,
      createdAt: leadNote.createdAt,
    })
    .from(leadNote)
    .innerJoin(user, eq(leadNote.authorId, user.id))
    .where(eq(leadNote.leadId, leadId))
    .orderBy(desc(leadNote.createdAt))
}

// One branch's leads (optionally filtered by status), newest first, each
// flattened with its service-interest name. The kanban page buckets these flat
// rows by status.
export async function getLeadsForPipeline(branchId: string, filters: LeadPipelineFilters = {}) {
  const conditions = [eq(lead.branchId, branchId)]
  if (filters.status) {
    conditions.push(eq(lead.status, filters.status as LeadStatus))
  }

  const rows = await db
    .select({
      lead,
      serviceName: service.name,
    })
    .from(lead)
    .leftJoin(service, eq(lead.serviceInterestedId, service.id))
    .where(and(...conditions))
    .orderBy(desc(lead.createdAt))

  return rows.map((r) => ({
    ...r.lead,
    serviceName: r.serviceName,
  }))
}

// Update the mutable fields (status, lastContactedAt, convertedBookingId,
// assignedTo) of a lead in the branch's pipeline and return the updated row, or
// null when the branch has no such lead.
export async function updateLead(id: string, branchId: string, patch: LeadPatch) {
  const [updated] = await db.update(lead).set(patch).where(leadAt(id, branchId)).returning()

  return updated ?? null
}

// Add a note to a lead and return it. The id auto-defaults in schema.
export async function addLeadNote(leadId: string, authorId: string, content: string) {
  const [created] = await db.insert(leadNote).values({ leadId, authorId, content }).returning()

  return created as typeof leadNote.$inferSelect
}

// Active services with their owning category's service_type, for the /book
// service-interest dropdown. Ordered by category displayOrder then service
// displayOrder so options group naturally by category.
export async function getServiceInterestOptions() {
  return db
    .select({
      id: service.id,
      name: service.name,
      serviceType: serviceCategory.serviceType,
    })
    .from(service)
    .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
    .where(eq(service.isActive, true))
    .orderBy(asc(serviceCategory.displayOrder), asc(service.displayOrder))
}
