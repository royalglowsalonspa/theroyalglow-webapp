import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { getStaffProfileByUserId, withdrawLeave } from '@rgss/db/queries'
import { notFound } from '@rgss/errors'

// DELETE /api/staff/leave/[id] — withdraw the caller's own pending leave request.
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
