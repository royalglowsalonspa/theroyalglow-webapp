import { IST_TIME_ZONE, istToday, monthKeyIST } from '@rgss/business'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { html } from 'hono/html'
import { z } from 'zod'
import { invoiceId } from './contracts'
import type { PortalEnv } from './env'
import { closeDownload, closeReviewForm } from './monthly-close'
import { renderMonthlyCloseReview } from './monthly-close-review-page'
import { listMonthlyCloseReviews } from './monthly-close-review-store'
import {
  listMonthlyCloseDrafts,
  MONTHLY_CLOSE_DRAFT_LIST_LIMIT,
  monthlyCloseBranchRole,
  readMonthlyCloseDraft,
} from './monthly-close-store'

const monthKey = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/)
const selection = z.object({ month: monthKey.optional(), branch: invoiceId.optional() })
const draftId = z.uuidv4().transform((id) => id.toLowerCase())
const saveForm = z.strictObject({ month: monthKey, branch: invoiceId, id: draftId })
const draftParams = z.object({ branch: invoiceId, id: draftId })
const comparePage = z
  .string()
  .regex(/^[1-9]\d{0,2}$/)
  .transform(Number)
  .optional()
const timestamp = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})

export const monthlyCloseRoutes = new Hono<PortalEnv>()

export function monthlyCloseLink(month: string, branch?: string) {
  const query = new URLSearchParams({
    month: month < istToday().slice(0, 7) ? month : monthKeyIST(),
  })
  if (branch) query.set('branch', branch)
  return `/portal/reports/close?${query}`
}

