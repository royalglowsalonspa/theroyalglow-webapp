/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : GET /api/services (admin)
 * Scope        : API — Admin (same-origin service catalogue)
 *
 * Description  : Returns the full service catalogue grouped by category. Hosted
 *                locally in the admin app so admin pages (offers manager, lead
 *                manual-booking dialog, membership session recording) can fetch
 *                the catalogue same-origin without a cross-subdomain call. Reads
 *                the same Neon catalogue via @rgss/db as the customer site.
 *
 * Responsibilities :
 * - Retrieve all active services grouped by category
 * - Return the structured catalogue for admin Salon/SPA selection UIs
 *
 * Features / Functionality :
 * - Category-grouped service listing (pricing, duration, service type)
 * - Same-origin for the admin subdomain (no browser cross-origin)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/db/queries
 *
 * Notes        :
 * - Mirrors apps/web GET /api/services. The admin shell is RBAC-gated by the
 *   edge middleware, so this catalogue read is only reachable by admin roles.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { getAllServicesGrouped } from '@rgss/db/queries'

export const GET = withErrorHandler(async () => {
  const categories = await getAllServicesGrouped()
  return apiSuccess({ categories })
})
