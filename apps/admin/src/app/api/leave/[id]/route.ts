/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 29-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : PATCH /api/leave/[id]
 * Scope        : API — Admin Leave at the active branch (multi-branch R5.10)
 *
 * Description  : Approves or rejects a pending leave request of someone who
 *                works at the active branch. Notifies the staff member and
 *                returns the branch's booking conflicts on approval.
 *
 * Responsibilities :
 * - Validate leave decision (approve/reject with reason)
 * - Check who may decide it (leaveDecisionRefusal) and the state machine
 * - Decide it with a guard that only a still-pending request matches
 * - Notify staff member via push notification
 * - On approval, take the person off that day's bookings (every branch) in
 *   the same transaction, and return this branch's confirmed ones, now
 *   listed for reassignment (R5.8)
 *
 * Features / Functionality :
 * - Nobody decides their own leave; a Manager's leave needs the branch's
 *   Owner or the Developer (403)
 * - Two people deciding at once: one wins, the other gets 409
 *   LEAVE_ALREADY_DECIDED
 * - Rejection reason capture (required for rejections)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/branch-context, @/lib/api/error-handler,
 *                @/lib/notifications/dispatch, @rgss/business,
 *                @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role at the active branch: receptionist. The body names the
 *   branch whose queue the decision was made in (409 after a switch).
 * - A request of someone at another branch is not found (404).
 * - Conflicts are this branch's bookings; a shared Manager's other branches
 *   see the approved leave in their own queue and schedule.
 ************************************************************/

import {
  assertLeaveTransition,
  buildNotificationContent,
  leaveDecisionRefusal,
} from '@rgss/business'
import {
  createNotification,
  getBookingSummaries,
  getLeaveById,
  updateLeaveStatus,
} from '@rgss/db/queries'
import { AppError, badRequest, ERROR_CODES, forbidden, notFound } from '@rgss/errors'
import { leaveDecisionSchema } from '@rgss/types'
import { audit } from '@/lib/api/audit'
import { assertRenderedBranch, requireBranchRole } from '@/lib/api/branch-context'
import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { dispatchNotification } from '@/lib/notifications/dispatch'

// PATCH /api/leave/[id] — approve or reject a leave request. Rejection
// requires a reason. The leave state machine guards the transition (409 on an
// illegal move). On approval, confirmed bookings at this branch assigned to the
// staff member on the leave date are returned as conflicts for manual
// reassignment. Either way the affected staff member gets a notification
// (best-effort dispatch).
export const PATCH = withErrorHandler(
  async (req: Request, route: { params: Promise<{ id: string }> }) => {
    const ctx = await requireBranchRole('receptionist')
    const { id } = await route.params

    const body = await req.json().catch(() => null)
    const parsed = leaveDecisionSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }
    assertRenderedBranch(ctx, parsed.data.branchId)
    const branchId = ctx.branch.id

    const existing = await getLeaveById(id, branchId)
    if (!existing) {
      throw notFound('Leave request not found.')
    }

    const refusal = leaveDecisionRefusal(
      { userId: ctx.session.user.id, role: ctx.branch.role },
      { userId: existing.staffUserId, roleWitness: existing.staffRoleWitness },
    )
    if (refusal) {
      throw forbidden(refusal.reason)
    }

    const decision = parsed.data
    const nextStatus = decision.action === 'approve' ? 'approved' : 'rejected'
    assertLeaveTransition(existing.approvalStatus, nextStatus)

    const rejectionReason = decision.action === 'reject' ? decision.rejectionReason : undefined

    // Approval takes the person off that day's bookings in the same
    // transaction; the confirmed ones are listed for reassignment (R5.8).
    const decided = await updateLeaveStatus(
      id,
      branchId,
      nextStatus,
      ctx.session.user.id,
      rejectionReason,
    )
    if (!decided) {
      throw new AppError({
        code: ERROR_CODES.LEAVE_ALREADY_DECIDED,
        message: 'This request was decided or withdrawn meanwhile. Reload to see it.',
        statusCode: 409,
      })
    }
    await audit(req, ctx.session, {
      action: 'status_change',
      entityType: 'staff_time_off',
      entityId: id,
      branchId,
      oldValues: { approvalStatus: existing.approvalStatus },
      newValues: { approvalStatus: nextStatus },
    })

    const { title, body: notificationBody } = buildNotificationContent(
      decision.action === 'approve' ? 'leave_approved' : 'leave_rejected',
      { date: existing.date, reason: rejectionReason ?? '' },
    )
    const notificationType = decision.action === 'approve' ? 'leave_approved' : 'leave_rejected'
    const notif = await createNotification({
      userId: existing.staffUserId,
      type: notificationType,
      title,
      body: notificationBody,
      channel: 'push',
    })
    await dispatchNotification({
      id: notif.id,
      userId: existing.staffUserId,
      type: notificationType,
      channel: notif.channel,
      title,
      body: notificationBody,
    })

    // This branch's bookings only; another branch sees its own on its dashboard.
    const conflicts = await getBookingSummaries(decided.reassignedBookingIds, branchId)

    return apiSuccess({ leave: decided.leave, conflicts })
  },
)
