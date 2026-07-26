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
 * - Serve as data source for Cloudflare KV cache layer
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
 * - Designed for Cloudflare KV edge caching (5-min TTL).
 * - No authentication required.
 ************************************************************/

import { getActiveCatalogue } from '@rgss/db/queries'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(async () => {
  const categories = await getActiveCatalogue()
  return apiSuccess({ categories })
})
