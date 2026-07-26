/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/gems
 * Scope        : API — Customer Loyalty
 *
 * Description  : Returns the authenticated customer's loyalty (gems) balance,
 *                lifetime totals, and the redeemable-services catalogue with a
 *                per-service affordability flag.
 *
 * Responsibilities :
 * - Retrieve or create the customer's loyalty account
 * - Return balance summary (current balance, lifetime earned/redeemed)
 * - Return the redeemable catalogue with affordability flags
 *
 * Features / Functionality :
 * - Auto-create loyalty account for new customers (balance 0)
 * - Catalogue filtered to non-null gemsRequired rows (Req 1.3)
 * - Per-service all-or-nothing affordability flag (Req 2)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/business,
 *                @rgss/db/queries
 *
 * Notes        :
 * - Thin orchestrator: no inline Drizzle — only query-layer calls.
 * - Strictly scoped to the authenticated customer (session.user.id).
 ************************************************************/

import { computeAffordability } from '@rgss/business'
import {
  getLoyaltySummary,
  getOrCreateLoyaltyAccount,
  getRedeemableServices,
} from '@rgss/db/queries'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireSession } from '@/lib/api/session'

// GET /api/gems — the caller's own gems balance, lifetime totals, and the
// redeemable-services catalogue annotated with affordability. Strictly scoped to
// the authenticated customer; never exposes another user's data.
export const GET = withErrorHandler(async () => {
  const session = await requireSession()
  const customerId = session.user.id

  // Ensure an account exists so a brand-new customer sees zeros, not an error.
  await getOrCreateLoyaltyAccount(customerId)

  const [summary, redeemable] = await Promise.all([
    getLoyaltySummary(customerId),
    getRedeemableServices(),
  ])

  // Treat a missing summary as a zeroed balance (Req 11.3).
  const { balance, totalEarned, totalRedeemed } = summary ?? {
    balance: 0,
    totalEarned: 0,
    totalRedeemed: 0,
  }

  // Drop rows with a null gem cost (Req 1.3), then flag affordability (Req 2).
  const services = redeemable.filter((s) => s.gemsRequired != null)
  const catalogue = computeAffordability(balance, services)

  return apiSuccess({ balance, totalEarned, totalRedeemed, catalogue })
})
