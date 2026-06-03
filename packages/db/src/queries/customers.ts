/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : customers
 * Scope        : Data Access — Customers
 *
 * Description  : Query functions for CRM customer management including search,
 *                profiles, tags, notes, bookings, invoices, and memberships.
 *
 * Responsibilities :
 * - Paginated, searchable, sortable customer directory
 * - Single customer profile with KPIs and tag chips
 * - Customer bookings, invoices, and membership lookups
 * - Tag CRUD (create, assign, remove) and note management
 * - Admin profile overrides (no-show reset, approval toggle)
 *
 * Features / Functionality :
 * - Multi-field search (name, phone, email) with ilike
 * - Sort by LTV, visits, last visit, gems, no-shows, or name
 * - Tag-based filtering via JOIN on customer_tag_assignment
 * - Separate count query for accurate pagination metadata
 * - Customer notes with author names and optional booking links
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index, ../schema/auth,
 *                ../schema/booking, ../schema/crm, ../schema/invoice,
 *                ../schema/loyalty, ../schema/membership, ../schema/profile
 *
 * Notes        : Customers are user rows with role 'customer' that have a
 *                customer_profile. Loyalty balance is LEFT JOINed (nullable).
 ************************************************************/

import type { CustomerListQuery } from '@rgss/types'
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking } from '../schema/booking'
import { customerNote, customerTag, customerTagAssignment } from '../schema/crm'
import { invoice } from '../schema/invoice'
import { loyaltyAccount } from '../schema/loyalty'
import { spaMembership } from '../schema/membership'
import { customerProfile } from '../schema/profile'

type CustomerSort = CustomerListQuery['sort']

// Map a sort key to its Drizzle order expression. `last_visit` and `gems` push
// NULLs to the end so customers with no visit/loyalty data rank last.
function buildCustomerOrderBy(sort: CustomerSort) {
  switch (sort) {
    case 'visits':
      return desc(customerProfile.totalVisits)
    case 'last_visit':
      return sql`${customerProfile.lastVisitAt} desc nulls last`
    case 'name':
      return asc(user.name)
    case 'gems':
      return sql`${loyaltyAccount.gemsBalance} desc nulls last`
    case 'noshows':
      return desc(customerProfile.noshowCount)
    default:
      return desc(customerProfile.totalSpentPaise)
  }
}

// Fetch the tag chips (slug/name/colour) for a set of customer ids in one query.
// Empty input → empty result.
async function getTagsForCustomers(customerIds: string[]) {
  if (customerIds.length === 0) {
    return []
  }
  return db
    .select({
      customerId: customerTagAssignment.customerId,
      slug: customerTag.slug,
      name: customerTag.name,
      color: customerTag.color,
    })
    .from(customerTagAssignment)
    .innerJoin(customerTag, eq(customerTagAssignment.tagId, customerTag.id))
    .where(inArray(customerTagAssignment.customerId, customerIds))
    .orderBy(asc(customerTag.name))
}

