/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 28-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : staff
 * Scope        : Data Access — Staff at a branch (admin)
 *
 * Description  : Queries behind the Staff page and the staff pickers, always
 *                for one branch: who works there (its Manager, Receptionist,
 *                Stylists and Therapists), one staff member there with the
 *                services they perform, a scoped profile edit, and the
 *                wholesale replacement of their service capabilities.
 *
 * Responsibilities :
 * - List the people who work at a branch, with service counts
 * - The lean picker list of a branch's active staff
 * - Fetch one staff member at a branch, with their serviceIds
 * - Patch a staff member's profile, only while they work at the branch
 * - Replace the staff_service rows for a staff member atomically
 *
 * Features / Functionality :
 * - "Works at" comes from the role relationships of migration 0004: an active
 *   profile that grants its role, at the branch, or the branch's Manager
 * - A record at another branch reads as not found (multi-branch R2.3)
 * - Set-based service counts via a single group-by (no N+1)
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index, ../schema/auth,
 *                ../schema/branch, ../schema/profile, ../schema/service
 *
 * Notes        : Adding and removing people changes roles, so it goes through
 *                branch-roles.ts (one transaction with the role, profile,
 *                branch and audit entry). Removed staff keep their profile,
 *                inactive, so bookings and invoices keep their staff.
 ************************************************************/

import type { StaffProfileUpdateInput } from '@rgss/types'
import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { booking, bookingService } from '../schema/booking'
import { branch } from '../schema/branch'
import { staffProfile } from '../schema/profile'
import { staffService } from '../schema/service'

/** A role a staff profile can grant (its role witness). */
export type StaffRoleWitness = 'staff' | 'receptionist' | 'manager'

/**
 * The profiles of people who work at `branchId`: active, granting their role,
 * and either at the branch (Stylists, Therapists, the Receptionist) or the
 * branch's Manager, whose branches come from branch.manager_user_id.
 */
export function staffWorksAt(branchId: string): SQL {
  return worksAt(branchId)
}

function worksAt(branchId: string): SQL {
  return sql`(${staffProfile.isActive} = true and ${staffProfile.roleWitness} is not null
    and (${staffProfile.branchId} = ${branchId}
      or ${staffProfile.userId} = (select ${branch.managerUserId} from ${branch} where ${branch.id} = ${branchId})))`
}

const STAFF_COLUMNS = {
  id: staffProfile.id,
  userId: staffProfile.userId,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: staffProfile.phone,
  designation: staffProfile.designation,
  roleWitness: staffProfile.roleWitness,
  bio: staffProfile.bio,
  specialization: staffProfile.specialization,
  isActive: staffProfile.isActive,
  hireDate: staffProfile.hireDate,
  createdAt: staffProfile.createdAt,
  updatedAt: staffProfile.updatedAt,
} as const

// The people who work at a branch, each with their assigned-service count.
// Two set-based queries (staff, then counts grouped by staff) mapped in memory
// — never one count query per row.
export async function getBranchStaff(branchId: string) {
  const staff = await db
    .select(STAFF_COLUMNS)
    .from(staffProfile)
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(worksAt(branchId))
    .orderBy(asc(user.name))
  if (staff.length === 0) {
    return []
  }

  const counts = await db
    .select({ staffId: staffService.staffId, count: sql<number>`count(*)::int` })
    .from(staffService)
    .where(
      inArray(
        staffService.staffId,
        staff.map((s) => s.id),
      ),
    )
    .groupBy(staffService.staffId)

  const countByStaff = new Map(counts.map((c) => [c.staffId, c.count]))
  return staff.map((s) => ({ ...s, serviceCount: countByStaff.get(s.id) ?? 0 }))
}

// The active staff at a branch with their names, for assignment pickers.
export async function getActiveStaffAtBranch(branchId: string) {
  return db
    .select({
      id: staffProfile.id,
      userId: staffProfile.userId,
      name: user.name,
      designation: staffProfile.designation,
    })
    .from(staffProfile)
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(worksAt(branchId))
    .orderBy(asc(user.name))
}

// Whether the staff profile works at the branch now: who a booking there may
// be assigned to.
export async function isStaffAtBranch(id: string, branchId: string): Promise<boolean> {
  const rows = await db
    .select({ id: staffProfile.id })
    .from(staffProfile)
    .where(and(eq(staffProfile.id, id), worksAt(branchId)))
    .limit(1)
  return rows.length > 0
}

// One staff member who works at the branch, with the serviceIds they can
// perform, or null when there is no such profile there.
export async function getStaffMemberAtBranch(id: string, branchId: string) {
  const rows = await db
    .select(STAFF_COLUMNS)
    .from(staffProfile)
    .innerJoin(user, eq(staffProfile.userId, user.id))
    .where(and(eq(staffProfile.id, id), worksAt(branchId)))
    .limit(1)

  const found = rows[0]
  if (!found) {
    return null
  }
  return { ...found, serviceIds: await getStaffServiceIds(id) }
}

// Confirmed bookings still to come at the branch that name this staff member:
// what removing them lists for reassignment (R1.7). Same rule as the release
// in reassignments.ts: starting now or later in IST.
export async function countUpcomingAssignments(staffId: string, branchId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${booking.id})::int` })
    .from(bookingService)
    .innerJoin(booking, eq(bookingService.bookingId, booking.id))
    .where(
      and(
        eq(bookingService.staffId, staffId),
        eq(booking.branchId, branchId),
        eq(booking.status, 'confirmed'),
        sql`((${booking.bookingDate} + ${booking.startTime}) at time zone 'Asia/Kolkata') >= now()`,
      ),
    )
  return row?.count ?? 0
}

// Just the serviceIds a staff member can perform (a single set-based read).
export async function getStaffServiceIds(staffId: string): Promise<string[]> {
  const rows = await db
    .select({ serviceId: staffService.serviceId })
    .from(staffService)
    .where(eq(staffService.staffId, staffId))
  return rows.map((r) => r.serviceId)
}

/**
 * Patch the profile of a staff member who works at `branchId` and whose role
 * is one of `roles`. Only provided keys are written; nullable text columns
 * accept null to clear. A title change applies only to a Stylist or
 * Therapist, so it also requires the Staff role. Returns the updated row, or
 * null when no such staff member works there (moved, removed or never).
 */
export async function updateStaffMemberAtBranch(params: {
  id: string
  branchId: string
  roles: readonly StaffRoleWitness[]
  patch: Omit<StaffProfileUpdateInput, 'branchId'>
}) {
  const { id, branchId, patch } = params
  const roles =
    patch.designation === undefined ? params.roles : params.roles.filter((r) => r === 'staff')
  if (roles.length === 0) {
    return null
  }

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
  if (patch.hireDate !== undefined) {
    values.hireDate = patch.hireDate ?? null
  }
  // Nothing to write still has to match, so `updatedAt` is always set.
  values.updatedAt = new Date()

  const [updated] = await db
    .update(staffProfile)
    .set(values)
    .where(
      and(
        eq(staffProfile.id, id),
        worksAt(branchId),
        inArray(staffProfile.roleWitness, [...roles]),
      ),
    )
    .returning({ id: staffProfile.id })
  return updated ? getStaffMemberAtBranch(updated.id, branchId) : null
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
