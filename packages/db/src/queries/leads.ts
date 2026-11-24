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

import { TRANSFERABLE_LEAD_STATUSES } from '@rgss/types'
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking } from '../schema/booking'
import { branch } from '../schema/branch'
import { lead, leadNote } from '../schema/lead'
import { service, serviceCategory } from '../schema/service'
import { auditLog } from '../schema/system'

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

// A lead's notes at its branch, newest first, each with its author name.
export async function getLeadNotes(leadId: string, branchId: string) {
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
    .innerJoin(lead, eq(leadNote.leadId, lead.id))
    .innerJoin(user, eq(leadNote.authorId, user.id))
    .where(leadAt(leadId, branchId))
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
// null when the lead moved or its status changed since validation.
export async function updateLead(
  id: string,
  branchId: string,
  expectedStatus: LeadStatus,
  patch: LeadPatch,
) {
  const [updated] = await db
    .update(lead)
    .set(patch)
    .where(and(leadAt(id, branchId), eq(lead.status, expectedStatus)))
    .returning()

  return updated ?? null
}

// Lock the lead while adding a note so a concurrent move cannot send the
// note to the destination after the source has lost access to the lead.
export async function addLeadNote(
  leadId: string,
  branchId: string,
  authorId: string,
  content: string,
) {
  const source = db
    .select({
      id: sql<string>`${nanoid()}::text`.as('id'),
      leadId: lead.id,
      authorId: sql<string>`${authorId}::text`.as('author_id'),
      content: sql<string>`${content}::text`.as('content'),
      createdAt: sql<Date>`now()`.as('created_at'),
    })
    .from(lead)
    .where(leadAt(leadId, branchId))
    .for('update')
  const [created] = await db.insert(leadNote).select(source).returning()

  return created ?? null
}

type MoveLeadResult =
  | { ok: true; destination: { id: string; name: string } }
  | { ok: false; reason: 'not_found' | 'destination_unavailable' | 'status_conflict' }

/** Move an open lead and audit it in one statement. Its notes follow its ID. */
export async function moveLead({
  id,
  branchId,
  toBranchId,
  actorId,
}: {
  id: string
  branchId: string
  toBranchId: string
  actorId: string
}): Promise<MoveLeadResult> {
  const result = await db.execute<{
    lead_found: boolean
    destination_found: boolean
    destination_id: string | null
    destination_name: string | null
  }>(sql`
    with source_lead as (
      select ${lead.id} from ${lead} where ${leadAt(id, branchId)} for update
    ), destination as (
      select ${branch.id}, ${branch.name} from ${branch}
      where ${and(eq(branch.id, toBranchId), ne(branch.id, branchId), ne(branch.status, 'shutdown'))}
      for share
    ), moved as (
      update ${lead}
      set branch_id = destination.id, assigned_to = null, updated_at = now()
      from source_lead, destination
      where ${lead.id} = source_lead.id
        and ${inArray(lead.status, TRANSFERABLE_LEAD_STATUSES)}
      returning ${lead.id}, destination.id as destination_id, destination.name as destination_name
    ), audited as (
      insert into ${auditLog}
        (id, actor_id, action, entity_type, entity_id, branch_id, old_values, new_values)
      select ${nanoid()}, ${actorId}, 'update', 'lead', moved.id, ${branchId},
        jsonb_build_object('branchId', ${branchId}::text),
        jsonb_build_object('branchId', moved.destination_id, 'assignedTo', null)
      from moved
    )
    select exists(select 1 from source_lead) as lead_found,
      exists(select 1 from destination) as destination_found,
      moved.destination_id, moved.destination_name
    from (select 1) as result left join moved on true
  `)
  const row = result.rows[0]
  if (!row?.lead_found) return { ok: false, reason: 'not_found' }
  if (!row.destination_found) return { ok: false, reason: 'destination_unavailable' }
  if (row.destination_id === null || row.destination_name === null) {
    return { ok: false, reason: 'status_conflict' }
  }

  return { ok: true, destination: { id: row.destination_id, name: row.destination_name } }
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
