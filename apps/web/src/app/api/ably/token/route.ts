/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/ably/token
 * Scope        : API — Customer Realtime
 *
 * Description  : Issues Ably token requests scoped to the caller's role.
 *                Admin roles get additional admin channel capabilities.
 *
 * Responsibilities :
 * - Authenticate the user and determine their RBAC role
 * - Generate role-scoped Ably token requests
 * - Return 503 gracefully when realtime is not configured
 *
 * Features / Functionality :
 * - Role-scoped channel capabilities (customer vs admin)
 * - Graceful degradation when Ably key is absent
 * - Session-based authentication guard
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @/lib/realtime/ably, @rgss/errors
 *
 * Notes        :
 * - Admin roles (receptionist+) receive `admin:*` channel capability.
 * - Returns 503 if ABLY_API_KEY is not set so the client can fall back to polling.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { createAblyTokenRequest } from '@/lib/realtime/ably'
import { AppError, ERROR_CODES } from '@rgss/errors'

// Roles that may subscribe to admin realtime channels (receptionist and above
// in the RBAC hierarchy: customer < staff < receptionist < manager < owner <
// developer).
const ADMIN_ROLES = new Set(['receptionist', 'manager', 'owner', 'developer'])

// POST /api/ably/token — issue an Ably token request scoped to the caller's own
// channels. Admin roles additionally receive the `admin:*` capability. If the
// realtime provider key is not configured, the helper returns null and we
// answer 503 so the client can degrade gracefully (polling).
export const POST = withErrorHandler(async () => {
  const session = await requireSession()

  const role = (session.user as { role?: string }).role ?? 'customer'
  const isAdmin = ADMIN_ROLES.has(role)

  const tokenRequest = await createAblyTokenRequest({
    userId: session.user.id,
    isAdmin,
  })

  if (tokenRequest === null) {
    throw new AppError({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'Realtime is not configured.',
      statusCode: 503,
    })
  }

  return apiSuccess(tokenRequest)
})
