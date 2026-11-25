/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/birthday-emails
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (daily 9:30am IST) that sends birthday
 *                offer emails to customers whose birthday is today.
 *
 * Responsibilities :
 * - Find customers with today's birthday who have marketing consent
 * - Send birthday offer via email and in-app notification
 * - Maintain idempotency via notification deduplication
 *
 * Features / Functionality :
 * - Birthday match by month+day in IST
 * - Marketing consent enforcement
 * - Idempotent (one birthday email per customer per year)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/notifications/dispatch,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - QStash signature verification required (401 on fail).
 * - Claim one birthday offer per customer and IST calendar year.
 ************************************************************/

import { buildNotificationContent, istToday } from '@rgss/business'
import {
  createNotificationOnce,
  getBirthdayCustomers,
  hasNotificationSince,
} from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'

// Job 10 — Birthday Emails (QStash scheduled, daily 9:30am IST).
//
// Finds customers whose date_of_birth (month + day) is today in IST and who
// have `marketingConsent` (enforced in the query), then sends a birthday offer
// via email + in-app notification.
//
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:birthday-emails',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const now = new Date()
    const year = istToday(now).slice(0, 4)
    const yearStart = new Date(`${year}-01-01T00:00:00+05:30`)
    const customers = await getBirthdayCustomers(now)
    let processed = 0

    for (const c of customers) {
      // Recognize a birthday offer sent this year before stable IDs existed.
      if (await hasNotificationSince(c.userId, 'birthday_offer', yearStart)) {
        continue
      }

      const { title, body } = buildNotificationContent('birthday_offer', {
        staffName: c.customerName ?? 'our team',
      })

      const created = await createNotificationOnce({
        id: `birthday_offer:${JSON.stringify([c.userId, year])}`,
        userId: c.userId,
        type: 'birthday_offer',
        title,
        body,
        channel: 'email',
      })
      if (!created) continue

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

    await pingHeartbeat('BIRTHDAY')
    return Response.json({ success: true, processed })
  } catch (error) {
    logger.error('[job:birthday-emails] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
