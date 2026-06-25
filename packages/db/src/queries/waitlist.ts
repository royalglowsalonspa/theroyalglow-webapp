/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : waitlist
 * Scope        : Data Access — Waitlist
 *
 * Description  : Query functions for the admin Waitlist module — a paginated,
 *                status-filterable queue of customers waiting for a preferred
 *                slot, plus single-entry lookup and status transitions.
 *
 * Responsibilities :
 * - Paginated waitlist queue with optional status filter (newest first)
 * - Single waitlist entry lookup with customer + service detail
 * - Status transition (sets notifiedAt when moving to 'notified')
 *
 * Features / Functionality :
 * - JOIN customer name/email + service name + category name/type
 * - Separate count query for accurate pagination metadata
 * - Set-based update returning the mutated row
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index, ../schema/auth,
 *                ../schema/booking, ../schema/service
 *
 * Notes        : The waitlist row's status drives the queue; entries are
 *                status-transitioned, never hard-deleted. notifiedAt is stamped
 *                on the first move into 'notified'.
 ************************************************************/

import type { WaitlistListQuery, WaitlistStatus } from '@rgss/types'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { waitlist } from '../schema/booking'
import { service, serviceCategory } from '../schema/service'

// Columns the queue + detail views share: the waitlist row joined to the
// customer's identity and the requested service's name/category/type.
const waitlistSelection = {
  id: waitlist.id,
  customerId: waitlist.customerId,
  customerName: user.name,
  customerEmail: user.email,
  serviceId: waitlist.serviceId,
  serviceName: service.name,
  serviceType: serviceCategory.serviceType,
  categoryName: serviceCategory.name,
  preferredStaffId: waitlist.preferredStaffId,
  preferredDate: waitlist.preferredDate,
  preferredTimeStart: waitlist.preferredTimeStart,
  preferredTimeEnd: waitlist.preferredTimeEnd,
  status: waitlist.status,
  notifiedAt: waitlist.notifiedAt,
  createdAt: waitlist.createdAt,
}

// Paginated waitlist queue, newest first, optionally narrowed by status. The
// customer (user) and service (+ its category) are INNER JOINed — every entry
// has both by FK. A separate count query applies the same status filter so
// `totalCount` reflects the full filtered set, not just the current page.
export async function getWaitlist(query: WaitlistListQuery) {
  const where = query.status ? eq(waitlist.status, query.status) : undefined
  const offset = (query.page - 1) * query.pageSize

  const rows = await db
    .select(waitlistSelection)
    .from(waitlist)
    .innerJoin(user, eq(waitlist.customerId, user.id))
    .innerJoin(service, eq(waitlist.serviceId, service.id))
    .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
    .where(where)
    .orderBy(desc(waitlist.createdAt))
    .limit(query.pageSize)
    .offset(offset)

  // Count off the base table only — the status filter lives on waitlist, so the
  // JOINs are unnecessary for the total.
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(waitlist)
    .where(where)
  const totalCount = countResult[0]?.count ?? 0

  return { rows, totalCount }
}

// A single waitlist entry with customer + service detail, or null if not found.
export async function getWaitlistEntryById(id: string) {
  const rows = await db
    .select(waitlistSelection)
    .from(waitlist)
    .innerJoin(user, eq(waitlist.customerId, user.id))
    .innerJoin(service, eq(waitlist.serviceId, service.id))
    .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
    .where(eq(waitlist.id, id))
    .limit(1)

  return rows[0] ?? null
}

// Transition a waitlist entry's status. The first move into 'notified' stamps
// notifiedAt (when the customer was told their slot opened up); other
// transitions leave it untouched. The legality of the move is enforced by the
// route-layer state-machine guard before this is called. Returns the updated
// row, or null when the id matched nothing.
export async function updateWaitlistStatus(id: string, status: WaitlistStatus) {
  const values: Partial<typeof waitlist.$inferInsert> = { status }
  if (status === 'notified') {
    values.notifiedAt = new Date()
  }

  const [updated] = await db.update(waitlist).set(values).where(eq(waitlist.id, id)).returning()

  return updated ?? null
}
