/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : PATCH /api/services/[id]
 * Scope        : API — Admin service management
 *
 * Description  : Updates a service (edit fields or activate/deactivate). Manager+.
 *                Re-validates the slot-length rule against the (possibly new)
 *                category type.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : Services are never hard-deleted — deactivate via isActive=false
 *                so historical invoice/booking snapshots stay intact.
 ************************************************************/

import { getServiceById, getServiceCategoryById, updateService } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { isValidDurationForType, serviceUpdateSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole('manager')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = serviceUpdateSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const existing = await getServiceById(id)
    if (!existing) {
      throw notFound('Service not found.')
    }

    // Resolve the effective category (new one if changing, else current) to
    // validate the duration against its salon/spa type.
    const effectiveCategoryId = parsed.data.categoryId ?? existing.categoryId
    const effectiveDuration = parsed.data.durationMinutes ?? existing.durationMinutes
    const category = await getServiceCategoryById(effectiveCategoryId)
    if (!category) {
      throw badRequest('Selected category does not exist.')
    }
    if (!isValidDurationForType(category.serviceType, effectiveDuration)) {
      throw badRequest(
        category.serviceType === 'spa'
          ? 'SPA services must be 30 or 60 minutes.'
          : 'Salon duration must be a positive multiple of 5 minutes.',
      )
    }

    const updated = await updateService(id, parsed.data)
    await audit(req, session, {
      action: 'update',
      entityType: 'service',
      entityId: id,
      oldValues: existing,
      newValues: parsed.data,
    })
    return apiSuccess({ service: updated })
  },
)
