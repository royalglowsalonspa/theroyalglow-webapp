/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/offers
 * Scope        : API — Public
 *
 * Description  : Returns the list of currently active offers for the customer-
 *                facing offers page. No authentication required.
 *
 * Responsibilities :
 * - Retrieve offers whose active flag is true within valid date range
 * - Include applicable service names per offer
 * - Return public offer data (no sensitive admin fields)
 *
 * Features / Functionality :
 * - Date-range-aware active offer filtering
 * - Service-to-offer mapping for display
 * - Public/unauthenticated access
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/db/queries
 *
 * Notes        :
 * - Salon offers only (SPA memberships are separate).
 * - Offers auto-expire via QStash offer-auto-expire job.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { getActiveOffers } from '@rgss/db/queries'

// GET /api/offers — public list of active offers for the customer offers page.
// No auth: returns only offers whose active flag is true and whose date range
// includes today, each with its applicable service names.
export const GET = withErrorHandler(async () => {
  const offers = await getActiveOffers()
  return apiSuccess({ offers })
})
