import { pingHeartbeat } from '@/lib/jobs/heartbeat'
import { verifyQStashSignature } from '@/lib/jobs/verify'
import { sendEmail } from '@/lib/notifications/providers/email'
import { postToSlack } from '@/lib/reports/slack'
import { formatWeeklyReport, istDateInDays, istToday } from '@rgss/business'
import { getWeeklyReportData } from '@rgss/db/queries'
import { createLogger } from '@rgss/logger'

// Job 14 — Weekly Summary Report (QStash scheduled, `30 3 * * 1` UTC = Monday
// 9:00 AM IST). Same shape as the daily report but over the last 7 days, plus a
// week-over-week comparison against the previous 7 days. Posts to Slack and
// emails the owner/manager/developer recipients. Both sends are guarded
// extension points that no-op + log without keys, so the route still runs its
// DB reads, pings its heartbeat, and returns 200.
//
// Route shape: NOT withErrorHandler. Read the raw body once, verify the QStash
// signature (401 on failure → no work), do the work inside try/catch (500 on
// failure so QStash retries), then ping the heartbeat and return a minimal
// job-response shape.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger({
  service: 'web:jobs:weekly-report',
  environment: process.env.NODE_ENV ?? 'development',
})

// The plain-text report is embedded in a <pre> block for the HTML email, so
// any HTML-special characters must be escaped.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Parse DAILY_REPORT_EMAIL_RECIPIENTS (comma-separated) read straight from
// process.env (guarded, optional) into a clean list of addresses. The weekly
// report shares the same recipient list as the daily report.
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
  const bodyText = await req.text()
  const verified = await verifyQStashSignature(req, bodyText)
  if (!verified) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const now = new Date()
    // This week = the last 7 IST calendar days ending today (inclusive):
    // start = today - 6 days, end = today.
    const thisStart = istDateInDays(now, -6)
    const thisEnd = istToday(now)
    // Previous week = the 7 IST calendar days immediately before this week:
    // start = today - 13 days, end = today - 7 days.
    const prevStart = istDateInDays(now, -13)
    const prevEnd = istDateInDays(now, -7)

    const data = await getWeeklyReportData(thisStart, thisEnd)
    const previous = await getWeeklyReportData(prevStart, prevEnd)
    const text = formatWeeklyReport(data, previous)

    // Slack (guarded no-op without SLACK_WEBHOOK_URL).
    await postToSlack(text)

    // Email to the configured report recipients (guarded no-op without
    // RESEND_API_KEY or with no recipients configured).
    const recipients = reportRecipients()
    if (recipients.length > 0) {
      await sendEmail({
        to: recipients,
        subject: 'Royal Glow — Weekly Sales Report',
        html: `<pre>${escapeHtml(text)}</pre>`,
      })
    }

    await pingHeartbeat('NIGHTLY_SALES')
    return Response.json({ success: true })
  } catch (error) {
    logger.error('[job:weekly-report] failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response('Job failed', { status: 500 })
  }
}
