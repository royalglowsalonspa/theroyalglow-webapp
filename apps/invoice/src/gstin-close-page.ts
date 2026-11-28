import { formatINR, IST_TIME_ZONE, istToday, monthKeyIST } from '@rgss/business'
import { gstinSchema } from '@rgss/types'
import { Hono } from 'hono'
import { html } from 'hono/html'
import { z } from 'zod'
import { invoiceId } from './contracts'
import type { InvoiceEnv, PortalEnv } from './env'
import type { readMonthlyCloseGstinEvidence } from './monthly-close'
import type { MonthlyCloseReviewOutcome } from './monthly-close-review-store'

const pageSize = 6
const selection = z.object({
  month: z
    .string()
    .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  gstin: gstinSchema.optional(),
  after: invoiceId.optional(),
})
const clock = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})

type Scope = {
  branchId: string
  id: string | null
  version: number | null
  capturedAt: number | null
  outcome: MonthlyCloseReviewOutcome | null
}
type Evidence = Awaited<ReturnType<typeof readMonthlyCloseGstinEvidence>>

async function readScopes(env: InvoiceEnv, email: string, month: string, after: string) {
  const { results } = await env.DB.prepare(`
    SELECT g.branch_id AS branchId, d.id, d.version, d.captured_at AS capturedAt,
      (SELECT r.outcome FROM invoice_monthly_close_review r
        WHERE r.draft_id = d.id AND r.sha256 = d.sha256
        ORDER BY r.recorded_at DESC, r.id DESC LIMIT 1) AS outcome
    FROM invoice_effective_grant g
    LEFT JOIN invoice_monthly_close_draft d ON d.id = (
      SELECT id FROM invoice_monthly_close_draft
      WHERE branch_id = g.branch_id AND month = ?2 ORDER BY version DESC LIMIT 1
    )
    WHERE g.email = ?1 AND g.branch_id > ?3 AND g.role IN ('owner', 'manager', 'accountant')
    ORDER BY g.branch_id LIMIT ?4
  `)
    .bind(email, month, after, pageSize + 1)
    .all<Scope>()
  return results
}

function billingStatus(evidence: NonNullable<Evidence>, capturedAt: number | null) {
  const { source } = evidence
  if (!source) return 'No billing source check'
  if (!source.saved) return 'Saved register unavailable for billing check'
  if (capturedAt === null || Date.parse(source.observed.observedAt) < capturedAt)
    return 'Billing check predates the saved draft'
  if (!source.sameIdentities) return 'Billing differs from saved draft'
  if (source.observed.publishedCount !== source.observed.invoiceCount)
    return 'Billing IDs and amounts agree. Publication incomplete.'
  return 'Billing IDs and amounts agree'
}

function draftRow(scope: Scope, evidence: Evidence, month: string) {
  const { branchId, id, version, capturedAt, outcome } = scope
  const branchQuery = new URLSearchParams({ branch: branchId, month })
  const path = `/portal/reports/close/${branchId}/${id}`
  const tax = evidence?.tax
  const totals = tax?.totals

  return html`<tr>
    <th scope="row">${branchId}
      ${id ? html`<small><a href="${path}/compare">Compare version ${version}</a></small>` : html`<small><a href="/portal/reports/close?${branchQuery}">View branch drafts</a></small>`}
      ${capturedAt === null ? '' : html`<small><time datetime="${new Date(capturedAt).toISOString()}">${clock.format(capturedAt)} IST</time></small>`}
    </th>
    <td>${!id ? 'No saved draft' : !evidence ? 'Saved draft unavailable' : billingStatus(evidence, capturedAt)}
      ${
        id
          ? html`<small><a href="${path}/review">${
              outcome === 'reviewed'
                ? 'CA feedback recorded'
                : outcome === 'changes_requested'
                  ? 'CA changes requested'
                  : 'No CA feedback'
            }</a></small>`
          : ''
      }
      ${tax ? html`<small>${tax.provisionalCount} provisional · ${tax.exceptionCount} exceptions across this branch draft</small>` : ''}
    </td>
    <td>${
      totals
        ? totals.lineCount
          ? html`${formatINR(totals.gstPaise)} GST
            <small>${formatINR(totals.taxablePaise)} taxable · ${totals.lineCount} reviewed lines</small>
            <small>${formatINR(totals.cgstPaise)} CGST · ${formatINR(totals.sgstPaise)} SGST</small>`
          : 'No reviewed lines for this GSTIN'
        : tax
          ? 'Saved tax group preview is incomplete'
          : 'Unavailable'
    }</td>
  </tr>`
}

