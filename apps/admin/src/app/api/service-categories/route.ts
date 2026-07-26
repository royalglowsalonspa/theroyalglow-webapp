/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET|POST /api/service-categories
 * Scope        : API — Admin service category management
 *
 * Description  : Lists all service categories (active + inactive) and creates
 *                new ones. Manager+.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        : A category's serviceType (salon|spa) drives the slot-length
 *                rule for its services.
 ************************************************************/

import { createServiceCategory, getServiceCategoriesAll } from '@rgss/db/queries'
import { badRequest } from '@rgss/errors'
import { serviceCategoryCreateSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

export const GET = withErrorHandler(async () => {
  await requireRole('manager')
  const categories = await getServiceCategoriesAll()
  return apiSuccess({ categories })
})

export const POST = withErrorHandler(async (req: Request) => {
  const session = await requireRole('manager')

  const body = await req.json().catch(() => null)
  const parsed = serviceCategoryCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }

  const created = await createServiceCategory(parsed.data)
  if (!created) {
    throw new Error('Failed to create category.')
  }
  await audit(req, session, {
    action: 'create',
    entityType: 'service_category',
    entityId: created.id,
    newValues: parsed.data,
  })
  return apiSuccess({ category: created }, undefined, 201)
})
