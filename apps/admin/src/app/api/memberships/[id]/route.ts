/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/memberships/[id]
 * Scope        : API — Admin Membership
 *
 * Description  : Returns a single membership detail with its session history
 *                for the admin membership detail page, as the active branch
 *                sees a membership every branch shares.
 *
 * Responsibilities :
 * - Retrieve membership by ID with full details
 * - Show what it was sold for only to people who can access the selling
 *   branch (route inventory gap 5)
 * - Fetch session history from every branch; other branches' sessions show
 *   date, branch, services and duration only
 * - Say whether the person may cancel it from here
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @/lib/memberships/membership-view, @rgss/business,
 *                @rgss/db/queries, @rgss/errors
 *
 * Notes        :
 * - Requires receptionist or above at the active branch.
 * - `branchId` is the branch the page renders for; writes send it back.
 ************************************************************/

import { membershipCancelRefusal } from '@rgss/business'
import { getMembershipById, getMembershipSessions } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'
import { requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { membershipForViewer, sessionForBranch } from '@/lib/memberships/membership-view'

export const GET = withErrorHandler(
  async (_req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const membership = await getMembershipById(id)
    if (!membership) {
      throw notFound('Membership not found.')
    }

    const sessions = await getMembershipSessions(id)
    const cancelRefusal = membershipCancelRefusal(ctx.access, ctx.branch, membership.sellingBranch)

    return apiSuccess({
      branchId: ctx.branch.id,
      ...membershipForViewer(membership, ctx.access),
      canCancel: cancelRefusal === null,
      cancelRefusal: cancelRefusal?.reason ?? null,
      sessions: sessions.map((s) => sessionForBranch(s, ctx.branch.id)),
    })
  },
)
