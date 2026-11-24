/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : users
 * Scope        : Data Access — Users / people lookup
 *
 * Description  : Account lookups behind people administration: find a person
 *                by name, phone, or email for Users & Roles and for Add staff,
 *                and read one account by id or email.
 *
 * Responsibilities :
 * - Search accounts of ANY role by name, phone, or email (bounded result)
 * - Look up a single user by id or email (case-insensitive)
 *
 * Features / Functionality :
 * - Lookup, not a directory: a short term returns nothing and every result
 *   set is capped, so the screens never load the whole user table
 * - Same matching rules as the walk-in customer lookup (person-search.ts)
 * - Phone resolved from the customer profile, else the staff profile
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, @rgss/types, ../index, ../schema/auth,
 *                ../schema/profile, ./person-search
 *
 * Notes        : The walk-in lookup (getCustomers) is limited to onboarded
 *                customers, so it cannot find staff whose role needs changing.
 *                This lookup spans every account. Role changes themselves go
 *                through branch-roles.ts (getRoleSnapshot, applyBranchRolePlan).
 ************************************************************/

import { PERSON_SEARCH_MIN_LENGTH } from '@rgss/types'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'
import { customerProfile, staffProfile } from '../schema/profile'
import { personSearchCondition } from './person-search'

type StaffDesignation = (typeof staffProfile.$inferSelect)['designation']

// Shape returned to the people screens.
export interface AdminUserRow {
  id: string
  name: string
  email: string
  role: string | null
  image: string | null
  banned: boolean | null
  createdAt: Date
}

// A person's Staff roster entry, or null when they have no staff_profile.
export interface StaffRosterEntry {
  designation: StaffDesignation
  isActive: boolean
}

// A lookup match additionally carries the phone used to recognise the person
// and their roster entry.
export interface UserSearchRow extends AdminUserRow {
  phone: string | null
  staff: StaffRosterEntry | null
}

// Terms shorter than this match too broadly to be a lookup (R1.11).
export const USER_SEARCH_MIN_LENGTH = PERSON_SEARCH_MIN_LENGTH
// Upper bound on matches returned for one lookup.
export const USER_SEARCH_LIMIT = 10

const USER_COLUMNS = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  image: user.image,
  banned: user.banned,
  createdAt: user.createdAt,
} as const

// Find accounts of any role whose name, email, or phone matches `term`,
// alphabetical by name and capped at `limit`. Returns [] for a blank or too
// short term instead of listing everyone. A user has at most one customer and
// one staff profile (both UNIQUE on user_id), so the LEFT JOINs never fan out.
export async function searchUsers(
  term: string,
  limit: number = USER_SEARCH_LIMIT,
): Promise<UserSearchRow[]> {
  const trimmed = term.trim()
  if (trimmed.length < USER_SEARCH_MIN_LENGTH) {
    return []
  }

  const where = personSearchCondition(trimmed, {
    name: user.name,
    email: user.email,
    phones: [customerProfile.phone, staffProfile.phone],
  })

  const rows = await db
    .select({
      ...USER_COLUMNS,
      phone: sql<string | null>`coalesce(${customerProfile.phone}, ${staffProfile.phone})`,
      staffDesignation: staffProfile.designation,
      staffIsActive: staffProfile.isActive,
    })
    .from(user)
    .leftJoin(customerProfile, eq(customerProfile.userId, user.id))
    .leftJoin(staffProfile, eq(staffProfile.userId, user.id))
    .where(where)
    .orderBy(asc(user.name))
    .limit(Math.min(Math.max(limit, 1), USER_SEARCH_LIMIT))

  return rows.map(({ staffDesignation, staffIsActive, ...row }) => ({
    ...row,
    staff:
      staffDesignation === null || staffIsActive === null
        ? null
        : { designation: staffDesignation, isActive: staffIsActive },
  }))
}

/** The identity the people screens show for someone: never money or history. */
export interface PersonIdentity {
  id: string
  name: string
  email: string
  phone: string | null
}

// Name, email and phone for each id that exists, in no particular order.
export async function getPeopleByIds(ids: readonly string[]): Promise<PersonIdentity[]> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) {
    return []
  }
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: sql<string | null>`coalesce(${customerProfile.phone}, ${staffProfile.phone})`,
    })
    .from(user)
    .leftJoin(customerProfile, eq(customerProfile.userId, user.id))
    .leftJoin(staffProfile, eq(staffProfile.userId, user.id))
    .where(inArray(user.id, unique))
}

// Lookup by id.
export async function getUserById(id: string): Promise<AdminUserRow | null> {
  const rows = await db.select(USER_COLUMNS).from(user).where(eq(user.id, id)).limit(1)
  return rows[0] ?? null
}

// Case-insensitive lookup by email. `email` is expected pre-lowercased by the
// caller; we lower() the column too so legacy mixed-case rows match.
export async function getUserByEmail(email: string): Promise<AdminUserRow | null> {
  const rows = await db
    .select(USER_COLUMNS)
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1)
  return rows[0] ?? null
}
