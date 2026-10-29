/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/ably/token
 * Scope        : API — Customer Realtime
 *
 * Description  : Issues Ably token requests scoped to the caller's own
 *                customer channels.
 *
 * Responsibilities :
 * - Authenticate the user
 * - Generate an Ably token request for their own channels only
 * - Return 503 gracefully when realtime is not configured
 *
 * Features / Functionality :
 * - Per-customer channel capability (customer:{userId}:*)
 * - Graceful degradation when Ably key is absent
 * - Session-based authentication guard
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @/lib/realtime/ably, @rgss/errors
 *
 * Notes        :
 * - Staff feeds are branch-scoped and issued by the admin portal only
 *   (multi-branch R2.6); this route never grants them.
 * - Returns 503 if ABLY_API_KEY is not set so the client can fall back to polling.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { createAblyTokenRequest } from '@/lib/realtime/ably'

// POST /api/ably/token — issue an Ably token request scoped to the caller's own
// channels. If the realtime provider key is not configured, the helper returns
// null and we answer 503 so the client can degrade gracefully (polling).
export const POST = withErrorHandler(async () => {
  const session = await requireSession()

  const tokenRequest = await createAblyTokenRequest({ userId: session.user.id })

  if (tokenRequest === null) {
    throw new AppError({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'Realtime is not configured.',
      statusCode: 503,
    })
  }

  return apiSuccess(tokenRequest)
})
