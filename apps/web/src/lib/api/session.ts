import { headers } from 'next/headers'
import { auth } from '@/lib/auth-server'
import { AppError, ERROR_CODES } from '@rgss/errors'

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    throw new AppError({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: 'You must be signed in.',
      statusCode: 401,
    })
  }
  return session
}

export async function getOptionalSession() {
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
