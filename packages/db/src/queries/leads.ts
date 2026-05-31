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

// Single lead with its service-interest name, assigned-to user name, and the
// linked converted booking number (all LEFT JOINed, so each is null when
// absent), or null if the lead does not exist. Notes are fetched separately via
// getLeadNotes.
export async function getLeadById(id: string) {
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
    .where(eq(lead.id, id))
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

// All leads (optionally filtered by status), newest first, each flattened with
// its service-interest name. The kanban page buckets these flat rows by status.
export async function getLeadsForPipeline(filters: LeadPipelineFilters = {}) {
  const conditions = []
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
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(lead.createdAt))

  return rows.map((r) => ({
    ...r.lead,
    serviceName: r.serviceName,
  }))
}

// Update a lead's mutable fields (status, lastContactedAt, convertedBookingId,
// assignedTo) and return the updated row, or null if no lead matched.
export async function updateLead(id: string, patch: LeadPatch) {
  const [updated] = await db
    .update(lead)
    .set(patch)
    .where(eq(lead.id, id))
    .returning()

  return updated ?? null
}

// Add a note to a lead and return it. The id auto-defaults in schema.
export async function addLeadNote(leadId: string, authorId: string, content: string) {
  const [created] = await db
    .insert(leadNote)
    .values({ leadId, authorId, content })
    .returning()

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
