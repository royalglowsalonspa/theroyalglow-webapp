/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 22-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET /api/service-categories — POST retired (410 Gone)
 * Scope        : API — Admin service category catalogue (read-only)
 *
 * Description  : GET lists all service categories (active + inactive) for
 *                read-only admin views. POST is permanently retired: category
 *                authoring moved to Payload CMS, which is now the single write
 *                path into public.service_category.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors
 *
 * Notes        : GET keeps its Manager+ gate. The retired POST returns 410 before
 *                any auth or body parsing — no role check can make it succeed.
 ************************************************************/

import { getServiceCategoriesAll } from '@rgss/db/queries'
import { gone } from '@rgss/errors'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

// Payload CMS is the authoring surface for the service catalogue.
const CMS_CATEGORIES_URL = 'https://cms.theroyalglow.in/admin/collections/service_category'

export const GET = withErrorHandler(async () => {
  await requireRole('manager')
  const categories = await getServiceCategoriesAll()
  return apiSuccess({ categories })
})

// POST /api/service-categories — RETIRED. Categories are created in Payload CMS,
// which syncs to public.service_category.
export const POST = withErrorHandler(async () => {
  throw gone(
    `Service management moved to CMS. Create service categories in Payload CMS at ${CMS_CATEGORIES_URL}`,
  )
})
