/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET /api/services/all
 * Scope        : API — Admin service management
 *
 * Description  : Returns the FULL service catalogue (active + inactive) joined
 *                to category name/type, plus all categories — the data behind
 *                the Services management screen. Manager+.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries
 *
 * Notes        : Distinct from GET /api/services (active-only, grouped) so other
 *                consumers keep their lean active catalogue.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getServiceCategoriesAll, getServicesForAdmin } from '@rgss/db/queries'

export const GET = withErrorHandler(async () => {
  await requireRole('manager')
  const [services, categories] = await Promise.all([
    getServicesForAdmin(),
    getServiceCategoriesAll(),
  ])
  return apiSuccess({ services, categories })
})