// Paginated, searchable, sortable customer directory. Customers are `user` rows
// with role 'customer' that have a customer_profile; the loyalty balance is
// LEFT JOINed (null when the account was never created). A separate count query
// applies the same filters so `totalCount` reflects the full filtered set.
export async function getCustomers(query: CustomerListQuery) {
  // Resolve a tag-slug filter to its id up front. An unknown slug matches nobody.
  let tagId: string | null = null
  if (query.tag) {
    const tagRows = await db
      .select({ id: customerTag.id })
      .from(customerTag)
      .where(eq(customerTag.slug, query.tag))
      .limit(1)
    if (!tagRows[0]) {
      return { rows: [], totalCount: 0 }
    }
    tagId = tagRows[0].id
  }

  const conditions = [eq(user.role, 'customer')]
  if (query.q) {
    const pattern = `%${query.q}%`
    const search = or(
      ilike(user.name, pattern),
      ilike(customerProfile.phone, pattern),
      ilike(user.email, pattern),
    )
    if (search) {
      conditions.push(search)
    }
  }

  const offset = (query.page - 1) * query.pageSize

  let dataQuery = db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: customerProfile.phone,
      totalVisits: customerProfile.totalVisits,
      totalSpentPaise: customerProfile.totalSpentPaise,
      noshowCount: customerProfile.noshowCount,
      firstVisitAt: customerProfile.firstVisitAt,
      lastVisitAt: customerProfile.lastVisitAt,
      gemsBalance: loyaltyAccount.gemsBalance,
      createdAt: user.createdAt,
    })
    .from(user)
    .innerJoin(customerProfile, eq(customerProfile.userId, user.id))
    .leftJoin(loyaltyAccount, eq(loyaltyAccount.customerId, user.id))
    .$dynamic()

  let countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .innerJoin(customerProfile, eq(customerProfile.userId, user.id))
    .$dynamic()

  if (tagId) {
    const tagJoin = and(
      eq(customerTagAssignment.customerId, user.id),
      eq(customerTagAssignment.tagId, tagId),
    )
    dataQuery = dataQuery.innerJoin(customerTagAssignment, tagJoin)
    countQuery = countQuery.innerJoin(customerTagAssignment, tagJoin)
  }

  const where = and(...conditions)
  const rows = await dataQuery
    .where(where)
    .orderBy(buildCustomerOrderBy(query.sort))
    .limit(query.pageSize)
    .offset(offset)

  const countResult = await countQuery.where(where)
  const totalCount = countResult[0]?.count ?? 0

  const tags = await getTagsForCustomers(rows.map((r) => r.id))

  const rowsWithTags = rows.map((r) => ({
    ...r,
    tags: tags
      .filter((t) => t.customerId === r.id)
      .map((t) => ({ slug: t.slug, name: t.name, color: t.color })),
  }))

  return { rows: rowsWithTags, totalCount }
}

// Single customer profile: user identity + customer_profile KPIs + gems balance
// + tag chips, or null if the user has no customer_profile.
export async function getCustomerProfile(userId: string) {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.image,
      phone: customerProfile.phone,
      gender: customerProfile.gender,
      dateOfBirth: customerProfile.dateOfBirth,
      totalVisits: customerProfile.totalVisits,
      totalSpentPaise: customerProfile.totalSpentPaise,
      noshowCount: customerProfile.noshowCount,
      lateCancellationCount: customerProfile.lateCancellationCount,
      bookingRequiresApproval: customerProfile.bookingRequiresApproval,
      firstVisitAt: customerProfile.firstVisitAt,
      lastVisitAt: customerProfile.lastVisitAt,
      gemsBalance: loyaltyAccount.gemsBalance,
      createdAt: user.createdAt,
    })
    .from(user)
    .innerJoin(customerProfile, eq(customerProfile.userId, user.id))
    .leftJoin(loyaltyAccount, eq(loyaltyAccount.customerId, user.id))
    .where(eq(user.id, userId))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  const tagRows = await getTagsForCustomers([userId])
  const tags = tagRows.map((t) => ({ slug: t.slug, name: t.name, color: t.color }))

  return { ...found, tags }
}

// Owner/manager overrides on a customer_profile (e.g. resetting the no-show
// count or toggling the booking-approval gate). Only the supplied keys are
// written; `updatedAt` is bumped automatically by the schema. Returns the
// updated profile row, or null when the user has no customer_profile.
type UpdateCustomerProfilePatch = {
  noshowCount?: number | undefined
  bookingRequiresApproval?: boolean | undefined
}

