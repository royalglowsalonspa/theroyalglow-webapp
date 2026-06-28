/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : POST /api/jobs/daily-sales-report
 * Scope        : API — Background Jobs
 *
 * Description  : QStash-scheduled job (10:30 PM IST daily) that generates the
 *                daily sales report and posts it to Slack + emails recipients.
 *
 * Responsibilities :
 * - Query today's paid invoices and booking metrics
 * - Format plain-text sales report
 * - Post to Slack and email to configured recipients
 *
 * Features / Functionality :
 * - Daily revenue, booking count, and service breakdown
 * - Slack webhook integration (guarded no-op without key)
 * - Email delivery to owner/manager (guarded no-op without key)
 *
 * Tech Stack   : Next.js 16 (Route Handler)
 * Layer        : API (Thin Orchestrator)
 *
 * Dependencies : @/lib/jobs/heartbeat, @/lib/jobs/verify, @/lib/notifications/providers/email,
 *                @/lib/reports/slack, @rgss/business, @rgss/db/queries, @rgss/logger
 *
 * Notes        :
 * - Gracefully no-ops Slack/email when provider keys are absent.
 * - Report covers today (IST), not yesterday.
 ************************************************************/

import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { sendEmail } from '@/lib/notifications/providers/email'
import { postToSlack } from '@/lib/reports/slack'
import { formatDailyReport, istToday } from '@rgss/business'
import { getDailyReportData } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

// Job 13 — Daily Sales Report (QStash scheduled, `0 17 * * *` UTC = 10:30 PM
// IST). Queries the day's PAID invoices + bookings, formats the plain-text
// report (background-jobs.md format), posts it to Slack, and emails it to the
// owner/manager/developer recipients. Both sends are guarded extension points:
// with no SLACK_WEBHOOK_URL / RESEND_API_KEY / DAILY_REPORT_EMAIL_RECIPIENTS
// configured they no-op + log, so the route still runs its DB read, pings its
// heartbeat, and returns 200.
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

// The plain-text report is embedded in a <pre> block for the HTML email, so
// any HTML-special characters in service names etc. must be escaped.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Parse DAILY_REPORT_EMAIL_RECIPIENTS (comma-separated) read straight from
// process.env (guarded, optional) into a clean list of addresses.
function reportRecipients(): string[] {
  const raw = process.env.DAILY_REPORT_EMAIL_RECIPIENTS
  if (!raw) {
    return []
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

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
    // that is just finishing, so the relevant figures are TODAY's in IST —
    // istToday() — not yesterday's.
    const dateISO = istToday()
    const data = await getDailyReportData(dateISO)
    const text = formatDailyReport(data)

    // Slack (guarded no-op without SLACK_WEBHOOK_URL).
    await postToSlack(text)

    // Email to the configured report recipients (guarded no-op without
    // RESEND_API_KEY or with no recipients configured).
    const recipients = reportRecipients()
    if (recipients.length > 0) {
      await sendEmail({
        to: recipients,
        subject: 'Royal Glow — Daily Sales Report',
        html: `<pre>${escapeHtml(text)}</pre>`,
      })
    }

    await pingHeartbeat('NIGHTLY_SALES')
    return Response.json({ success: true })
  } catch (error) {
    logger.error('[job:daily-sales-report] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
