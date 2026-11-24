/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/ably/token (admin)
 * Scope        : API — Admin Realtime
 *
 * Description  : Issues subscribe-only Ably token requests for the admin portal.
 *                The capability lists the channels of every branch where the
 *                person is a Receptionist or above, read from the database now
 *                (multi-branch R2.2, R2.6). Returns 503 when realtime is not
 *                configured.
 *
 * Responsibilities :
 * - Require Receptionist or above at the active branch (403 below)
 * - Issue a branch-scoped, subscribe-only Ably token request
 * - Return 503 gracefully when the Ably key is absent
 *
 * Features / Functionality :
 * - No cross-branch wildcards: `booking:*` and `admin:bookings:*` are gone
 * - Graceful degradation when Ably key is absent (client falls back to polling)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @/lib/realtime/ably, @rgss/business, @rgss/errors
 *
 * Notes        : A shared Manager's token covers each branch they manage; the
 *                UI subscribes only to the active branch's channels.
 ************************************************************/

import { hasBranchRole } from '@rgss/business'
import { AppError, ERROR_CODES } from '@rgss/errors'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { createAblyTokenRequest } from '@/lib/realtime/ably'

// POST /api/ably/token — issue a branch-scoped Ably token request. If the
// realtime provider key is not configured, the helper returns null and we
// answer 503 so the client can degrade gracefully (polling).
export const POST = withErrorHandler(async () => {
  const ctx = await requireBranchRole('receptionist')

  const branchIds = ctx.access.branches
    .filter((branch) => hasBranchRole(branch, 'receptionist'))
    .map((branch) => branch.id)

  const tokenRequest = await createAblyTokenRequest({
    userId: ctx.session.user.id,
    branchIds,
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