export async function updateCustomerProfile(userId: string, patch: UpdateCustomerProfilePatch) {
  const values: Partial<typeof customerProfile.$inferInsert> = {}
  if (patch.noshowCount !== undefined) {
    values.noshowCount = patch.noshowCount
  }
  if (patch.bookingRequiresApproval !== undefined) {
    values.bookingRequiresApproval = patch.bookingRequiresApproval
  }

  // Nothing to change → return the current row unchanged.
  if (Object.keys(values).length === 0) {
    const current = await db
      .select()
      .from(customerProfile)
      .where(eq(customerProfile.userId, userId))
      .limit(1)
    return current[0] ?? null
  }

  const [updated] = await db
    .update(customerProfile)
    .set(values)
    .where(eq(customerProfile.userId, userId))
    .returning()

  return updated ?? null
}

// A customer's bookings, newest first, paginated.
export async function getCustomerBookings(userId: string, limit: number, offset: number) {
  return db
    .select()
    .from(booking)
    .where(eq(booking.customerId, userId))
    .orderBy(desc(booking.bookingDate), desc(booking.createdAt))
    .limit(limit)
    .offset(offset)
}

// A customer's invoices, newest first, paginated.
export async function getCustomerInvoices(userId: string, limit: number, offset: number) {
  return db
    .select()
    .from(invoice)
    .where(eq(invoice.customerId, userId))
    .orderBy(desc(invoice.createdAt))
    .limit(limit)
    .offset(offset)
}

// A customer's memberships split into the single active one (if any) and past
// (expired/cancelled) memberships, newest first.
export async function getCustomerMembership(userId: string) {
  const rows = await db
    .select()
    .from(spaMembership)
    .where(eq(spaMembership.customerId, userId))
    .orderBy(desc(spaMembership.createdAt))

  const active = rows.find((m) => m.status === 'active') ?? null
  const past = rows.filter((m) => m.status !== 'active')

  return { active, past }
}

// A customer's notes, newest first, with each note's author name.
export async function getCustomerNotes(userId: string) {
  return db
    .select({
      id: customerNote.id,
      content: customerNote.content,
      bookingId: customerNote.bookingId,
      authorId: customerNote.authorId,
      authorName: user.name,
      createdAt: customerNote.createdAt,
    })
    .from(customerNote)
    .innerJoin(user, eq(customerNote.authorId, user.id))
    .where(eq(customerNote.customerId, userId))
    .orderBy(desc(customerNote.createdAt))
}

// All customer tags, alphabetical, for the tag picker.
export async function getAllTags() {
  return db.select().from(customerTag).orderBy(asc(customerTag.name))
}

type CreateTagData = {
  name: string
  color?: string
}

// Derive a url-safe slug: lowercase, runs of whitespace collapsed to hyphens.
function slugifyTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

// Create a tag, deriving its slug from the name. The id auto-defaults in schema.
export async function createTag(data: CreateTagData) {
  const [created] = await db
    .insert(customerTag)
    .values({
      name: data.name,
      slug: slugifyTagName(data.name),
      color: data.color ?? null,
    })
    .returning()

  return created as typeof customerTag.$inferSelect
}

// Assign a tag to a customer. Idempotent: a repeat assignment hits the composite
// primary key and is silently ignored, leaving exactly one assignment.
export async function assignTag(customerId: string, tagId: string, assignedBy: string) {
  await db
    .insert(customerTagAssignment)
    .values({ customerId, tagId, assignedBy })
    .onConflictDoNothing()
}

// Remove a tag assignment from a customer.
export async function removeTag(customerId: string, tagId: string) {
  await db
    .delete(customerTagAssignment)
    .where(
      and(eq(customerTagAssignment.customerId, customerId), eq(customerTagAssignment.tagId, tagId)),
    )
}

// Add a note to a customer, optionally linked to a booking. Id auto-defaults.
export async function addCustomerNote(
  customerId: string,
  authorId: string,
  content: string,
  bookingId?: string,
) {
  const [created] = await db
    .insert(customerNote)
    .values({
      customerId,
      authorId,
      content,
      bookingId: bookingId ?? null,
    })
    .returning()

  return created as typeof customerNote.$inferSelect
}
