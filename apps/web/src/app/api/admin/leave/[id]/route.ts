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

// PATCH /api/admin/leave/[id] — approve or reject a leave request. Rejection
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
