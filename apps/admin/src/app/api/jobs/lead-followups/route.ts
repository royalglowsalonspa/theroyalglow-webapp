/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/lead-followups
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (daily 10:30am IST) that reminds assigned
 *                staff about leads in follow_up status not contacted in 48+ hours.
 *
 * Responsibilities :
 * - Find follow_up leads stale for 48+ hours
 * - Send push reminder to the assigned staff member
 * - Skip unassigned leads (no valid recipient)
 *
 * Features / Functionality :
 * - 48-hour staleness threshold for follow-up leads
 * - Staff-targeted push notification
 * - Unassigned lead skip (avoids misdirected notifications)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/notifications/dispatch,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - Idempotent via per-(assignee, 'lead_follow_up_due') notification row.
 * - Only notifies assigned staff, not all receptionists.
 ************************************************************/

import { buildNotificationContent } from '@rgss/business'
import { createNotification, getStaleFollowUpLeads, hasNotification } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'

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
  service: 'admin:jobs:lead-followups',
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
