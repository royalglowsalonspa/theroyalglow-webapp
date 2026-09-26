/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : session
 * Scope        : API Infrastructure
 *
 * Description  : Session validation and RBAC helpers for API routes.
 *                Provides requireSession, getOptionalSession, and requireRole.
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
 * - requireOnboardedCustomer() — throws 403 ONBOARDING_REQUIRED without a profile
 *
 * Tech Stack   : TypeScript, Better Auth, Next.js
 * Layer        : API
 *
 * Dependencies : @/lib/auth-server, @rgss/db/queries, @rgss/errors, next/headers
 *
 * Notes        : None
 ************************************************************/

import { hasCustomerProfile } from '@rgss/db/queries'
import { AppError, ERROR_CODES } from '@rgss/errors'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth-server'

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

/**
 * Gate for any route that transacts on a customer's behalf — above all booking
 * creation. Requires a session AND a completed `customer_profile`.
 *
 * WHY THIS IS SERVER-SIDE AND NOT A UI CHECK: a booking's `customer_id` FKs
 * `user.id`, not `customer_profile.id` (packages/db/src/schema/booking.ts), so
 * the database happily accepts a booking for a user who never onboarded. The
 * salon then has an appointment with no phone number, no date of birth and no
 * gender — unreachable for reminders, and the invoice renders with a null phone
 * because getInvoiceForPdf LEFT JOINs the profile. Only this check prevents it.
 *
 * Throws 403 ONBOARDING_REQUIRED (not FORBIDDEN) so the client can tell a
 * recoverable "finish your profile" apart from a real permission failure and
 * route the customer to /onboarding.
 */
export async function requireOnboardedCustomer() {
  const session = await requireSession()

  const onboarded = await hasCustomerProfile(session.user.id)
  if (!onboarded) {
    throw new AppError({
      code: ERROR_CODES.ONBOARDING_REQUIRED,
      message: 'Please complete your profile before booking.',
      statusCode: 403,
    })
  }

  return session
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
