/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/membership
 * Scope        : API — Customer Membership
 *
 * Description  : Returns the authenticated customer's SPA membership details
 *                including active membership, session history, and past memberships.
 *
 * Responsibilities :
 * - Retrieve the customer's active SPA membership (if any)
 * - Fetch session history for the active membership
 * - Return past (expired/cancelled) memberships
 *
 * Features / Functionality :
 * - Active membership with tier details and hours remaining
 * - Session history for active membership
 * - Historical membership records (expired/cancelled)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries
 *
 * Notes        :
 * - One active membership per customer (DB constraint).
 * - Sessions are only fetched for the active membership, not past ones.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'
import { getCustomerMembership, getMembershipSessions } from '@rgss/db/queries'

// GET /api/membership — the caller's own SPA membership(s): the single active
// membership (if any) with its session history, plus past (expired/cancelled)
// memberships. Strictly scoped to the authenticated customer (session.user.id);
// never exposes another customer's membership data.
export const GET = withErrorHandler(async () => {
  const session = await requireSession()
  const customerId = session.user.id

  const { active, past } = await getCustomerMembership(customerId)

  // Session history only applies to the active membership; an absent active
  // membership yields an empty list rather than an error.
  const sessions = active ? await getMembershipSessions(active.id) : []

  return apiSuccess({ active, past, sessions })
})
