/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : dispatch (admin)
 * Scope        : Notifications
 *
 * Description  : Notification delivery dispatcher. Delivers via Web Push and/or
 *                email after the notification row is persisted. Best-effort,
 *                never throws. Ported verbatim from apps/web.
 *
 * Responsibilities :
 * - Route notifications to Web Push and/or email providers
 * - Update notification row status (sent/failed) after delivery
 * - Skip delivery gracefully when provider keys are absent
 * - Never throw to the caller (delivery is best-effort)
 *
 * Features / Functionality :
 * - dispatchNotification() — multi-channel delivery orchestration
 * - Channel routing based on notification.channel (push/email)
 * - Dead subscription pruning on Web Push 404/410
 *
 * Tech Stack   : TypeScript
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/db/queries, @rgss/logger, ./providers/email, ./providers/webpush
 *
 * Notes        : Reads process.env directly for graceful degradation
 ************************************************************/

import {
  getActivePushSubscriptions,
  getUserContact,
  markNotificationDelivery,
  removePushSubscription,
} from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { sendEmail } from './providers/email'
import { sendWebPush } from './providers/webpush'

// Single seam between persisting a `notification` row and actually delivering
// it via Web Push / email. The caller has already persisted the notification
// record; this function performs best-effort delivery and updates the row's
// `status`/`sentAt` to reflect the outcome.
//
// We read provider config straight from `process.env` (NOT from `@/env`) on
// purpose: `env.ts` types these keys as required and would fail build-time
// validation when they are absent. Reading `process.env` directly behind a
// truthy guard lets the app build and run with no provider keys configured.
//
// This function NEVER throws: delivery is best-effort and must not affect the
// caller, which has already committed the notification record. Any provider
// failure is logged, the row is marked `failed`, and we return.

const logger = createLogger({
  service: 'admin:notifications:dispatch',
  environment: process.env.NODE_ENV ?? 'development',
})

type DispatchableNotification = {
  id: string
  userId: string
  type: string
  channel: string
  title: string
  body: string
}

export async function dispatchNotification(notification: DispatchableNotification): Promise<void> {
  const { id, userId, type, channel, title, body } = notification

  // Read provider keys directly from `process.env` (guarded) so this seam never
  // triggers `env.ts` build-time validation when the keys are absent.
  const hasWebPush = Boolean(process.env.VAPID_PRIVATE_KEY)
  const hasResend = Boolean(process.env.RESEND_API_KEY)

  // No provider keys configured → nothing to deliver. The notification row is
  // persisted and surfaced in-app; delivery activates once keys land.
  if (!(hasWebPush || hasResend)) {
    logger.info('dispatchNotification skipped (no provider keys configured)', {
      id,
      type,
      channel,
    })
    return
  }

  try {
    const wantsPush = channel.includes('push')
    const wantsEmail = channel.includes('email')

    // `delivered` stays false until at least one channel reports a success.
    let delivered = false

    if (wantsPush && hasWebPush) {
      const subscriptions = await getActivePushSubscriptions(userId)
      const { sent } = await sendWebPush(
        subscriptions.map((sub) => ({
          endpoint: sub.endpoint,
          p256dhKey: sub.p256dhKey,
          authKey: sub.authKey,
        })),
        { title, body },
        // Prune subscriptions the push service reports as gone (404/410).
        (endpoint) => removePushSubscription(userId, endpoint),
      )
      if (sent > 0) {
        delivered = true
      }
    }

    if (wantsEmail && hasResend) {
      const contact = await getUserContact(userId)
      if (contact?.email) {
        const ok = await sendEmail({
          to: contact.email,
          subject: title,
          html: `<p>${body}</p>`,
        })
        if (ok) {
          delivered = true
        }
      } else {
        logger.warn('dispatchNotification: no email on record for user', {
          id,
          userId,
        })
      }
    }

    await markNotificationDelivery(id, delivered ? 'sent' : 'failed')
  } catch (error) {
    // Never throw to the caller. Best-effort mark as failed.
    logger.error('dispatchNotification failed', {
      id,
      type,
      channel,
      error: error instanceof Error ? error.message : String(error),
    })
    await markNotificationDelivery(id, 'failed').catch((markError) => {
      logger.error('dispatchNotification: failed to mark notification failed', {
        id,
        error: markError instanceof Error ? markError.message : String(markError),
      })
    })
  }
}
