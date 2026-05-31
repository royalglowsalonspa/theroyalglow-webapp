import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { buildNotificationContent } from '@rgss/business'
import { createNotification, getGemsExpiringInDays, hasNotification } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

// Job 15 — Gems Expiry Reminder (QStash scheduled, daily 10:30am IST).
//
// Finds customers with earned gems expiring in exactly 7 IST calendar days
// (grouped by customer in the query, so a customer with multiple expiring
// batches gets one combined total) and sends a PUSH-only notification (no email
// per design — gems are an engagement mechanic, not a critical alert).
// Idempotent via a per-(customer,'gems_expiry_7d') notification row (Property 6).

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EXPIRY_DAYS = 7

const logger = createLogger({
  service: 'web:jobs:gems-expiry-reminder',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const now = new Date()
    const customers = await getGemsExpiringInDays(EXPIRY_DAYS, now)
    let processed = 0

    for (const { customerId, expiringGems } of customers) {
      if (await hasNotification(customerId, 'gems_expiry_7d')) {
        continue
      }

      const { title, body } = buildNotificationContent('gems_expiry_7d', {
        count: String(expiringGems),
      })

      const created = await createNotification({
        userId: customerId,
        type: 'gems_expiry_7d',
        title,
        body,
        channel: 'push',
      })

      await dispatchNotification({
        id: created.id,
        userId: created.userId,
        type: created.type,
        channel: created.channel,
        title: created.title,
        body: created.body,
      })

      processed += 1
    }

    await pingHeartbeat('GEMS_EXPIRY')
    return Response.json({ success: true, processed })
  } catch (error) {
    logger.error('[job:gems-expiry-reminder] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
