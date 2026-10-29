/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/weekly-report
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (Monday 8:00 AM IST) that sends each
 *                branch's weekly sales report, with its week-over-week
 *                comparison, to that branch's Owner and Manager, and the
 *                summary across branches to the Developer (multi-branch R6.5,
 *                R7.4).
 *
 * Responsibilities :
 * - Query the last 7 days and the 7 before them, per branch
 * - Format one report per branch and the summary across branches
 * - Email each Owner and Manager their branches' reports (one email each)
 * - Email the summary to the Developer and post it to Slack
 *
 * Features / Functionality :
 * - Each branch is compared with its own previous week
 * - Nobody sees a branch they hold no role at (R3.2)
 * - Slack and email delivery (both guarded no-ops without keys)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/reports/deliver,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - Recipients come from branch roles; DAILY_REPORT_EMAIL_RECIPIENTS is retired.
 * - 500 only when reading fails, before anything is sent.
 ************************************************************/

import {
  emptyReportFigures,
  formatWeeklyReport,
  formatWeeklySummary,
  istDateInDays,
  istToday,
  planReportDeliveries,
} from '@rgss/business'
import { getBranchPeople, getWeeklyBranchReports } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { deliverBranchReports } from '@/lib/reports/deliver'

// Job 14 — Weekly Summary Report (QStash scheduled, `30 2 * * 1` UTC = Monday
// 8:00 AM IST). Same shape as the daily report but over the last 7 days, plus
// a week-over-week comparison against each branch's previous 7 days.
//
// Route shape: NOT withErrorHandler. Read the raw body once, verify the QStash
// signature (401 on failure → no work), do the work inside try/catch (500 on
// failure so QStash retries), then ping the heartbeat and return a minimal
// job-response shape.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:weekly-report',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  const bodyText = await req.text()
  const verified = await verifyQStashSignature(req, bodyText)
  if (!verified) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const now = new Date()
    // This week = the last 7 IST calendar days ending today (inclusive):
    // start = today - 6 days, end = today. Previous week = the 7 IST calendar
    // days immediately before: today - 13 days to today - 7 days.
    const [current, previous, people] = await Promise.all([
      getWeeklyBranchReports(istDateInDays(now, -6), istToday(now)),
      getWeeklyBranchReports(istDateInDays(now, -13), istDateInDays(now, -7)),
      getBranchPeople(),
    ])

    const plan = planReportDeliveries(
      people.branches.map((b) => ({
        id: b.id,
        name: b.name,
        status: b.status,
        people: b,
        hasActivity: current.branches.has(b.id),
      })),
    )
    const branchNames = new Map(people.branches.map((b) => [b.id, b.name]))
    const reportText = new Map<string, string>()
    const summaryLines = plan.branchIds.map((id) => {
      const figures = current.branches.get(id) ?? emptyReportFigures()
      const before = previous.branches.get(id) ?? emptyReportFigures()
      const branchName = branchNames.get(id) ?? id
      reportText.set(
        id,
        formatWeeklyReport(
          {
            date: current.date,
            periodStart: current.periodStart,
            periodEnd: current.periodEnd,
            ...figures,
          },
          before,
          branchName,
        ),
      )
      return { branchName, figures, previous: before }
    })

    const result = await deliverBranchReports({
      kind: 'Weekly',
      plan,
      branchNames,
      reportText,
      summary: formatWeeklySummary(current.periodStart, current.periodEnd, summaryLines),
      developerEmail: people.developer?.email ?? null,
    })
    logger.info('[job:weekly-report] sent', { branches: plan.branchIds.length, ...result })

    await pingHeartbeat('NIGHTLY_SALES')
    return Response.json({ success: true, branches: plan.branchIds.length, ...result })
  } catch (error) {
    logger.error('[job:weekly-report] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
