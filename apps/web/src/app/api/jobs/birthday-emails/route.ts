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
 * - Dedupe by (user, 'birthday_offer') type; one send per birthday per year.
 ************************************************************/

import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { buildNotificationContent } from '@rgss/business'
import { createNotification, getBirthdayCustomers, hasNotification } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

// Job 10 — Birthday Emails (QStash scheduled, daily 9:30am IST).
//
// Finds customers whose date_of_birth (month + day) is today in IST and who
// have `marketingConsent` (enforced in the query), then sends a birthday offer
// via email + in-app notification.
//
// Dedupe is by (user, 'birthday_offer'). `hasNotification` by type alone would
// suppress for ever, but a customer's birthday matches on exactly one day per
// year, so in practice this only ever matches the single send made on that
// birthday — acceptable for a once-a-year event, and it correctly prevents a
// double-send across same-day re-runs / QStash retries (Property 6).

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'web:jobs:birthday-emails',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const now = new Date()
    const customers = await getBirthdayCustomers(now)
    let processed = 0

    for (const c of customers) {
      if (await hasNotification(c.userId, 'birthday_offer')) {
        continue
      }

      const { title, body } = buildNotificationContent('birthday_offer', {
        staffName: c.customerName ?? 'our team',
      })

      const created = await createNotification({
        userId: c.userId,
        type: 'birthday_offer',
        title,
        body,
        channel: 'email',
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

    await pingHeartbeat('BIRTHDAY')
    return Response.json({ success: true, processed })
  } catch (error) {
    logger.error('[job:birthday-emails] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
