/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : GET /api/memberships/[id]
 * Scope        : API — Admin Membership
 *
 * Description  : Returns a single membership detail with its session history
 *                for the admin membership detail page.
 *
 * Responsibilities :
 * - Retrieve membership by ID with full details
 * - Fetch associated session history
 * - Return 404 for non-existent memberships
 *
 * Features / Functionality :
 * - Full membership detail (tier, hours, expiry, status)
 * - Session history (dates, services, durations)
 * - Hours used vs remaining calculation
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries, @rgss/errors
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - Sessions are included inline with the membership response.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getMembershipById, getMembershipSessions } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'

export const GET = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('receptionist')
    const { id } = await ctx.params

    const membership = await getMembershipById(id)
    if (!membership) {
      throw notFound('Membership not found.')
    }

    const sessions = await getMembershipSessions(id)
    return apiSuccess({ ...membership, sessions })
  },
)
