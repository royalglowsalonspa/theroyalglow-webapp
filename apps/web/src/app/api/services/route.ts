/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/services
 * Scope        : API — Public
 *
 * Description  : Returns the full service catalogue grouped by category for
 *                the booking dialog and public services page.
 *
 * Responsibilities :
 * - Retrieve all active services grouped by category
 * - Return structured data for Salon/SPA toggle UI
 * - Serve as the direct Neon-backed catalogue source; a future Redis wrapper may cache this response
 *
 * Features / Functionality :
 * - Category-grouped service listing
 * - Includes pricing, duration, and service type metadata
 * - Public/unauthenticated access
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/db/queries
 *
 * Notes        :
 * - The route currently reads the active catalogue directly from Neon.
 * - A future Upstash read-through cache may add a 5-minute TTL.
 * - No authentication required.
 ************************************************************/

import { getActiveCatalogue } from '@rgss/db/queries'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(async () => {
  const categories = await getActiveCatalogue()
  return apiSuccess({ categories })
})
