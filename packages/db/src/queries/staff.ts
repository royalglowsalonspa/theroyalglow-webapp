/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : staff
 * Scope        : Data Access — Staff management (admin)
 *
 * Description  : Admin-wide staff queries backing the Staff management module:
 *                the management list (staff_profile joined to user identity with
 *                an assigned-service count), a single staff member with their
 *                assigned serviceIds, a partial profile update, and a wholesale
 *                replacement of a staff member's service capabilities.
 *
 * Responsibilities :
 * - List all staff (profile + user name/email/role) with service counts
 * - Fetch one staff profile + identity + assigned serviceIds (getStaffById)
 * - Read just the assigned serviceIds for a staff member
 * - Create a staff_profile by linking an existing user account (by email)
 * - Patch only the provided staff_profile columns
 * - Replace the staff_service rows for a staff member atomically
 *
 * Features / Functionality :
 * - Set-based service counts via a single group-by (no N+1)
 * - Partial update mirrors the updateService pattern (exactOptionalProps safe)
 * - Atomic capability replacement via db.batch (delete + insert)
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index, ../schema/auth,
 *                ../schema/profile, ../schema/service
 *
 * Notes        : neon-http has no interactive transactions (db.transaction
 *                throws), so the capability replacement uses db.batch() — a
 *                single atomic, server-side transaction round-trip. Referential
 *                safety (staff + service existence) is enforced at the API
 *                boundary before these run; FKs are ON DELETE CASCADE.
 ************************************************************/

import type { StaffCreateInput, StaffProfileUpdateInput } from '@rgss/types'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { staffProfile } from '../schema/profile'
import { staffService } from '../schema/service'

// Role hierarchy (mirrors apps/admin rbac ROLE_LEVELS). Used only to decide
// whether a linked account should be promoted to 'staff' on profile creation —
// never to demote a higher role (e.g. a manager who also performs services).
const ROLE_LEVEL: Record<string, number> = {
  customer: 0,
  staff: 1,
  receptionist: 2,
  manager: 3,
  owner: 4,
  developer: 5,
}

// All staff (profile + user identity), each with its assigned-service count.
// Two set-based queries (staff, then counts grouped by staff) mapped in memory
// — never one count query per row.
export async function getStaffForAdmin() {
  const staff = await db
    .select({
      id: staffProfile.id,
      userId: staffProfile.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: staffProfile.phone,
      designation: staffProfile.designation,
      bio: staffProfile.bio,
      specialization: staffProfile.specialization,
      isActive: staffProfile.isActive,
      hireDate: staffProfile.hireDate,
      createdAt: staffProfile.createdAt,
    })
    .from(staffProfile)
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .orderBy(asc(user.name))

  const counts = await db
    .select({ staffId: staffService.staffId, count: sql<number>`count(*)::int` })
    .from(staffService)
    .groupBy(staffService.staffId)

  const countByStaff = new Map(counts.map((c) => [c.staffId, c.count]))
  return staff.map((s) => ({ ...s, serviceCount: countByStaff.get(s.id) ?? 0 }))
}

// A single staff member: profile + user identity + the list of serviceIds they
// can perform, or null if the profile is missing.
export async function getStaffProfileById(id: string) {
  const rows = await db
    .select({
      id: staffProfile.id,
      userId: staffProfile.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: staffProfile.phone,
      designation: staffProfile.designation,
      bio: staffProfile.bio,
      specialization: staffProfile.specialization,
      isActive: staffProfile.isActive,
      hireDate: staffProfile.hireDate,
      createdAt: staffProfile.createdAt,
      updatedAt: staffProfile.updatedAt,
    })
    .from(staffProfile)
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(eq(staffProfile.id, id))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }

  const assigned = await db
    .select({ serviceId: staffService.serviceId })
    .from(staffService)
    .where(eq(staffService.staffId, id))

  return { ...found, serviceIds: assigned.map((r) => r.serviceId) }
}

// Spec alias — the Staff management spec refers to this lookup as getStaffById.
// Same row shape (profile + identity + assigned serviceIds) or null.
export const getStaffById = getStaffProfileById

