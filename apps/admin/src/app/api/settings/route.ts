/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET|PUT /api/settings (admin)
 * Scope        : API — Admin system settings
 *
 * Description  : GET returns the full settings object (business hours, GST,
 *                booking rules) with defaults applied for any unset key. PUT
 *                updates one section at a time ({ section, value }) validated by
 *                the section's matching schema, upserts the JSON value, and
 *                returns the saved value.
 *
 * Responsibilities :
 * - GET: read all known settings with defaults (Manager+)
 * - PUT: validate a section payload, upsert it, return the saved value (Manager+)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Requires min role: manager. Settings is a single-tenant
 *                key/value store, so writes are one-section-at-a-time upserts.
 ************************************************************/

import { audit } from '@/lib/api/audit'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { SETTING_KEYS, getSettings, upsertSetting } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { settingsUpdateSchema } from '@rgss/types'

// GET /api/settings — full settings object with defaults applied. Manager+.
export const GET = withErrorHandler(async () => {
  await requireRole('manager')

  const settings = await getSettings()
  return apiSuccess({ settings })
})

// PUT /api/settings — update a single section. Manager+. Returns the saved value.
export const PUT = withErrorHandler(async (req: Request) => {
  const session = await requireRole('manager')

  const body = await req.json().catch(() => null)
  const parsed = settingsUpdateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const { section, value } = parsed.data
  const saved = await upsertSetting(SETTING_KEYS[section], value, session.user.id)

  await audit(req, session, {
    action: 'update',
    entityType: 'system_setting',
    entityId: section,
    newValues: value,
  })

  return apiSuccess({ section, value: saved.value })
})