export const gstinCloseRoutes = new Hono<PortalEnv>()

gstinCloseRoutes.get('/', async (c) => {
  const parsed = selection.safeParse({
    month: c.req.query('month'),
    gstin: c.req.query('gstin'),
    after: c.req.query('after'),
  })
  if (!parsed.success)
    return c.text(
      'Choose a valid month and enter a 15-character GSTIN with a valid check character.',
      400,
    )
  const { month = monthKeyIST(), gstin, after = '' } = parsed.data
  if (month >= istToday().slice(0, 7)) return c.text('Choose a closed IST month.', 422)

  const email = c.get('email')
  const scopes = gstin ? await readScopes(c.env, email, month, after) : []
  const rows: { scope: Scope; evidence: Evidence }[] = []
  if (gstin) {
    const register = c.env.REGISTER.getByName(email)
    for (const scope of scopes.slice(0, pageSize)) {
      rows.push({
        scope,
        evidence: scope.id
          ? await register.readMonthlyCloseGstinEvidence(email, scope.branchId, scope.id, gstin)
          : null,
      })
    }
    const latest = await readScopes(c.env, email, month, after)
    if (
      scopes.length !== latest.length ||
      scopes.some((scope, index) => {
        const current = latest[index]
        return (
          scope.branchId !== current?.branchId ||
          scope.id !== current.id ||
          scope.outcome !== current.outcome
        )
      })
    )
      return c.text('Branch access or close records changed. Reopen the review.', 409)
  }

  const period = new URLSearchParams({ month })
  const firstPage = new URLSearchParams({ month, gstin: gstin ?? '' })
  const cursor = rows.at(-1)?.scope.branchId
  const nextPage = new URLSearchParams(firstPage)
  if (cursor) nextPage.set('after', cursor)

  return c.html(html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>GSTIN close coverage · Royal Glow</title></head>
    <body><main class="dashboard">
      <nav aria-label="Invoice portal">
        <a href="/portal/home?${period}">Dashboard</a>
        <a href="/portal/reports/close?${period}">Monthly close drafts</a>
      </nav>
      <h1>GSTIN close coverage</h1>
      <form method="get" class="dashboard-filters">
        <label>GSTIN <input name="gstin" value="${gstin ?? ''}" minlength="15" maxlength="15" spellcheck="false" autocapitalize="characters" required></label>
        <label>Issue month (IST) <input name="month" type="month" value="${month}" min="0001-01" max="${monthKeyIST()}" required></label>
        <button type="submit">Review coverage</button>
      </form>
      ${
        gstin
          ? html`<section aria-labelledby="branch-coverage">
        <h2 id="branch-coverage">Registration coverage unverified</h2>
        <p class="dashboard-note">This review shows the latest saved draft for each branch you can access. Period-specific branch registration records are needed to verify which branches belong in a registration-wide close.</p>
        ${
          rows.length
            ? html`<div class="gst-review-table">
          <table aria-label="Monthly GSTIN coverage by branch">
            <thead><tr><th scope="col">Branch draft</th><th scope="col">Coverage checks</th><th scope="col">Reviewed taxes</th></tr></thead>
            <tbody>${rows.map(({ scope, evidence }) => draftRow(scope, evidence, month))}</tbody>
          </table>
        </div>`
            : html`<p>No assigned branches on this page.</p>`
        }
        ${
          after || scopes.length > pageSize
            ? html`<nav class="close-pages" aria-label="Coverage pages">
          ${after ? html`<a href="?${firstPage}">First branches</a>` : ''}
          ${scopes.length > pageSize ? html`<a href="?${nextPage}" rel="next">Next branches</a>` : ''}
        </nav>`
            : ''
        }
      </section>`
          : ''
      }
    </main></body></html>`)
})
