import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'
import { buildNotificationContent } from '@rgss/business'
import { createNotification, getStaleFollowUpLeads, hasNotification } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

// Job 12 — Lead Follow-up Reminders (QStash scheduled, daily 10:30am IST).
//
// Finds leads in `follow_up` status whose last contact is older than 48 hours
// and pushes a reminder to the assigned staff member (Requirement 2.5). Leads
// with no assignee can't be actioned, so they are skipped. Idempotent via a
// per-(assignee,'lead_follow_up_due') notification row (Property 6).

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STALE_HOURS = 48

const logger = createLogger({
  service: 'web:jobs:lead-followups',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const now = new Date()
    const leads = await getStaleFollowUpLeads(STALE_HOURS, now)
    let processed = 0

    for (const lead of leads) {
      const assignee = lead.assignedTo
      // Unassigned leads have no recipient — skip (Property 7: never misdirect).
      if (assignee === null) {
        continue
      }

      if (await hasNotification(assignee, 'lead_follow_up_due')) {
        continue
      }

      const { title, body } = buildNotificationContent('lead_follow_up_due', {
        staffName: lead.name,
      })

      const created = await createNotification({
        userId: assignee,
        type: 'lead_follow_up_due',
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

    await pingHeartbeat('LEAD_FOLLOWUPS')
    return Response.json({ success: true, processed })
  } catch (error) {
    logger.error('[job:lead-followups] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
