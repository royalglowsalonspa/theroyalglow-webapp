/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/lead-followups
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (daily 11:00 IST) that reminds each
 *                lead's branch about leads in follow_up status not contacted
 *                in 48+ hours.
 *
 * Responsibilities :
 * - Find follow_up leads stale for 48+ hours
 * - Route each to its assignee while they still hold a role at the lead's
 *   branch, otherwise to that branch's front desk (multi-branch R7.4)
 * - Send each person one reminder covering all their stale leads
 *
 * Features / Functionality :
 * - 48-hour staleness threshold for follow-up leads
 * - One push per person per IST day: "a follow-up with Priya at Rayasandra",
 *   "3 leads at Rayasandra", or a breakdown across branches
 * - Leads without a known branch are skipped and counted, never misdirected
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/notifications/dispatch,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - Idempotent per (person, 'lead_follow_up_due', IST day): re-runs and QStash
 *   retries the same day send nothing new. A lead still stale tomorrow is in
 *   tomorrow's reminder. (Before this, one reminder per assignee ever.)
 ************************************************************/

import {
  buildNotificationContent,
  istDayStart,
  leadFollowUpMessageData,
  planLeadFollowUps,
} from '@rgss/business'
import {
  createNotification,
  getBranchPeople,
  getStaleFollowUpLeads,
  hasNotificationSince,
} from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'

// Job 12 — Lead Follow-up Reminders (QStash scheduled, daily 11:00 IST).

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
    let unrouted = 0

    if (leads.length > 0) {
      const branchIds = [
        ...new Set(leads.flatMap((lead) => (lead.branchId === null ? [] : [lead.branchId]))),
      ]
      const { branches, developer } = await getBranchPeople(branchIds)
      const plan = planLeadFollowUps({
        leads,
        branches: branches.map((b) => ({ id: b.id, name: b.name, people: b })),
        developerUserId: developer?.userId ?? null,
      })
      unrouted = plan.unrouted

      const since = istDayStart(now)
      for (const digest of plan.digests) {
        if (await hasNotificationSince(digest.userId, 'lead_follow_up_due', since)) {
          continue
        }
        const { title, body } = buildNotificationContent(
          'lead_follow_up_due',
          leadFollowUpMessageData(digest),
        )
        const created = await createNotification({
          userId: digest.userId,
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
    }

    if (unrouted > 0) {
      logger.warn('[job:lead-followups] stale leads with nobody to tell', { unrouted })
    }
    await pingHeartbeat('LEAD_FOLLOWUPS')
    return Response.json({ success: true, processed, unrouted })
  } catch (error) {
    logger.error('[job:lead-followups] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
