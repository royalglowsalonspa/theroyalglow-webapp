/************************************************************
 * Module Name  : reports/deliver (admin)
 * Scope        : Reports — sending branch sales reports (multi-branch R7.4)
 *
 * Description  : Sends the daily and weekly sales reports. Each branch's
 *                Owner and Manager get their branches' reports, one email per
 *                person (planReportDeliveries in @rgss/business). Only the
 *                Developer gets the summary across branches, by email and on
 *                Slack.
 *
 * Responsibilities :
 * - deliverBranchReports({ kind, plan, branchNames, reportText, summary, developerEmail })
 *
 * Notes        : Every send is best-effort and never throws, so a job that
 *                started sending never answers 500 and QStash never resends
 *                reports that already went out. SLACK_WEBHOOK_URL must post to
 *                a channel only the Developer reads: it carries every
 *                branch's figures.
 ************************************************************/

import { type ReportPlan, reportSubject } from '@rgss/business'
import { escapeHtml } from '@/lib/notifications/html'
import { sendEmail } from '@/lib/notifications/providers/email'
import { postToSlack } from './slack'

export type ReportDeliveryResult = {
  /** Owner and Manager emails accepted by the provider. */
  emailed: number
  /** Owner and Manager emails planned. */
  planned: number
  slack: boolean
  developer: boolean
}

function asHtml(texts: readonly string[]): string {
  return texts.map((text) => `<pre>${escapeHtml(text)}</pre>`).join('<hr>')
}

export async function deliverBranchReports(params: {
  kind: 'Daily' | 'Weekly'
  plan: ReportPlan
  /** Branch name by branch id. */
  branchNames: ReadonlyMap<string, string>
  /** Each reported branch's text, by branch id. */
  reportText: ReadonlyMap<string, string>
  /** The summary across branches. */
  summary: string
  developerEmail: string | null
}): Promise<ReportDeliveryResult> {
  let emailed = 0
  for (const delivery of params.plan.deliveries) {
    const texts = delivery.branchIds.flatMap((id) => {
      const text = params.reportText.get(id)
      return text === undefined ? [] : [text]
    })
    if (texts.length === 0) {
      continue
    }
    const names = delivery.branchIds.map((id) => params.branchNames.get(id) ?? id)
    const ok = await sendEmail({
      to: delivery.to.email,
      subject: reportSubject(params.kind, names),
      html: asHtml(texts),
    })
    if (ok) {
      emailed += 1
    }
  }

  const slack = await postToSlack(params.summary)
  const developer = params.developerEmail
    ? await sendEmail({
        to: params.developerEmail,
        subject: `Royal Glow — ${params.kind} Summary, All Branches`,
        html: asHtml([params.summary]),
      })
    : false

  return { emailed, planned: params.plan.deliveries.length, slack, developer }
}
