/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 31-10-2026
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
 * - Say where a restricted service is offered (multi-branch R4.2, R7.2)
 * - Serve as the direct Neon-backed catalogue source; a future Redis wrapper may cache this response
 *
 * Features / Functionality :
 * - Category-grouped service listing
 * - Includes pricing, duration, and service type metadata
 * - Each service's `availableBranchIds` (null = every branch) and
 *   `availabilityNote` ("Only at Rayasandra", null for every branch)
 * - Public/unauthenticated access
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/business, @rgss/db/queries
 *
 * Notes        :
 * - The route currently reads the active catalogue directly from Neon.
 * - A future Upstash read-through cache may add a 5-minute TTL.
 * - No authentication required. The note names public branches only.
 ************************************************************/

import { availabilityLabel } from '@rgss/business'
import { getActiveCatalogue, getPublicBranches } from '@rgss/db/queries'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(async () => {
  const [categories, branches] = await Promise.all([getActiveCatalogue(), getPublicBranches()])
  const branchNames = new Map(branches.map((b) => [b.id, b.name]))
  return apiSuccess({
    categories: categories.map((category) => ({
      ...category,
      services: category.services.map((service) => ({
        ...service,
        availabilityNote: availabilityLabel(service.availableBranchIds, branchNames),
      })),
    })),
  })
})
