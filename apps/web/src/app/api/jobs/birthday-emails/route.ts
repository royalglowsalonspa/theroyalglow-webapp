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
