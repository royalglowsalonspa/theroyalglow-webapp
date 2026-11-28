import { developerEmail } from './auth'
import type { InvoiceEnv } from './env'
import type { MonthlyCloseDraft } from './monthly-close-store'

export const MONTHLY_CLOSE_REVIEW_LIST_LIMIT = 25

export type MonthlyCloseReviewOutcome = 'reviewed' | 'changes_requested'

export type MonthlyCloseReview = {
  id: string
  draftId: string
  sha256: string
  actor: string
  outcome: MonthlyCloseReviewOutcome
  note: string
  recordedAt: number
}

const columns = `id, draft_id AS draftId, sha256, actor_email AS actor, outcome, note,
  recorded_at AS recordedAt`

const draftGrant = `SELECT 1 FROM invoice_monthly_close_draft d
  JOIN invoice_effective_grant g ON g.branch_id = d.branch_id AND g.email = ?1
  WHERE d.branch_id = ?2 AND d.id = ?3 AND d.sha256 = ?4`

export async function listMonthlyCloseReviews(
  env: InvoiceEnv,
  email: string,
  draft: MonthlyCloseDraft,
): Promise<MonthlyCloseReview[]> {
  if (email === developerEmail(env)) return []
  const { results } = await env.DB.prepare(`
    SELECT ${columns} FROM invoice_monthly_close_review
    WHERE draft_id = ?3 AND sha256 = ?4
      AND EXISTS (${draftGrant} AND g.role IN ('owner', 'manager', 'accountant'))
    ORDER BY recorded_at DESC, id DESC LIMIT ?5
  `)
    .bind(email, draft.branchId, draft.id, draft.sha256, MONTHLY_CLOSE_REVIEW_LIST_LIMIT)
    .all<MonthlyCloseReview>()
  return results
}

export async function recordMonthlyCloseReview(
  env: InvoiceEnv,
  draft: MonthlyCloseDraft,
  review: Omit<MonthlyCloseReview, 'draftId' | 'sha256'>,
): Promise<MonthlyCloseReview | null> {
  if (review.actor === developerEmail(env)) return null
  const authorized = `EXISTS (${draftGrant} AND g.role = 'owner')`
  const { actor, outcome, note, recordedAt } = review
  const id = review.id.toLowerCase()
  const recorded = await env.DB.prepare(`
    INSERT INTO invoice_monthly_close_review (id, draft_id, sha256, actor_email, outcome, note, recorded_at)
    SELECT ?5, ?3, ?4, ?1, ?6, ?7, ?8 WHERE ${authorized}
    ON CONFLICT (id) DO NOTHING
    RETURNING ${columns}
  `)
    .bind(actor, draft.branchId, draft.id, draft.sha256, id, outcome, note, recordedAt)
    .first<MonthlyCloseReview>()
  if (recorded) return recorded

  return env.DB.prepare(`
    SELECT ${columns} FROM invoice_monthly_close_review
    WHERE id = ?5 AND draft_id = ?3 AND sha256 = ?4 AND actor_email = ?1
      AND outcome = ?6 AND note = ?7 AND ${authorized}
  `)
    .bind(actor, draft.branchId, draft.id, draft.sha256, id, outcome, note)
    .first<MonthlyCloseReview>()
}
