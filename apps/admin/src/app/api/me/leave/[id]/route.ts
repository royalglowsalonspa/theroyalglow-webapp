/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : DELETE /api/me/leave/[id]
 * Scope        : API — Staff Self-Service Leave
 *
 * Description  : Allows staff to withdraw their own pending leave requests.
 *                Only pending requests owned by the caller can be withdrawn.
 *                Relocated from apps/web/api/staff/leave/[id] during the
 *                admin-web-separation feature.
 *
 * Responsibilities :
 * - Verify staff ownership of the leave request
 * - Ensure only pending requests can be withdrawn
 * - Delete the leave request record
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @rgss/db/queries, @rgss/errors
 *
 * Notes        :
 * - Requires min role: staff (RBAC `/me` namespace, level 1).
 * - Returns 404 uniformly to avoid leaking existence of other staff's requests.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getStaffProfileByUserId, withdrawLeave } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'

// DELETE /api/me/leave/[id] — withdraw the caller's own pending leave request.
// Scoped to the authenticated staff member's staff_profile; withdrawLeave only
// matches an id that is theirs AND still pending, returning null otherwise (not
// theirs, already decided, or non-existent) → a uniform 404 that never leaks
// another staff member's data.
export const DELETE = withErrorHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole('staff')

    const staff = await getStaffProfileByUserId(session.user.id)
    if (!staff) {
      throw notFound('No staff profile for this account.')
    }

    const { id } = await ctx.params

    const withdrawn = await withdrawLeave(id, staff.id)
    if (!withdrawn) {
      throw notFound('Leave request not found, not yours, or already decided.')
    }

    return apiSuccess({ ok: true })
  },
)
