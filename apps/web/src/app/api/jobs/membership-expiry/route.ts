import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { buildNotificationContent } from '@rgss/business'
import { createNotification, getMembershipsExpiringInDays, hasNotification } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

// Job 9 — Membership Expiry Alerts (QStash scheduled, daily 12:30am IST).
//
// Notifies the owning customer of each active membership expiring in exactly
// 30, 7, or 1 IST calendar days (the day match is computed in the query via
// `daysUntilIST`, so each membership lands in at most one tier per run —
// Property 5). Respects `membershipAlertsEnabled` (Requirement 2.4) and is
// idempotent via a per-(user,type) `notification` row (Property 6).

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'web:jobs:membership-expiry',
  environment: process.env.NODE_ENV ?? 'development',
})

const TIERS = [
  { days: 30, type: 'membership_expiry_30d' as const },
  { days: 7, type: 'membership_expiry_7d' as const },
  { days: 1, type: 'membership_expiry_1d' as const },
]

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const now = new Date()
    let processed = 0

    for (const tier of TIERS) {
      const memberships = await getMembershipsExpiringInDays(tier.days, now)

      for (const m of memberships) {
        // Skip customers who have opted out of membership alerts.
        if (!m.membershipAlertsEnabled) {
          continue
        }

        // Dedupe per (user, tier-type). type+user is sufficient: the same tier
        // only matches a given membership on one day, so it never double-sends
        // across re-runs/retries (Property 6).
        if (await hasNotification(m.userId, tier.type)) {
          continue
        }

        const { title, body } = buildNotificationContent(tier.type, {
          serviceName: m.tierNameSnapshot,
        })

        const created = await createNotification({
          userId: m.userId,
          type: tier.type,
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
    }

    await pingHeartbeat('MEMBERSHIP_EXPIRY')
    return Response.json({ success: true, processed })
  } catch (error) {
    logger.error('[job:membership-expiry] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
