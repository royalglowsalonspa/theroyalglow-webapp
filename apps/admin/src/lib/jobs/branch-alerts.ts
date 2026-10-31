/************************************************************
 * Module Name  : jobs/branch-alerts (admin)
 * Scope        : Background Jobs — alerts to a branch's front desk (R7.4)
 *
 * Description  : Tells a booking's own branch that it needs a person: its
 *                Receptionist, and its Manager or, without one, its Owner
 *                (frontDeskRecipients in @rgss/business). Nobody at another
 *                branch hears about it, and the Developer isn't paged.
 *
 * Responsibilities :
 * - alertBranchFrontDesk({ branchId, bookingId, type, data })
 *
 * Notes        : The branch comes from the booking row, never from the job
 *                payload (trusted branch context). One notification per
 *                person per booking and type: a QStash retry after a partial
 *                fan-out tells only the people not yet told.
 ************************************************************/

import { buildNotificationContent, frontDeskRecipients } from '@rgss/business'
import { createNotification, getBranchPeople, hasNotification } from '@rgss/db/queries'
import { dispatchNotification } from '@/lib/notifications/dispatch'

export type BranchAlertType = 'stale_pending_booking' | 'no_show_check' | 'staff_overrun'

export type BranchAlertResult = {
  /** People told in this run. */
  notified: number
  /** The branch's front desk, whether told now or before. */
  recipients: number
}

export async function alertBranchFrontDesk(params: {
  branchId: string
  bookingId: string
  type: BranchAlertType
  data: Record<string, string>
}): Promise<BranchAlertResult> {
  const { branches } = await getBranchPeople([params.branchId])
  const branch = branches[0]
  if (!branch) {
    return { notified: 0, recipients: 0 }
  }

  const recipients = frontDeskRecipients(branch)
  const { title, body } = buildNotificationContent(params.type, {
    ...params.data,
    branchName: branch.name,
  })

  let notified = 0
  for (const recipient of recipients) {
    if (await hasNotification(recipient.userId, params.type, params.bookingId)) {
      continue
    }
    const created = await createNotification({
      userId: recipient.userId,
      type: params.type,
      title,
      body,
      channel: 'push',
      bookingId: params.bookingId,
    })
    await dispatchNotification({
      id: created.id,
      userId: recipient.userId,
      type: params.type,
      channel: created.channel,
      title,
      body,
    })
    notified += 1
  }
  return { notified, recipients: recipients.length }
}
