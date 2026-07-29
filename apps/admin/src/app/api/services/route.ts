/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 22-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET /api/services (admin) — POST retired (410 Gone)
 * Scope        : API — Admin service catalogue (read-only)
 *
 * Description  : GET returns the active catalogue grouped by category (used by
 *                offers manager, manual-booking, membership recording). POST is
 *                permanently retired: service authoring moved to Payload CMS,
 *                which is now the single write path into public.service.
 *
 * Responsibilities :
 * - GET: active catalogue grouped by category (reachable by admin roles)
 * - POST: 410 Gone pointing the operator at Payload CMS
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/db/queries, @rgss/errors
 *
 * Notes        : GET stays unauthenticated at the handler (edge middleware gates
 *                the admin origin). The retired POST returns 410 before any auth
 *                or body parsing — no role check can make it succeed.
 ************************************************************/

import { getAllServicesGrouped } from '@rgss/db/queries'
import { gone } from '@rgss/errors'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

// Payload CMS is the authoring surface for the service catalogue.
const CMS_SERVICES_URL = 'https://cms.theroyalglow.in/admin/collections/service'

// GET /api/services — active catalogue grouped by category.
export const GET = withErrorHandler(async () => {
  const categories = await getAllServicesGrouped()
  return apiSuccess({ categories })
})

// POST /api/services — RETIRED. Services are created in Payload CMS, which syncs
// to public.service; the admin portal is no longer a write path.
export const POST = withErrorHandler(async () => {
  throw gone(
    `Service management moved to CMS. Create services in Payload CMS at ${CMS_SERVICES_URL}`,
  )
})
