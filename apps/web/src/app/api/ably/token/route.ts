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
