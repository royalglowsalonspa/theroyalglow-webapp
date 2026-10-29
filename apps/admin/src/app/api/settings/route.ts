/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 30-10-2026
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
 * - GET: read all known settings with defaults (Developer)
 * - PUT: validate a section payload, upsert it, return the saved value (Developer)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        : Developer-only, with the role read from the database now
 *                (multi-branch route inventory). The values apply to every
 *                branch until per-branch settings with revisions land (tasks
 *                §5). Managers see the business hours they schedule against in
 *                GET /api/schedule instead.
 ************************************************************/

import { getSettings, SETTING_KEYS, upsertSetting } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { settingsUpdateSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { requireCurrentRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// GET /api/settings — full settings object with defaults applied. Developer.
export const GET = withErrorHandler(async () => {
  await requireCurrentRole('developer')

  const settings = await getSettings()
  return apiSuccess({ settings })
})

// PUT /api/settings — update a single section. Developer. Returns the saved value.
export const PUT = withErrorHandler(async (req: Request) => {
  const { session } = await requireCurrentRole('developer')

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
