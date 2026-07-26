/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/membership-tiers
 * Scope        : API — Admin Membership
 *
 * Description  : Returns all SPA membership tiers for admin dropdowns and
 *                membership creation forms.
 *
 * Responsibilities :
 * - Retrieve all available membership tiers
 * - Return tier data (name, hours, price, validity)
 * - Enforce RBAC (receptionist+)
 *
 * Features / Functionality :
 * - Full tier catalogue (Silver, Gold, Platinum)
 * - Used as data source for membership creation UI
 * - Active tiers only
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - Tiers are seed data managed by the developer role.
 ************************************************************/

import { getMembershipTiers } from '@rgss/db/queries'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'

export const GET = withErrorHandler(async () => {
  await requireRole('receptionist')

  const tiers = await getMembershipTiers()
  return apiSuccess(tiers)
})