monthlyCloseRoutes.get('/', async (c) => {
  const filters = selection.safeParse({
    month: c.req.query('month'),
    branch: c.req.query('branch') || undefined,
  })
  if (!filters.success) return c.text('Choose a valid month and branch.', 400)
  const { month = monthKeyIST(), branch } = filters.data
  if (month >= istToday().slice(0, 7)) return c.text('Choose a closed IST month.', 422)
  const email = c.get('email')
  const { results: branches } = await c.env.DB.prepare(`
    SELECT branch_id, role FROM invoice_effective_grant WHERE email = ?
      AND role IN ('owner', 'manager', 'accountant') ORDER BY branch_id
  `)
    .bind(email)
    .all<{ branch_id: string; role: string }>()
  const grant = branches.find((entry) => entry.branch_id === branch)
  if (branch && !grant) return c.notFound()
  const drafts = branch ? await listMonthlyCloseDrafts(c.env, email, branch, month) : []
  const query = new URLSearchParams(branch ? { month, branch } : { month })

  return c.html(html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>Monthly close drafts · Royal Glow</title></head>
    <body><main class="dashboard">
      <nav aria-label="Invoice portal">
        <a href="/portal/home?${query}">Dashboard</a>
        <a href="/portal/reports/gst?${query}">Monthly GST review</a>
      </nav>
      <h1>Monthly close drafts</h1>
      <p class="dashboard-note">Each draft captures the branch’s invoice register, line-tax register, and GST review as they appeared when it was saved.</p>
      <form method="get" class="dashboard-filters">
        <label>Branch
          <select name="branch" required>
            <option value="">Select a branch</option>
            ${branches.map(({ branch_id }) => html`<option value="${branch_id}" ${branch_id === branch ? 'selected' : ''}>${branch_id}</option>`)}
          </select>
        </label>
        <label>Issue month (IST)
          <input name="month" type="month" required value="${month}" min="0001-01" max="${monthKeyIST()}">
        </label>
        <button type="submit">Show drafts</button>
      </form>
      ${
        branch
          ? html`<section aria-labelledby="draft-versions">
        <h2 id="draft-versions">Saved drafts</h2>
        <p class="dashboard-note">GSTIN-wide reconciliation, collections, refunds, credit notes, and filing evidence are pending.</p>
        ${
          grant?.role === 'owner'
            ? html`<form class="close-save" method="post" action="/portal/reports/close">
                <input type="hidden" name="id" value="${crypto.randomUUID()}">
                <input type="hidden" name="branch" value="${branch}">
                <input type="hidden" name="month" value="${month}">
                <button type="submit">Save new draft</button>
              </form>`
            : ''
        }
        ${
          drafts.length
            ? html`${drafts.length === MONTHLY_CLOSE_DRAFT_LIST_LIMIT ? html`<p>Showing up to ${MONTHLY_CLOSE_DRAFT_LIST_LIMIT} recent drafts.</p>` : ''}
              <ul>${drafts.map((draft) => {
                const path = `/portal/reports/close/${branch}/${draft.id}`
                return html`<li><strong>Version ${draft.version}</strong> ·
                  <time datetime="${new Date(draft.capturedAt).toISOString()}">${timestamp.format(draft.capturedAt)} IST</time>
                  <div class="close-files">
                    <a href="${path}/compare" aria-label="Compare version ${draft.version} with current records">Compare with current records</a>
                    <a href="${path}/review" aria-label="CA feedback for version ${draft.version}">CA feedback</a>
                    <a href="${path}/invoice-register.csv" aria-label="Invoice register CSV for version ${draft.version}">Invoice register (CSV)</a>
                    <a href="${path}/line-tax-register.csv" aria-label="Line-tax register CSV for version ${draft.version}">Line-tax register (CSV)</a>
                    <a href="${path}/package.json" aria-label="Full package JSON for version ${draft.version}">Full package (JSON)</a>
                  </div></li>`
              })}</ul>`
            : html`<p>No drafts saved for this branch and month.</p>`
        }
      </section>`
          : html`<p>Select one branch to see its saved drafts.</p>`
      }
    </main></body></html>`)
})

monthlyCloseRoutes.post(
  '/',
  bodyLimit({ maxSize: 1024, onError: (c) => c.text('Form too large.', 413) }),
  async (c): Promise<Response> => {
    if (c.req.header('origin') !== new URL(c.req.url).origin)
      return c.text('Same-origin form required.', 403)
    if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
      return c.text('Expected a draft form.', 415)
    const form = saveForm.safeParse(await c.req.parseBody({ all: true }))
    if (!form.success) return c.text('Check the branch, month, and draft identifier.', 400)
    const email = c.get('email')
    const { branch, month, id } = form.data
    return c.env.REGISTER.getByName(email).saveMonthlyClose(email, branch, month, id)
  },
)

monthlyCloseRoutes.get('/:branch/:id/compare', async (c): Promise<Response> => {
  const params = draftParams.safeParse(c.req.param())
  if (!params.success) return c.notFound()
  const page = comparePage.safeParse(c.req.query('page'))
  if (!page.success) return c.text('Choose a valid comparison page.', 400)
  const email = c.get('email')
  return c.env.REGISTER.getByName(email).compareMonthlyClose(
    email,
    params.data.branch,
    params.data.id,
    page.data ?? 1,
  )
})

monthlyCloseRoutes.get('/:branch/:id/review', async (c): Promise<Response> => {
  const params = draftParams.safeParse(c.req.param())
  if (!params.success) return c.notFound()
  const { branch, id } = params.data
  const email = c.get('email')
  const draft = await readMonthlyCloseDraft(c.env, email, branch, id)
  if (!draft) return c.notFound()
  const reviews = await listMonthlyCloseReviews(c.env, email, draft)
  const role = await monthlyCloseBranchRole(c.env, email, branch)
  if (!role) return c.notFound()
  return c.html(renderMonthlyCloseReview(draft, reviews, role === 'owner'))
})

monthlyCloseRoutes.post(
  '/:branch/:id/review',
  bodyLimit({ maxSize: 6144, onError: (c) => c.text('Feedback form is too large.', 413) }),
  async (c): Promise<Response> => {
    const params = draftParams.safeParse(c.req.param())
    if (!params.success) return c.notFound()
    if (c.req.header('origin') !== new URL(c.req.url).origin)
      return c.text('Same-origin form required.', 403)
    if (c.req.header('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded')
      return c.text('Expected a feedback form.', 415)
    const form = closeReviewForm.safeParse(await c.req.parseBody({ all: true }))
    if (!form.success)
      return c.text('Choose an outcome and enter feedback of up to 500 characters.', 400)
    const email = c.get('email')
    return c.env.REGISTER.getByName(email).addMonthlyCloseReview(
      email,
      params.data.branch,
      params.data.id,
      form.data,
    )
  },
)

monthlyCloseRoutes.get('/:branch/:id/:file', async (c): Promise<Response> => {
  const params = draftParams.extend({ file: closeDownload }).safeParse(c.req.param())
  if (!params.success) return c.notFound()
  const email = c.get('email')
  const { branch, id, file } = params.data
  return c.env.REGISTER.getByName(email).downloadMonthlyClose(email, branch, id, file)
})
