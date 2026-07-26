/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/ably/token (admin)
 * Scope        : API — Admin Realtime
 *
 * Description  : Issues subscribe-only Ably token requests for the admin portal.
 *                Requires Receptionist or higher; capability is scoped to the
 *                admin channel set. Returns 503 when realtime is not configured.
 *
 * Responsibilities :
 * - Enforce Receptionist+ access (403 below)
 * - Issue an admin-scoped, subscribe-only Ably token request
 * - Return 503 gracefully when the Ably key is absent
 *
 * Features / Functionality :
 * - Role-gated token issue (Receptionist minimum)
 * - Graceful degradation when Ably key is absent (client falls back to polling)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session,
 *                @/lib/realtime/ably, @rgss/errors
 *
 * Notes        : Admin tokens are subscribe-only and admin-scoped
 *                (admin:bookings:*, admin:schedule:*, admin:leave, booking:*).
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { createAblyTokenRequest } from '@/lib/realtime/ably'

// POST /api/ably/token — issue an admin-scoped Ably token request. Requires
// Receptionist or higher (requireRole throws 403 below). If the realtime
// provider key is not configured, the helper returns null and we answer 503 so
// the client can degrade gracefully (polling).
export const POST = withErrorHandler(async () => {
  const session = await requireRole('receptionist')

  const tokenRequest = await createAblyTokenRequest({
    userId: session.user.id,
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
