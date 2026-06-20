/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/memberships/[id]/cancel
 * Scope        : API — Admin Membership
 *
 * Description  : Cancels an active SPA membership with a required reason.
 *                Manager+ access only.
 *
 * Responsibilities :
 * - Validate cancellation reason
 * - Verify membership exists
 * - Transition membership to cancelled status
 *
 * Features / Functionality :
 * - Membership cancellation with reason capture
 * - Manager+ role guard (higher privilege than receptionist)
 * - Status transition from active → cancelled
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: manager.
 * - Cancellation is irreversible; a new membership must be created.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { cancelMembership, getMembershipById } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { cancelMembershipSchema } from '@rgss/types'

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    await requireRole('manager')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = cancelMembershipSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const existing = await getMembershipById(id)
    if (!existing) {
      throw notFound('Membership not found.')
    }

    const updated = await cancelMembership(id, parsed.data.reason)
    return apiSuccess(updated)
  },
)
