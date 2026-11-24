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
 *                Multi-branch (R3): identity, tags, gems and memberships are
 *                shared by every branch; money is per branch. Every money
 *                figure here is computed from one branch's paid invoices, and
 *                the customer-wide total_spent_paise counter is never returned.
 ************************************************************/

import type {
  CustomerHistoryEntry,
  CustomerListQuery,
  CustomerNoteView,
  NoteVisibility,
  OnboardingConsentReceipt,
} from '@rgss/types'
import { and, asc, desc, eq, inArray, ne, or, type SQL, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking, bookingService } from '../schema/booking'
import { branch } from '../schema/branch'
import { customerNote, customerTag, customerTagAssignment } from '../schema/crm'
import { invoice } from '../schema/invoice'
import { loyaltyAccount } from '../schema/loyalty'
import { spaMembership } from '../schema/membership'
import { customerProfile } from '../schema/profile'
import { auditLog } from '../schema/system'
import { personSearchCondition } from './person-search'

type CustomerSort = CustomerListQuery['sort']

// What one branch has been paid by each customer: paid invoices of every type
// (service and membership purchase; sessions are ₹0), the LTV definition in
// customer-stats, restricted to the branch (R3.2).
function branchSpendByCustomer(branchId: string) {
  return db
    .select({
      customerId: invoice.customerId,
      spentPaise: sql<number>`sum(${invoice.totalAmountPaise})::int`.as('spent_paise'),
    })
    .from(invoice)
    .where(and(eq(invoice.branchId, branchId), eq(invoice.paymentStatus, 'paid')))
    .groupBy(invoice.customerId)
    .as('branch_spend')
}

// Map a sort key to its Drizzle order expression. `ltv` ranks by the branch's
// own takings, never the customer-wide counter. `last_visit` and `gems` push
// NULLs to the end so customers with no visit/loyalty data rank last.
function buildCustomerOrderBy(sort: CustomerSort, branchSpent: SQL<number>) {
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
      return sql`${branchSpent} desc`
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
// Every branch sees every customer (shared identity), but `branchSpentPaise`
// and the LTV sort count only `branchId`'s paid invoices (R3.2). Visits and
// last visit are shared visit history.
export async function getCustomers(branchId: string, query: CustomerListQuery) {
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
    // Shared with the Users & Roles lookup, so both screens match the same way
    // (name / email substring, phone by digits).
    const search = personSearchCondition(query.q, {
      name: user.name,
      email: user.email,
      phones: [customerProfile.phone],
    })
    if (search) {
      conditions.push(search)
    }
  }

  const offset = (query.page - 1) * query.pageSize
  const branchSpend = branchSpendByCustomer(branchId)
  const branchSpent = sql<number>`coalesce(${branchSpend.spentPaise}, 0)`

  let dataQuery = db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: customerProfile.phone,
      totalVisits: customerProfile.totalVisits,
      branchSpentPaise: branchSpent,
      noshowCount: customerProfile.noshowCount,
      firstVisitAt: customerProfile.firstVisitAt,
      lastVisitAt: customerProfile.lastVisitAt,
      gemsBalance: loyaltyAccount.gemsBalance,
      createdAt: user.createdAt,
    })
    .from(user)
    .innerJoin(customerProfile, eq(customerProfile.userId, user.id))
    .leftJoin(loyaltyAccount, eq(loyaltyAccount.customerId, user.id))
    .leftJoin(branchSpend, eq(branchSpend.customerId, user.id))
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
  // The id tie-break keeps offset pages stable: many customers share a sort
  // value (for example nothing spent at this branch yet).
  const rows = await dataQuery
    .where(where)
    .orderBy(buildCustomerOrderBy(query.sort, branchSpent), asc(user.id))
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

// Single customer profile: shared identity + visit and no-show KPIs + gems
// balance + tag chips, or null if the user has no customer_profile. Shared by
// every branch, so it carries no money; see getCustomerBranchSpend (R3.2).
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

// Existence probe for a user's customer_profile — the "has this user completed
// onboarding?" question. Deliberately selects a single constant column with
// LIMIT 1 (no joins, no row payload) because the only consumers are routing
// gates that run on every authenticated page render and need the cheapest
// possible round-trip. Use `getCustomerProfile` when the profile DATA is needed.
export async function hasCustomerProfile(userId: string): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(customerProfile)
    .where(eq(customerProfile.userId, userId))
    .limit(1)

  return rows.length > 0
}

