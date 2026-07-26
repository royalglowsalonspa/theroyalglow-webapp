/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : PATCH /api/profile/preferences
 * Scope        : API — Customer Profile
 *
 * Description  : Updates the authenticated customer's notification preference
 *                toggles (appointment reminders, membership alerts, marketing
 *                consent) on their customer_profile.
 *
 * Responsibilities :
 * - Require an authenticated session
 * - Validate a partial preferences payload with Zod
 * - Persist only the supplied flags, scoped to session.user.id
 *
 * Features / Functionality :
 * - Partial update: any subset of the three boolean flags may be sent
 * - Marketing consent toggling also stamps marketing_consent_at (query layer)
 * - User-scoped: a caller can only update their own profile
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Returns 404 when the caller has no customer_profile (onboarding incomplete).
 ************************************************************/

import { updateNotificationPreferences } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { updateNotificationPreferencesSchema } from '@rgss/types'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'

// PATCH /api/profile/preferences — update the caller's notification preference
// flags. Scoped to the authenticated user (session.user.id); a caller can never
// modify another user's preferences.
export const PATCH = withErrorHandler(async (req: Request) => {
  const session = await requireSession()

  const body = await req.json().catch(() => null)
  const parsed = updateNotificationPreferencesSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const updated = await updateNotificationPreferences(session.user.id, parsed.data)
  if (!updated) {
    throw notFound('Profile not found.')
  }

  return apiSuccess({
    appointmentRemindersEnabled: updated.appointmentRemindersEnabled,
    membershipAlertsEnabled: updated.membershipAlertsEnabled,
    marketingConsent: updated.marketingConsent,
  })
})