// Just the serviceIds a staff member can perform (a single set-based read).
// Useful for the assignment editor's initial state without the full profile.
export async function getStaffServiceIds(staffId: string): Promise<string[]> {
  const rows = await db
    .select({ serviceId: staffService.serviceId })
    .from(staffService)
    .where(eq(staffService.staffId, staffId))
  return rows.map((r) => r.serviceId)
}

// Outcome of a create attempt. A tagged result keeps the API route thin: it maps
// `user_not_found` → 404 ("ask them to sign in first") and `already_staff` → 409
// without the query layer importing the errors package.
export type CreateStaffProfileResult =
  | { ok: true; staff: typeof staffProfile.$inferSelect }
  | { ok: false; reason: 'user_not_found' | 'already_staff' }

// Create a staff_profile by linking an EXISTING user account (matched by email,
// case-insensitively). Returns `user_not_found` when no account exists (the
// admin must ask them to sign in first) and `already_staff` when the account
// already has a profile (the unique user_id constraint). On success the account
// is promoted to role 'staff' only when its current role ranks lower, then the
// profile is inserted and returned.
export async function createStaffProfile(
  data: StaffCreateInput,
): Promise<CreateStaffProfileResult> {
  const email = data.email.trim().toLowerCase()

  const accounts = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1)
  const account = accounts[0]
  if (!account) {
    return { ok: false, reason: 'user_not_found' }
  }

  const existingProfile = await db
    .select({ id: staffProfile.id })
    .from(staffProfile)
    .where(eq(staffProfile.userId, account.id))
    .limit(1)
  if (existingProfile[0]) {
    return { ok: false, reason: 'already_staff' }
  }

  // Promote to 'staff' only when the current role ranks lower (never demote a
  // manager/owner who is also being added as a performing staff member).
  const currentLevel = ROLE_LEVEL[account.role ?? 'customer'] ?? 0
  if (currentLevel < (ROLE_LEVEL.staff ?? 1)) {
    await db.update(user).set({ role: 'staff' }).where(eq(user.id, account.id))
  }

  const [created] = await db
    .insert(staffProfile)
    .values({
      userId: account.id,
      designation: data.designation,
      phone: data.phone ?? null,
      bio: data.bio ?? null,
      specialization: data.specialization ?? null,
      hireDate: data.hireDate ?? null,
    })
    .returning()

  return { ok: true, staff: created as typeof staffProfile.$inferSelect }
}

// Patch a staff_profile. Only provided keys are written; nullable text columns
// accept null to clear. `updatedAt` auto-bumps. Returns the updated row or null.
export async function updateStaffProfile(id: string, patch: StaffProfileUpdateInput) {
  const values: Partial<typeof staffProfile.$inferInsert> = {}
  if (patch.designation !== undefined) {
    values.designation = patch.designation
  }
  if (patch.phone !== undefined) {
    values.phone = patch.phone ?? null
  }
  if (patch.bio !== undefined) {
    values.bio = patch.bio ?? null
  }
  if (patch.specialization !== undefined) {
    values.specialization = patch.specialization ?? null
  }
  if (patch.isActive !== undefined) {
    values.isActive = patch.isActive
  }
  if (patch.hireDate !== undefined) {
    values.hireDate = patch.hireDate ?? null
  }

  if (Object.keys(values).length === 0) {
    const rows = await db.select().from(staffProfile).where(eq(staffProfile.id, id)).limit(1)
    return rows[0] ?? null
  }

  const [updated] = await db
    .update(staffProfile)
    .set(values)
    .where(eq(staffProfile.id, id))
    .returning()
  return updated ?? null
}

// Replace the staff_service rows for a staff member atomically. IDs are
// de-duplicated; an empty set clears all capabilities. Returns the persisted
// (de-duplicated) serviceIds. Referential safety is validated by the caller.
export async function setStaffServices(staffId: string, serviceIds: string[]) {
  const unique = [...new Set(serviceIds)]
  const deleteExisting = db.delete(staffService).where(eq(staffService.staffId, staffId))

  if (unique.length === 0) {
    await deleteExisting
    return []
  }

  await db.batch([
    deleteExisting,
    db.insert(staffService).values(unique.map((serviceId) => ({ staffId, serviceId }))),
  ])
  return unique
}
