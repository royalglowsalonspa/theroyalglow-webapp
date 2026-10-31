/************************************************************
 * Module Name  : POST /api/staff/[id]/remove
 * Scope        : API — Remove staff (multi-branch R1.5, R1.7, R1.11)
 *
 * Description  : Removes a Stylist or Therapist from the active branch: their
 *                profile is deactivated, they return to Customer and are
 *                signed out, in one transaction with the audit entry. Their
 *                account, customer data and history are kept, and adding them
 *                again later reactivates the same profile.
 *
 * Features / Functionality :
 * - POST { branchId } → { changed, reassignments, liveUpdates }
 * - reassignments: confirmed bookings still to come that lost them in the
 *   same transaction and are listed for reception to reassign (R1.7)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Notes        : Manager of the branch, its Owner, or the Developer. The
 *                Receptionist and Manager are removed in Users & Roles.
 ************************************************************/

import { getStaffMemberAtBranch } from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { staffRemoveSchema } from '@rgss/types'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { changeBranchRole } from '@/lib/api/branch-roles'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'

type Params = { params: Promise<{ id: string }> }

export const POST = withErrorHandler(async (req: Request, { params }: Params) => {
  const ctx = await requireBranchRole('manager')
  const { id } = await params

  const body = await req.json().catch(() => null)
  const parsed = staffRemoveSchema.safeParse(body)
  if (!parsed.success) {
    throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
  }
  assertRenderedBranch(ctx, parsed.data.branchId)

  const member = await getStaffMemberAtBranch(id, ctx.branch.id)
  if (!member) {
    throw notFound('Staff member not found.')
  }
  if (member.roleWitness !== 'staff') {
    throw badRequest('Remove the Manager or the Receptionist in Users & Roles.')
  }

  const result = await changeBranchRole(ctx.session.user.id, {
    kind: 'remove',
    branchId: ctx.branch.id,
    userId: member.userId,
  })
  return apiSuccess({
    changed: result.changed,
    reassignments: result.reassignments,
    liveUpdates: result.liveUpdates,
  })
})