// The fields /onboarding collects. Phone, gender and date of birth are required
// here because a profile is what makes a customer bookable. Everything else on
// customer_profile (visit KPIs, no-show state, reminder toggles) keeps its
// schema default at creation.
export type NewCustomerProfile = {
  userId: string
  phone: string
  gender: NonNullable<(typeof customerProfile.$inferInsert)['gender']>
  dateOfBirth: Date
  marketingConsent: boolean
  marketingConsentAt: Date | null
  acquisitionSource: string
  utmSource: string | null
  utmCampaign: string | null
  utmMedium: string | null
}

// Create the customer_profile that completes onboarding, together with the
// customer's consent receipt (see OnboardingConsentReceipt), and return the
// profile id. Both rows are written in ONE db.batch() transaction (neon-http has
// no interactive transactions), so a profile never exists without a record of
// the consent that allowed it. `user_id` is UNIQUE, so a concurrent duplicate
// submit fails on the constraint and rolls the whole batch back.
export async function createCustomerProfile(
  values: NewCustomerProfile,
  consent: OnboardingConsentReceipt,
  consentedAt: Date,
): Promise<{ id: string }> {
  const profileId = nanoid()

  const [inserted] = await db.batch([
    db
      .insert(customerProfile)
      .values({ ...values, id: profileId })
      .returning({ id: customerProfile.id }),
    db.insert(auditLog).values({
      actorId: values.userId,
      action: 'create',
      entityType: 'customer_profile',
      entityId: profileId,
      newValues: consent,
      createdAt: consentedAt,
    }),
  ])

  const row = inserted[0]
  if (!row) {
    throw new Error('customer_profile insert returned no rows.')
  }
  return row
}

// Owner/manager overrides on a customer_profile (e.g. resetting the no-show
// count or toggling the booking-approval gate). Only the supplied keys are
// written; `updatedAt` is bumped automatically by the schema. Returns the
// customer's gates after the change, or null when the user has no
// customer_profile. Never the whole row: it holds the customer-wide spending
// counter (R3.2).
type UpdateCustomerProfilePatch = {
  noshowCount?: number | undefined
  bookingRequiresApproval?: boolean | undefined
}

const customerGates = {
  id: customerProfile.userId,
  noshowCount: customerProfile.noshowCount,
  bookingRequiresApproval: customerProfile.bookingRequiresApproval,
}

export async function updateCustomerProfile(userId: string, patch: UpdateCustomerProfilePatch) {
  const values: Partial<typeof customerProfile.$inferInsert> = {}
  if (patch.noshowCount !== undefined) {
    values.noshowCount = patch.noshowCount
  }
  if (patch.bookingRequiresApproval !== undefined) {
    values.bookingRequiresApproval = patch.bookingRequiresApproval
  }

  // Nothing to change → return the current gates unchanged.
  if (Object.keys(values).length === 0) {
    const current = await db
      .select(customerGates)
      .from(customerProfile)
      .where(eq(customerProfile.userId, userId))
      .limit(1)
    return current[0] ?? null
  }

  const [updated] = await db
    .update(customerProfile)
    .set(values)
    .where(eq(customerProfile.userId, userId))
    .returning(customerGates)

  return updated ?? null
}

// Read the caller's notification preference flags from their customer_profile.
// Returns null when the user has no profile yet (e.g. onboarding incomplete);
// the caller is responsible for choosing sensible defaults in that case.
export async function getNotificationPreferences(userId: string) {
  const rows = await db
    .select({
      appointmentRemindersEnabled: customerProfile.appointmentRemindersEnabled,
      membershipAlertsEnabled: customerProfile.membershipAlertsEnabled,
      marketingConsent: customerProfile.marketingConsent,
    })
    .from(customerProfile)
    .where(eq(customerProfile.userId, userId))
    .limit(1)

  return rows[0] ?? null
}

