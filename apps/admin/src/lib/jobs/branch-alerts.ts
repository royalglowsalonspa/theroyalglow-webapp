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
 *                payload (trusted branch context). A QStash retry after a
 *                partial fan-out tells only people not yet told about that
 *                booking and alert, or that slot for a no-show check.
 ************************************************************/

import { buildNotificationContent, frontDeskRecipients } from '@rgss/business'
import {
  createNotificationOnce,
  getBranchPeople,
  hasNotification,
  hasNotificationSince,
} from '@rgss/db/queries'
import { dispatchNotification } from '@/lib/notifications/dispatch'

export type BranchAlertType = 'stale_pending_booking' | 'no_show_check' | 'staff_overrun'

export type BranchAlertResult = {
  /** People told in this run. */
  notified: number
  /** The branch's front desk, whether told now or before. */
  recipients: number
}

export async function alertBranchFrontDesk(
  params: {
    branchId: string
    bookingId: string
    data: Record<string, string>
  } & (
    | { type: 'no_show_check'; checkAt: Date }
    | { type: Exclude<BranchAlertType, 'no_show_check'> }
  ),
): Promise<BranchAlertResult> {
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
    const { userId } = recipient
    const alreadyNotified =
      params.type === 'no_show_check'
        ? await hasNotificationSince(userId, params.type, params.checkAt, params.bookingId)
        : await hasNotification(userId, params.type, params.bookingId)
    if (alreadyNotified) {
      continue
    }
    // Keep recognizing older rows above, then atomically claim the delivery.
    // No-show checks retain their existing key so retries during rollout agree.
    const id =
      params.type === 'no_show_check'
        ? `no-show-check:${JSON.stringify([userId, params.bookingId, params.checkAt])}`
        : `${params.type}:${JSON.stringify([userId, params.bookingId])}`
    const created = await createNotificationOnce({
      id,
      userId,
      type: params.type,
      title,
      body,
      channel: 'push',
      bookingId: params.bookingId,
    })
    if (!created) {
      continue
    }
    await dispatchNotification({
      id: created.id,
      userId,
      type: params.type,
      channel: created.channel,
      title,
      body,
    })
    notified += 1
  }
  return { notified, recipients: recipients.length }
}
