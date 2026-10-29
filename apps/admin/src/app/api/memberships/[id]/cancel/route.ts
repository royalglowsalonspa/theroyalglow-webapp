/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/memberships/[id]/cancel
 * Scope        : API — Admin Membership
 *
 * Description  : Cancels an active SPA membership with a required reason.
 *                Cancelling stays with the selling branch's Manager or Owner,
 *                or the Developer (route inventory gap 5).
 *
 * Responsibilities :
 * - Validate cancellation reason and the rendered branch
 * - Verify membership exists and was sold at the active branch
 * - Transition membership to cancelled status, once
 *
 * Features / Functionality :
 * - Membership cancellation with reason capture
 * - Manager+ at the selling branch
 * - Guarded active → cancelled transition (concurrent cancels apply once)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/audit, @/lib/api/branch-context,
 *                @/lib/api/error-handler, @rgss/business, @rgss/db/queries,
 *                @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Cancellation is irreversible; a new membership must be created.
 ************************************************************/

import { membershipCancelRefusal } from '@rgss/business'
import { cancelMembership, getMembershipById } from '@rgss/db/queries'
import { badRequest, conflict, ERROR_CODES, forbidden, notFound } from '@rgss/errors'
import { cancelMembershipSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

export const POST = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    // The selling branch's Manager or Owner, or the Developer: the role at the
    // active branch is checked against the selling branch below.
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = cancelMembershipSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)

    const existing = await getMembershipById(id)
    if (!existing) {
      throw notFound('Membership not found.')
    }
    const refusal = membershipCancelRefusal(ctx.access, ctx.branch, existing.sellingBranch)
    if (refusal) {
      throw forbidden(refusal.reason)
    }

    const updated = await cancelMembership(id, ctx.branch.id, parsed.data.reason)
    if (!updated) {
      throw conflict(
        ERROR_CODES.CONFLICT,
        'This membership is no longer active. Refresh to see its current state.',
      )
    }

    await audit(req, ctx.session, {
      action: 'status_change',
      entityType: 'spa_membership',
      entityId: id,
      branchId: ctx.branch.id,
      oldValues: { status: existing.status },
      newValues: { status: 'cancelled', reason: parsed.data.reason },
    })

    return apiSuccess(updated)
  },
)
