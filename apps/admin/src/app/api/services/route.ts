/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET|POST /api/services (admin)
 * Scope        : API — Admin service catalogue
 *
 * Description  : GET returns the active catalogue grouped by category (used by
 *                offers manager, manual-booking, membership recording). POST
 *                creates a new service in the operational catalogue (the single
 *                source of truth that also drives the customer /services page).
 *
 * Responsibilities :
 * - GET: active catalogue grouped by category (reachable by admin roles)
 * - POST: create a service (Manager+), Zod-validated
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : GET stays unauthenticated at the handler (edge middleware gates
 *                the admin origin). POST requires Manager+.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { createService, getAllServicesGrouped, getServiceCategoryById } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { isValidDurationForType, serviceCreateSchema } from '@rgss/types'

// GET /api/services — active catalogue grouped by category.
export const GET = withErrorHandler(async () => {
  const categories = await getAllServicesGrouped()
  return apiSuccess({ categories })
})

// POST /api/services — create a service. Manager+.
export const POST = withErrorHandler(async (req: Request) => {
  await requireRole('manager')

  const body = await req.json().catch(() => null)
  const parsed = serviceCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  // The target category must exist (FK is RESTRICT; fail with a clear 400).
  const category = await getServiceCategoryById(parsed.data.categoryId)
  if (!category) {
    throw badRequest('Selected category does not exist.')
  }

  // Slot-length rule: SPA → 30/60 only; Salon → 5-minute steps.
  if (!isValidDurationForType(category.serviceType, parsed.data.durationMinutes)) {
    throw badRequest(
      category.serviceType === 'spa'
        ? 'SPA services must be 30 or 60 minutes.'
        : 'Salon duration must be a positive multiple of 5 minutes.',
    )
  }

  const created = await createService(parsed.data)
  return apiSuccess({ service: created }, undefined, 201)
})
