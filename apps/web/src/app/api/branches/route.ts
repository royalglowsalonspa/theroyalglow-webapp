/************************************************************
 * Module Name  : GET /api/branches
 * Scope        : API — Public
 *
 * Description  : Branches for the booking dialog's branch picker: every branch
 *                that is not shut down, whether each is taking bookings, and
 *                the branch to preselect.
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @rgss/business, @rgss/db/queries
 *
 * Notes        :
 * - Public endpoint (no auth), like GET /api/services. It returns only branch
 *   name, city and status; address, phone and geo are not exposed.
 * - `defaultBranchId` uses the same rule GET /api/availability applies when a
 *   request names no branch, so the two cannot disagree.
 ************************************************************/

import { buildPublicBranchList } from '@rgss/business'
import { getPublicBranches } from '@rgss/db/queries'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const GET = withErrorHandler(async () => {
  const branches = await getPublicBranches()
  return apiSuccess(buildPublicBranchList(branches))
})
