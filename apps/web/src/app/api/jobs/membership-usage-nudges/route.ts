import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { buildNotificationContent } from '@rgss/business'
import { createNotification, getNudgeEligibleMemberships, hasNotification } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

// Job 11 — Membership Usage Nudges (QStash scheduled, daily randomized batch).
//
// A utilisation campaign (not an expiry milestone): each run picks a RANDOM
// subset of active members with unused hours and nudges them to come use their
// SPA time. Respects `membershipAlertsEnabled` (Requirement 2.4).
//
// Dedupe: `hasNotification(userId, 'membership_usage_nudge')` matches ALL prior
// nudges, so a member is nudged at most once. A proper recency-window dedupe
// (nudge again after N days) is a future refinement — documented here; the
// simple check keeps the campaign from re-nudging the same person and is enough
// to satisfy idempotency across same-batch re-runs / QStash retries (Property 6).

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'web:jobs:membership-usage-nudges',
  environment: process.env.NODE_ENV ?? 'development',
})

// Cap how many members are nudged per daily batch so the campaign stays
// occasional and within QStash/provider budgets.
const MAX_PER_BATCH = 20

// Fisher–Yates shuffle (returns a new array) so the daily subset is random and
// different members hear from us on different days.
function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j] as T
    out[j] = tmp as T
  }
  return out
}

// Format remaining membership minutes as a human "Xh Ym" string for the nudge.
function formatRemaining(totalMinutes: number, usedMinutes: number): string {
  const remaining = Math.max(0, totalMinutes - usedMinutes)
  const hours = Math.floor(remaining / 60)
  const minutes = remaining % 60
  if (hours > 0 && minutes > 0) {
    return `${hours} hr ${minutes} min`
  }
  if (hours > 0) {
    return `${hours} hr`
  }
  return `${minutes} min`
}

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const eligible = (await getNudgeEligibleMemberships()).filter((m) => m.membershipAlertsEnabled)
    const batch = shuffle(eligible).slice(0, MAX_PER_BATCH)
    let processed = 0

    for (const m of batch) {
      if (await hasNotification(m.userId, 'membership_usage_nudge')) {
        continue
      }

      const { title, body } = buildNotificationContent('membership_usage_nudge', {
        count: formatRemaining(m.totalHoursMinutes, m.usedHoursMinutes),
      })

      const created = await createNotification({
        userId: m.userId,
        type: 'membership_usage_nudge',
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

    await pingHeartbeat('MEMBERSHIP_NUDGES')
    return Response.json({ success: true, processed })
  } catch (error) {
    logger.error('[job:membership-usage-nudges] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
