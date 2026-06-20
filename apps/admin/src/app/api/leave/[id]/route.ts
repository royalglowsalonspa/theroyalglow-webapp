/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : PATCH /api/leave/[id]
 * Scope        : API — Admin Leave
 *
 * Description  : Approves or rejects a pending leave request. Notifies the
 *                staff member and returns any booking conflicts on approval.
 *
 * Responsibilities :
 * - Validate leave decision (approve/reject with reason)
 * - Execute leave state machine transition
 * - Notify staff member via push notification
 * - Return booking conflicts on approval for reassignment
 *
 * Features / Functionality :
 * - Leave approve/reject with state machine guard
 * - Push notification dispatch to affected staff
 * - Booking conflict detection on approval
 * - Rejection reason capture (required for rejections)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/api/error-handler, @/lib/api/session, @/lib/notifications/dispatch,
 *                @rgss/business, @rgss/db/queries, @rgss/errors, @rgss/types
 *
 * Notes        :
 * - Requires min role: receptionist.
 * - Booking conflicts returned on approval for manual staff reassignment.
 ************************************************************/

import { apiSuccess, withErrorHandler } from '@/lib/api/error-handler'
import { requireRole } from '@/lib/api/session'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { assertLeaveTransition, buildNotificationContent } from '@rgss/business'
import {
  createNotification,
  getConfirmedBookingsForStaffOnDate,
  getLeaveById,
  updateLeaveStatus,
} from '@rgss/db/queries'
import { badRequest, notFound } from '@rgss/errors'
import { leaveDecisionSchema } from '@rgss/types'

// PATCH /api/leave/[id] — approve or reject a leave request. Rejection
// requires a reason. The leave state machine guards the transition (409 on an
// illegal move). On approval, confirmed bookings assigned to the staff member on
// the leave date are returned as conflicts for manual reassignment. Either way the
// affected staff member gets a notification (best-effort dispatch).
export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const session = await requireRole('receptionist')
    const { id } = await ctx.params

    const body = await req.json().catch(() => null)
    const parsed = leaveDecisionSchema.safeParse(body)
    if (!parsed.success) {
      throw badRequest('Invalid request data', parsed.error.flatten().fieldErrors)
    }

    const existing = await getLeaveById(id)
    if (!existing) {
      throw notFound('Leave request not found.')
    }

    const decision = parsed.data
    const nextStatus = decision.action === 'approve' ? 'approved' : 'rejected'
    assertLeaveTransition(existing.approvalStatus, nextStatus)

    const rejectionReason = decision.action === 'reject' ? decision.rejectionReason : undefined

    const updated = await updateLeaveStatus(id, nextStatus, session.user.id, rejectionReason)

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

    const conflicts =
      decision.action === 'approve'
        ? await getConfirmedBookingsForStaffOnDate(existing.staffId, existing.date)
        : []

    return apiSuccess({ leave: updated, conflicts })
  },
)
