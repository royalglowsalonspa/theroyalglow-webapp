/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/daily-sales-report
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (10:30 PM IST daily) that sends each
 *                branch's daily sales report to that branch's Owner and
 *                Manager, and the summary across branches to the Developer
 *                (multi-branch R6.5, R7.4).
 *
 * Responsibilities :
 * - Query today's paid invoices and booking metrics, per branch
 * - Format one report per branch and the summary across branches
 * - Email each Owner and Manager their branches' reports (one email each)
 * - Email the summary to the Developer and post it to Slack
 *
 * Features / Functionality :
 * - Reported branches: every operational branch, plus any other with activity
 * - Nobody sees a branch they hold no role at (R3.2)
 * - Slack webhook and email are guarded no-ops without keys
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/reports/deliver,
 *                @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - Report covers today (IST), not yesterday.
 * - Recipients come from branch roles. DAILY_REPORT_EMAIL_RECIPIENTS is
 *   retired: a fixed list can't follow who may see which branch.
 * - 500 only when reading fails, before anything is sent; sends never throw,
 *   so QStash never resends a report.
 ************************************************************/

import {
  emptyReportFigures,
  formatDailyReport,
  formatDailySummary,
  istToday,
  planReportDeliveries,
} from '@rgss/business'
import { getBranchPeople, getDailyBranchReports } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'
import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { deliverBranchReports } from '@/lib/reports/deliver'

// Job 13 — Daily Sales Report (QStash scheduled, `0 17 * * *` UTC = 10:30 PM
// IST).
//
// Route shape: NOT withErrorHandler. Read the raw body once, verify the QStash
// signature (401 on failure → no work), do the work inside try/catch (500 on
// failure so QStash retries with backoff), and on success ping the heartbeat
// and return a minimal job-response shape.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'admin:jobs:daily-sales-report',
  environment: process.env.NODE_ENV ?? 'development',
})

export const POST = async (req: Request) => {
  // Verifying the signature consumes the body, so read it once here and pass
  // the raw text through (this route has no JSON body to parse anyway).
  const bodyText = await req.text()
  const verified = await verifyQStashSignature(req, bodyText)
  if (!verified) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // The daily report runs at end of day (10:30 PM IST) and covers the day
    // that is just finishing, so the relevant figures are TODAY's in IST.
    const dateISO = istToday()
    const [report, people] = await Promise.all([getDailyBranchReports(dateISO), getBranchPeople()])

    const plan = planReportDeliveries(
      people.branches.map((b) => ({
        id: b.id,
        name: b.name,
        status: b.status,
        people: b,
        hasActivity: report.branches.has(b.id),
      })),
    )
    const branchNames = new Map(people.branches.map((b) => [b.id, b.name]))
    const reportText = new Map<string, string>()
    const summaryLines = plan.branchIds.map((id) => {
      const figures = report.branches.get(id) ?? emptyReportFigures()
      const branchName = branchNames.get(id) ?? id
      reportText.set(id, formatDailyReport({ date: report.date, ...figures }, branchName))
      return { branchName, figures }
    })

    const result = await deliverBranchReports({
      kind: 'Daily',
      plan,
      branchNames,
      reportText,
      summary: formatDailySummary(report.date, summaryLines),
      developerEmail: people.developer?.email ?? null,
    })
    logger.info('[job:daily-sales-report] sent', { branches: plan.branchIds.length, ...result })

    await pingHeartbeat('NIGHTLY_SALES')
    return Response.json({ success: true, branches: plan.branchIds.length, ...result })
  } catch (error) {
    logger.error('[job:daily-sales-report] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
