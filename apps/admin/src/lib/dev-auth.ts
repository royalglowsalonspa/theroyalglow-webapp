/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : dev-auth
 * Scope        : LOCAL DEV ONLY — role impersonation
 *
 * Description  : Lets a developer operate the admin portal locally AS a real
 *                user (by email) WITHOUT completing the Google OAuth +
 *                cross-subdomain session flow. When ADMIN_DEV_IMPERSONATE_EMAIL
 *                is set (and NODE_ENV !== production), the session helpers and
 *                layout build a synthetic Better Auth session from that user's
 *                REAL Neon row — so their real id, name, and RBAC role drive the
 *                whole portal (nav visibility, requireRole, and DB writes that
 *                reference the acting user all work).
 *
 * Responsibilities :
 * - Decide whether dev impersonation is active (env + non-production guard)
 * - Resolve the impersonated user's real row and shape it like a Better Auth
 *   session object the rest of the app already consumes
 *
 * Features / Functionality :
 * - One env var (ADMIN_DEV_IMPERSONATE_EMAIL) switches the acting account
 * - Uses the real user row from Neon (real id + role), so RBAC is accurate
 *
 * Tech Stack   : TypeScript, Drizzle (via @rgss/db queries)
 * Layer        : API Infrastructure (dev only)
 *
 * Dependencies : @rgss/db/queries (getUserByEmail)
 *
 * Notes        :
 * - HARD production guard: returns null whenever NODE_ENV === 'production', so
 *   this can NEVER grant access in a production build.
 * - If the email is not found in Neon, returns null and logs a hint — callers
 *   then fall back to the real Better Auth session (i.e. unauthenticated).
 ************************************************************/

import { getUserByEmail } from '@rgss/db/queries'

/** Shape compatible with the bits of a Better Auth session the app reads. */
export interface DevSession {
  session: {
    id: string
    userId: string
    expiresAt: Date
    token: string
    createdAt: Date
    updatedAt: Date
  }
  user: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    image: string | null
    role: string | null
    createdAt: Date
    updatedAt: Date
  }
}

/**
 * The impersonation email when dev impersonation is active, else null.
 * Active iff NOT production AND ADMIN_DEV_IMPERSONATE_EMAIL is a non-empty value.
 */
export function devImpersonationEmail(): string | null {
  if (process.env.NODE_ENV === 'production') {
    return null
  }
  const email = process.env.ADMIN_DEV_IMPERSONATE_EMAIL?.trim()
  return email ? email.toLowerCase() : null
}

/**
 * Build a synthetic session for the impersonated user, or null when
 * impersonation is off or the email has no matching Neon row.
 */
export async function getDevImpersonatedSession(): Promise<DevSession | null> {
  const email = devImpersonationEmail()
  if (!email) {
    return null
  }

  const user = await getUserByEmail(email)
  if (!user) {
    console.warn(
      `[dev-auth] ADMIN_DEV_IMPERSONATE_EMAIL="${email}" has no user in Neon. Have that account sign in on the web app once, or pick another email.`,
    )
    return null
  }

  const now = new Date()
  return {
    session: {
      id: 'dev-impersonation',
      userId: user.id,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      token: 'dev-impersonation',
      createdAt: now,
      updatedAt: now,
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: true,
      image: user.image,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: now,
    },
  }
}
