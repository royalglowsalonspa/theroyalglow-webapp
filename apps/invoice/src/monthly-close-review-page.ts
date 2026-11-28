import { IST_TIME_ZONE } from '@rgss/business'
import { html } from 'hono/html'
import {
  MONTHLY_CLOSE_REVIEW_LIST_LIMIT,
  type MonthlyCloseReview,
} from './monthly-close-review-store'
import type { MonthlyCloseDraft } from './monthly-close-store'

const timestamp = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})

const labels = { reviewed: 'Reviewed', changes_requested: 'Changes requested' } as const

export function renderMonthlyCloseReview(
  draft: MonthlyCloseDraft,
  reviews: readonly MonthlyCloseReview[],
  canRecord: boolean,
) {
  const filters = new URLSearchParams({ branch: draft.branchId, month: draft.month })
  const path = `/portal/reports/close/${draft.branchId}/${draft.id}`
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>CA feedback · Royal Glow</title></head>
    <body><main class="dashboard">
      <nav aria-label="Invoice portal">
        <a href="/portal/reports/close?${filters}">Monthly close drafts</a>
        <a href="${path}/compare">Compare with current records</a>
        <a href="${path}/package.json">Download saved package</a>
      </nav>
      <h1>CA feedback</h1>
      <p class="close-scope">${draft.branchId} · ${draft.month} (IST) · Version ${draft.version}</p>
      <p class="dashboard-note">Branch owners record feedback received from the CA for this version. Recording feedback leaves the draft open.</p>
      ${
        canRecord
          ? html`<section aria-labelledby="record-feedback">
            <h2 id="record-feedback">Record CA feedback</h2>
            <form class="close-review-form" method="post" action="${path}/review">
              <input type="hidden" name="id" value="${crypto.randomUUID()}">
              <input type="hidden" name="sha256" value="${draft.sha256}">
              <label>Outcome
                <select name="outcome" required>
                  <option value="">Choose an outcome</option>
                  <option value="reviewed">${labels.reviewed}</option>
                  <option value="changes_requested">${labels.changes_requested}</option>
                </select>
              </label>
              <label>Feedback
                <textarea name="note" rows="4" maxlength="500" required aria-describedby="feedback-length"></textarea>
              </label>
              <p id="feedback-length" class="dashboard-note">Up to 500 characters.</p>
              <button type="submit">Record feedback</button>
            </form>
          </section>`
          : ''
      }
      <section aria-labelledby="feedback-history">
        <h2 id="feedback-history">Feedback history</h2>
        ${
          reviews.length
            ? html`${reviews.length === MONTHLY_CLOSE_REVIEW_LIST_LIMIT ? html`<p>Showing up to ${MONTHLY_CLOSE_REVIEW_LIST_LIMIT} recent entries.</p>` : ''}
                <ul class="close-review-log">${reviews.map(
                  (review) => html`<li id="feedback-${review.id}" tabindex="-1">
                    <strong>${labels[review.outcome]}</strong>
                    <p class="close-review-note">${review.note}</p>
                    <small class="dashboard-note">Recorded by ${review.actor} ·
                      <time datetime="${new Date(review.recordedAt).toISOString()}">${timestamp.format(review.recordedAt)} IST</time>
                    </small>
                  </li>`,
                )}</ul>`
            : html`<p>No CA feedback recorded for this version.</p>`
        }
      </section>
    </main></body></html>`
}
