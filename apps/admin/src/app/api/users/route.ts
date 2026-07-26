/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET|POST /api/users
 * Scope        : API — Admin User / RBAC administration
 *
 * Description  : Owner-facing user directory + role assignment. GET returns a
 *                searchable list of all accounts; POST assigns an RBAC role to
 *                a user by the email they signed in with.
 *
 * Responsibilities :
 * - List/search user accounts for the role-administration screen (owner+)
 * - Assign a role to an existing user by email (owner+)
 * - Enforce privilege guards: no self-edit, no granting a role above your own,
 *   no editing an account already above your own level
 *
 * Features / Functionality :
 * - GET  /api/users?search= → { users: AdminUserRow[] }
 * - POST /api/users { email, role } → { user: AdminUserRow }
 * - Zod-validated input; case-insensitive email match
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @/lib/rbac,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: owner (matches ROUTE_MIN_LEVEL '/users' = 4).
 * - A user must sign in once on theroyalglow.in before a role can be assigned
 *   (the sign-in creates their `user` row). A 404 is returned otherwise.
 ************************************************************/

import { getUserByEmail, listUsers, updateUserRoleByEmail } from '@rgss/db/queries'
import { badRequest, forbidden, notFound } from '@rgss/errors'
import { assignRoleSchema, userListQuerySchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { ROLE_LEVELS, resolveRoleLevel } from '@/lib/rbac'

// GET /api/users?search= — searchable account directory. Owner+ only.
export const GET = withErrorHandler(async (req: Request) => {
  await requireRole('owner')

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = userListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw badRequest('Invalid query parameters', parsed.error.flatten().fieldErrors)
  }

  const users = await listUsers(parsed.data.search ? { search: parsed.data.search } : {})
  return apiSuccess({ users })
})

// POST /api/users { email, role } — assign an RBAC role to a user by email.
// Owner+ only, with privilege guards (see below).
export const POST = withErrorHandler(async (req: Request) => {
  const session = await requireRole('owner')
  const actor = session.user as { id: string; email?: string | null; role?: string | null }

  const body = await req.json().catch(() => null)
  const parsed = assignRoleSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  const { email, role } = parsed.data

  const actorLevel = resolveRoleLevel(actor.role)
  const targetRoleLevel = ROLE_LEVELS[role]

  // Guard 1: cannot grant a role higher than your own (no privilege escalation).
  if (targetRoleLevel > actorLevel) {
    throw forbidden('You cannot assign a role higher than your own.')
  }

  // Guard 2: cannot change your own role (prevents self-lockout / self-promote).
  if (actor.email && actor.email.toLowerCase() === email) {
    throw badRequest('You cannot change your own role.')
  }

  // The user must already exist (they sign in on the website first).
  const existing = await getUserByEmail(email)
  if (!existing) {
    throw notFound(
      'No account found with that email. Ask them to sign in on theroyalglow.in once, then try again.',
    )
  }

  // Guard 3: cannot edit an account already at a higher level than yours.
  if (resolveRoleLevel(existing.role) > actorLevel) {
    throw forbidden('You cannot change the role of an account above your own level.')
  }

  const updated = await updateUserRoleByEmail(email, role)
  if (!updated) {
    // Race: row vanished between lookup and update. Treat as not found.
    throw notFound('No account found with that email.')
  }

  await audit(req, session, {
    action: 'status_change',
    entityType: 'user',
    entityId: updated.id,
    oldValues: { role: existing.role },
    newValues: { role },
  })

  return apiSuccess({ user: updated })
})
