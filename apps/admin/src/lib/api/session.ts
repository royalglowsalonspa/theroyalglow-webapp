/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : session (admin)
 * Scope        : API Infrastructure
 *
 * Description  : Session validation and RBAC helpers for admin API routes.
 *                Provides requireSession, getOptionalSession, and requireRole.
 *                Ported verbatim from apps/web; resolves against the admin app's
 *                own Better Auth config (same Neon DB + BETTER_AUTH_SECRET).
 *
 * Responsibilities :
 * - Validate authenticated sessions via Better Auth
 * - Enforce role-based access control with hierarchical levels
 * - Throw typed AppError for unauthenticated/forbidden access
 *
 * Features / Functionality :
 * - requireSession() — throws 401 if no session
 * - getOptionalSession() — returns session or null
 * - requireRole() — throws 403 if role level insufficient
 *
 * Tech Stack   : TypeScript, Better Auth, Next.js
 * Layer        : API
 *
 * Dependencies : @/lib/auth-server, @/lib/api/rate-limit, @rgss/errors, next/headers
 *
 * Notes        : None
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth-server'
import { getDevImpersonatedSession } from '@/lib/dev-auth'
import { enforceRateLimit } from './rate-limit'

export async function requireSession() {
  // LOCAL DEV ONLY — operate as a real user by email without OAuth. Hard
  // production guard lives in getDevImpersonatedSession (returns null in prod).
  const dev = await getDevImpersonatedSession()
  if (dev) {
    return dev as unknown as NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    throw new AppError({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: 'You must be signed in.',
      statusCode: 401,
    })
  }
  // Per-user sliding-window rate limit (20 req / 10s) applied at the single
  // authenticated entry point so every admin API route — read and mutating —
  // is covered. requireRole() calls through here, so it inherits enforcement.
  // No-ops when Upstash is unconfigured (local dev). Throws 429 on exceed.
  await enforceRateLimit(session.user.id)
  return session
}

export async function getOptionalSession() {
  const dev = await getDevImpersonatedSession()
  if (dev) {
    return dev as unknown as Awaited<ReturnType<typeof auth.api.getSession>>
  }
  return auth.api.getSession({ headers: await headers() })
}

const ROLE_LEVELS: Record<string, number> = {
  customer: 0,
  staff: 1,
  receptionist: 2,
  manager: 3,
  owner: 4,
  developer: 5,
}

export async function requireRole(minRole: keyof typeof ROLE_LEVELS) {
  const session = await requireSession()
  const role = (session.user as { role?: string }).role ?? 'customer'
  if ((ROLE_LEVELS[role] ?? 0) < (ROLE_LEVELS[minRole] ?? 0)) {
    throw new AppError({
      code: ERROR_CODES.FORBIDDEN,
      message: 'You do not have permission to perform this action.',
      statusCode: 403,
    })
  }
  return session
}
