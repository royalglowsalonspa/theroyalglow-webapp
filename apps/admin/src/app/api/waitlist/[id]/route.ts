/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : PATCH /api/waitlist/[id]
 * Scope        : API — Admin Waitlist
 *
 * Description  : Transitions a waitlist entry's status (notify / mark booked /
 *                cancel / expire), guarding illegal transitions with a 409.
 *
 * Responsibilities :
 * - Validate the status-transition payload
 * - Enforce the waitlist state machine (409 on an illegal move)
 * - Persist the transition (stamps notifiedAt when moving to 'notified')
 * - Enforce RBAC (receptionist+)
 *
 * Features / Functionality :
 * - State-machine guard: waiting→notified→booked, waiting/notified→cancelled/expired
 * - 404 when the entry does not exist
 * - Standard success envelope with the updated entry
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session,
 *                ../state-machine, @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        : Requires min role: receptionist. Entries are
 *                status-transitioned, never hard-deleted.
 ************************************************************/

import { getWaitlistEntryById, updateWaitlistStatus } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { waitlistStatusUpdateSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { assertWaitlistTransition } from '../state-machine'

// PATCH /api/waitlist/[id] — transition a waitlist entry at the active branch.
// The state machine guards the move (409 on an illegal transition); a missing
// entry, or one at another branch, is a 404. Stamping notifiedAt on the move
// into 'notified' is handled in the query layer.
export const PATCH = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = waitlistStatusUpdateSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)
    const branchId = ctx.branch.id

    const existing = await getWaitlistEntryById(id, branchId)
    if (!existing) {
      throw notFound('Waitlist entry not found.')
    }

    assertWaitlistTransition(existing.status, parsed.data.status)

    const updated = await updateWaitlistStatus(id, branchId, parsed.data.status)
    await audit(req, ctx.session, {
      action: 'status_change',
      entityType: 'waitlist',
      entityId: id,
      branchId,
      oldValues: { status: existing.status },
      newValues: { status: parsed.data.status },
    })
    return apiSuccess({ entry: updated })
  },
)