// Update only the supplied notification preference flags on the caller's own
// customer_profile (scoped by userId). Toggling `marketingConsent` also stamps
// (or clears) `marketingConsentAt` to keep the consent audit trail consistent
// with the onboarding flow. Returns the updated row, or null when the user has
// no customer_profile.
type UpdateNotificationPreferencesPatch = {
  appointmentRemindersEnabled?: boolean | undefined
  membershipAlertsEnabled?: boolean | undefined
  marketingConsent?: boolean | undefined
}

export async function updateNotificationPreferences(
  userId: string,
  prefs: UpdateNotificationPreferencesPatch,
) {
  const values: Partial<typeof customerProfile.$inferInsert> = {}
  if (prefs.appointmentRemindersEnabled !== undefined) {
    values.appointmentRemindersEnabled = prefs.appointmentRemindersEnabled
  }
  if (prefs.membershipAlertsEnabled !== undefined) {
    values.membershipAlertsEnabled = prefs.membershipAlertsEnabled
  }
  if (prefs.marketingConsent !== undefined) {
    values.marketingConsent = prefs.marketingConsent
    values.marketingConsentAt = prefs.marketingConsent ? new Date() : null
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

/**
 * What the customer paid one branch, and how many visits that took (R3.2):
 * paid invoices of every type at the branch (the customer-stats LTV
 * definition) and completed bookings there. One round trip.
 */
export async function getCustomerBranchSpend(customerId: string, branchId: string) {
  const [spend, visits] = await db.batch([
    db
      .select({ paise: sql<number>`coalesce(sum(${invoice.totalAmountPaise}), 0)::int` })
      .from(invoice)
      .where(
        and(
          eq(invoice.customerId, customerId),
          eq(invoice.branchId, branchId),
          eq(invoice.paymentStatus, 'paid'),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(booking)
      .where(
        and(
          eq(booking.customerId, customerId),
          eq(booking.branchId, branchId),
          eq(booking.status, 'completed'),
        ),
      ),
  ])
  return { spentPaise: spend[0]?.paise ?? 0, visits: visits[0]?.count ?? 0 }
}

// Service names on each booking, in booking order.
async function getServiceNamesForBookings(bookingIds: string[]): Promise<Map<string, string[]>> {
  const names = new Map<string, string[]>()
  if (bookingIds.length === 0) {
    return names
  }
  const rows = await db
    .select({ bookingId: bookingService.bookingId, name: bookingService.serviceNameSnapshot })
    .from(bookingService)
    .where(inArray(bookingService.bookingId, bookingIds))
    .orderBy(asc(bookingService.bookingId), asc(bookingService.displayOrder))
  for (const row of rows) {
    const list = names.get(row.bookingId)
    if (list) {
      list.push(row.name)
    } else {
      names.set(row.bookingId, [row.name])
    }
  }
  return names
}

// A `date` column as YYYY-MM-DD (Drizzle reads it as UTC midnight).
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/**
 * A customer's history as one branch sees it (R3.2), each list newest first
 * and at most `limit` long, so merging them yields the true newest `limit`:
 * - `thisBranch`: every booking at the branch, with its number and amount;
 * - `otherBranches`: completed visits elsewhere with only their date, branch
 *   and services. Their amounts and ids are never selected.
 */
export async function getCustomerHistory(customerId: string, branchId: string, limit: number) {
  const newestFirst = [desc(booking.bookingDate), desc(booking.startTime), desc(booking.createdAt)]
  const [own, elsewhere] = await Promise.all([
    db
      .select({
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        bookingDate: booking.bookingDate,
        startTime: booking.startTime,
        serviceType: booking.serviceType,
        status: booking.status,
        isMembershipSession: booking.isMembershipSession,
        totalAmountPaise: booking.totalAmountPaise,
      })
      .from(booking)
      .where(and(eq(booking.customerId, customerId), eq(booking.branchId, branchId)))
      .orderBy(...newestFirst)
      .limit(limit),
    db
      .select({
        id: booking.id,
        branchName: branch.name,
        bookingDate: booking.bookingDate,
        startTime: booking.startTime,
        serviceType: booking.serviceType,
      })
      .from(booking)
      .innerJoin(branch, eq(branch.id, booking.branchId))
      .where(
        and(
          eq(booking.customerId, customerId),
          ne(booking.branchId, branchId),
          eq(booking.status, 'completed'),
        ),
      )
      .orderBy(...newestFirst)
      .limit(limit),
  ])

  const services = await getServiceNamesForBookings([
    ...own.map((b) => b.id),
    ...elsewhere.map((b) => b.id),
  ])

  const thisBranch = own.map(
    (b): CustomerHistoryEntry => ({
      scope: 'this_branch',
      bookingId: b.id,
      bookingNumber: b.bookingNumber,
      bookingDate: isoDate(b.bookingDate),
      startTime: b.startTime,
      serviceType: b.serviceType,
      status: b.status,
      isMembershipSession: b.isMembershipSession,
      totalAmountPaise: b.totalAmountPaise,
      services: services.get(b.id) ?? [],
    }),
  )
  const otherBranches = elsewhere.map(
    (b): CustomerHistoryEntry => ({
      scope: 'other_branch',
      branchName: b.branchName,
      bookingDate: isoDate(b.bookingDate),
      startTime: b.startTime,
      serviceType: b.serviceType,
      services: services.get(b.id) ?? [],
    }),
  )
  return { thisBranch, otherBranches }
}

// A customer's invoices at one branch, newest first, paginated. Another
// branch's invoices are never listed (R3.2, R3.4).
export async function getCustomerInvoices(
  customerId: string,
  branchId: string,
  limit: number,
  offset: number,
) {
  return db
    .select({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.invoiceType,
      paymentStatus: invoice.paymentStatus,
      totalAmountPaise: invoice.totalAmountPaise,
      gemsEarned: invoice.gemsEarned,
      createdAt: invoice.createdAt,
    })
    .from(invoice)
    .where(and(eq(invoice.customerId, customerId), eq(invoice.branchId, branchId)))
    .orderBy(desc(invoice.createdAt), desc(invoice.id))
    .limit(limit)
    .offset(offset)
}

/** Is this booking the customer's, at this branch? Notes may only link those. */
export async function isCustomerBookingAtBranch(
  bookingId: string,
  customerId: string,
  branchId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: booking.id })
    .from(booking)
    .where(
      and(
        eq(booking.id, bookingId),
        eq(booking.customerId, customerId),
        eq(booking.branchId, branchId),
      ),
    )
    .limit(1)
  return rows.length > 0
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

/**
 * The notes one branch may read, newest first (R3.1): every shared note, and
 * the branch's own private notes. Another branch's private note is never
 * returned, nor is a private note with no branch.
 */
export async function getCustomerNotes(
  customerId: string,
  branchId: string,
): Promise<CustomerNoteView[]> {
  const rows = await db
    .select({
      id: customerNote.id,
      content: customerNote.content,
      authorName: user.name,
      branchName: branch.name,
      visibility: customerNote.visibility,
      createdAt: customerNote.createdAt,
    })
    .from(customerNote)
    .innerJoin(user, eq(customerNote.authorId, user.id))
    .leftJoin(branch, eq(branch.id, customerNote.branchId))
    .where(
      and(
        eq(customerNote.customerId, customerId),
        or(eq(customerNote.visibility, 'shared'), eq(customerNote.branchId, branchId)),
      ),
    )
    .orderBy(desc(customerNote.createdAt), desc(customerNote.id))
  return rows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))
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

type NewCustomerNote = {
  customerId: string
  authorId: string
  /** The branch whose staff writes it. */
  branchId: string
  content: string
  /** Chosen by the writer: every branch, or only `branchId` (R3.1). */
  visibility: NoteVisibility
  /** A booking of the customer's at `branchId`; the caller checks this. */
  bookingId?: string | undefined
}

// Add a note to a customer, optionally linked to a booking. Id auto-defaults.
export async function addCustomerNote(note: NewCustomerNote) {
  const [created] = await db
    .insert(customerNote)
    .values({
      customerId: note.customerId,
      authorId: note.authorId,
      branchId: note.branchId,
      visibility: note.visibility,
      content: note.content,
      bookingId: note.bookingId ?? null,
    })
    .returning({
      id: customerNote.id,
      content: customerNote.content,
      visibility: customerNote.visibility,
      bookingId: customerNote.bookingId,
      createdAt: customerNote.createdAt,
    })

  if (!created) {
    throw new Error('customer_note insert returned no rows.')
  }
  return created
}
