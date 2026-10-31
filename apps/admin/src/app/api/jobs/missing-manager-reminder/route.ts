/************************************************************
 * Module Name  : POST /api/jobs/missing-manager-reminder
 * Scope        : API — Background Jobs (multi-branch R1.9)
 *
 * Description  : QStash-scheduled job (daily 10:00 IST) that reminds the Owner
 *                of each operational branch without a Manager to assign one.
 *                The dashboard shows the same condition as a banner.
 *
 * Responsibilities :
 * - Verify the QStash signature before doing any work
 * - Find operational branches without a Manager, grouped by Owner
 * - Send each such Owner one reminder naming their branches
 * - Ping the MISSING_MANAGER heartbeat on success
 *
 * Features / Functionality :
 * - Stops by itself: a branch with a Manager, or one that isn't operational,
 *   is never named
 * - One reminder per Owner per IST day (re-runs and retries send nothing new)
 * - Email, so it reaches an Owner who has no push subscription
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/notifications/dispatch,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 ************************************************************/

import {
  buildNotificationContent,
  istDayStart,
  missingManagerMessageData,
  missingManagerReminders,
} from '@rgss/business'
import { createNotification, getBranchPeople, hasNotificationSince } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { dispatchNotification } from '@/lib/notifications/dispatch'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:missing-manager-reminder',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  if (!(await verifyQStashSignature(req, bodyText))) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const now = new Date()
    const { branches } = await getBranchPeople()
    const reminders = missingManagerReminders(branches)
    const since = istDayStart(now)

    let sent = 0
    for (const reminder of reminders) {
      const ownerId = reminder.owner.userId
      if (await hasNotificationSince(ownerId, 'branch_manager_missing', since)) {
        continue
      }
      const { title, body } = buildNotificationContent(
        'branch_manager_missing',
        missingManagerMessageData(reminder),
      )
      const created = await createNotification({
        userId: ownerId,
        type: 'branch_manager_missing',
        title,
        body,
        channel: 'email',
      })
      await dispatchNotification({
        id: created.id,
        userId: ownerId,
        type: created.type,
        channel: created.channel,
        title,
        body,
      })
      sent += 1
    }

    const branchCount = reminders.reduce((n, r) => n + r.branches.length, 0)
    logger.info('[job:missing-manager-reminder] checked branches', {
      branchesWithoutManager: branchCount,
      owners: reminders.length,
      sent,
    })
    await pingHeartbeat('MISSING_MANAGER')
    return Response.json({ success: true, branches: branchCount, sent })
  } catch (error) {
    logger.error('[job:missing-manager-reminder] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
