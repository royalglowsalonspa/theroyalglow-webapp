/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : users
 * Scope        : Data Access — Users / RBAC administration
 *
 * Description  : Query functions backing the owner-facing role administration
 *                screen (admin.theroyalglow.in/users): list/search users and
 *                set a user's RBAC role by email.
 *
 * Responsibilities :
 * - Return a searchable directory of user accounts (name, email, role)
 * - Look up a single user by email (case-insensitive)
 * - Update a user's role by email (case-insensitive), returning the new row
 *
 * Features / Functionality :
 * - Case-insensitive email matching (Google emails are case-insensitive)
 * - Multi-field search (name OR email) via ilike
 * - Parameterised queries only (no SQL string concatenation)
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index, ../schema/auth
 *
 * Notes        : The privilege-ceiling / self-edit guards live in the API
 *                route — these queries are deliberately unopinionated so they
 *                stay reusable and easy to test.
 ************************************************************/

import { asc, ilike, or, sql } from 'drizzle-orm'
import { db } from '../index'
import { user } from '../schema/auth'

// Shape returned to the admin directory + role-assignment screens.
export interface AdminUserRow {
  id: string
  name: string
  email: string
  role: string | null
  image: string | null
  banned: boolean | null
  createdAt: Date
}

const USER_COLUMNS = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  image: user.image,
  banned: user.banned,
  createdAt: user.createdAt,
} as const

// Searchable user directory (name OR email), alphabetical by name. Capped at
// 100 rows — the directory is a lookup/admin tool, not a paginated report.
export async function listUsers(opts: { search?: string } = {}): Promise<AdminUserRow[]> {
  const term = opts.search?.trim()
  const where = term ? or(ilike(user.name, `%${term}%`), ilike(user.email, `%${term}%`)) : undefined

  return db.select(USER_COLUMNS).from(user).where(where).orderBy(asc(user.name)).limit(100)
}

// Case-insensitive lookup by email. `email` is expected pre-lowercased by the
// caller's Zod schema; we lower() the column too so legacy mixed-case rows match.
export async function getUserByEmail(email: string): Promise<AdminUserRow | null> {
  const rows = await db
    .select(USER_COLUMNS)
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1)
  return rows[0] ?? null
}

// Set a user's role by email (case-insensitive). Returns the updated row, or
// null when no user matches that email. `updatedAt` is bumped via $onUpdate.
export async function updateUserRoleByEmail(
  email: string,
  role: string,
): Promise<AdminUserRow | null> {
  const rows = await db
    .update(user)
    .set({ role })
    .where(sql`lower(${user.email}) = ${email}`)
    .returning(USER_COLUMNS)
  return rows[0] ?? null
}
