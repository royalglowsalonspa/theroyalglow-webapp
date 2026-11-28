import { istToday } from '@rgss/business'
import { developerEmail } from './auth'
import { cashCloseDraftIsCurrent } from './cash-close-store'
import type { InvoiceEnv } from './env'

export interface CashDepositEvidence {
  id: number
  draftId: string
  draftRevision: number
  creditedOn: string
  reference: string
  amountPaise: number
  recordedBy: string
  recordedAt: string
}

export interface VoidedCashDepositEvidence extends CashDepositEvidence {
  voidedAt: string
  voidedBy: string
  voidReason: string
}

type DepositHistory = {
  active: CashDepositEvidence | null
  voided: VoidedCashDepositEvidence[]
}

type DepositRow = Omit<CashDepositEvidence, 'recordedAt'> & {
  recordedAt: number
  voidedAt: number | null
  voidedBy: string | null
  voidReason: string | null
}

type RecordStatus =
  | 'recorded'
  | 'replay'
  | 'voided-replay'
  | 'request-conflict'
  | 'forbidden'
  | 'missing'
  | 'stale'
  | 'amount-mismatch'
  | 'day-linked'
  | 'reference-used'

type VoidStatus = 'voided' | 'replay' | 'forbidden' | 'missing' | 'conflict'

const branchGrant = 'SELECT 1 FROM invoice_effective_grant WHERE email = ?1 AND branch_id = ?2'
const canRecord = `EXISTS (${branchGrant} AND role = 'owner')`
const forDay = 'evidence.source = ?4 AND evidence.branch_id = ?2 AND evidence.day = ?3'

export async function readCashDepositEvidence(
  env: InvoiceEnv,
  email: string,
  branch: string,
  day: string,
): Promise<DepositHistory> {
  const history: DepositHistory = { active: null, voided: [] }
  if (email === developerEmail(env)) return history
  const { results } = await env.DB.prepare(`
    SELECT evidence.id, evidence.draft_id AS draftId, draft.revision AS draftRevision,
      evidence.credited_on AS creditedOn, evidence.reference, evidence.amount_paise AS amountPaise,
      evidence.recorded_by AS recordedBy, evidence.recorded_at AS recordedAt,
      evidence.voided_at AS voidedAt, evidence.voided_by AS voidedBy, evidence.void_reason AS voidReason
    FROM invoice_cash_deposit_evidence AS evidence
    JOIN invoice_cash_close_draft AS draft ON draft.id = evidence.draft_id
      AND draft.source = evidence.source AND draft.branch_id = evidence.branch_id AND draft.day = evidence.day
    WHERE ${forDay} AND EXISTS (${branchGrant} AND role IN ('owner', 'manager', 'accountant'))
    ORDER BY evidence.voided_at IS NOT NULL, evidence.voided_at DESC, evidence.id DESC LIMIT 11
  `)
    .bind(email, branch, day, env.BILLING_SOURCE)
    .all<DepositRow>()
  for (const { voidedAt, voidedBy, voidReason, recordedAt, ...row } of results) {
    const evidence = { ...row, recordedAt: new Date(recordedAt).toISOString() }
    if (voidedAt === null) {
      history.active = evidence
    } else if (voidedBy !== null && voidReason !== null && history.voided.length < 10) {
      history.voided.push({
        ...evidence,
        voidedAt: new Date(voidedAt).toISOString(),
        voidedBy,
        voidReason,
      })
    }
  }
  return history
}

export async function recordCashDepositEvidence(
  env: InvoiceEnv,
  input: {
    email: string
    requestId: string
    branch: string
    day: string
    draftId: string
    creditedOn: string
    reference: string
    amountPaise: number
  },
): Promise<RecordStatus> {
  const { email, branch, day, draftId, creditedOn, amountPaise, requestId } = input
  if (email === developerEmail(env)) return 'forbidden'
  const reference = input.reference.trim().toUpperCase()
  const now = new Date()
  const values = [
    email,
    branch,
    day,
    env.BILLING_SOURCE,
    draftId,
    creditedOn,
    reference,
    amountPaise,
    requestId,
    istToday(now),
  ]
  const candidate = `WITH candidate AS (
    SELECT draft.id, draft.deposits_paise,
      (approval.draft_id IS NOT NULL AND (${cashCloseDraftIsCurrent})) AS is_current
    FROM invoice_cash_close_draft AS draft
    LEFT JOIN invoice_cash_close_approval AS approval ON approval.draft_id = draft.id
    WHERE draft.id = ?5 AND draft.source = ?4 AND draft.branch_id = ?2 AND draft.day = ?3 AND ${canRecord}
  )`

  // Eligibility and deduplication must share a transaction with publication and revision writes.
  const [inserted, decision] = await env.DB.batch<{ status: RecordStatus }>([
    env.DB.prepare(`${candidate}
      INSERT INTO invoice_cash_deposit_evidence
        (source, branch_id, day, draft_id, credited_on, reference, amount_paise, request_id, recorded_by, recorded_at)
      SELECT ?4, ?2, ?3, id, ?6, ?7, ?8, ?9, ?1, ?11 FROM candidate
      WHERE is_current AND deposits_paise > 0 AND deposits_paise = ?8
        AND date(?6, '+0 days') IS ?6 AND ?6 BETWEEN ?3 AND ?10
      ON CONFLICT DO NOTHING
    `).bind(...values, now.getTime()),
    env.DB.prepare(`${candidate}
      SELECT CASE
        WHEN NOT ${canRecord} THEN 'forbidden'
        WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'missing'
        ELSE COALESCE((
          SELECT CASE WHEN voided_at IS NULL THEN 'replay' ELSE 'voided-replay' END
          FROM invoice_cash_deposit_evidence AS evidence WHERE ${forDay} AND request_id = ?9
            AND draft_id = ?5 AND recorded_by = ?1 AND credited_on = ?6 AND reference = ?7 AND amount_paise = ?8
        ), (
          SELECT CASE
            WHEN EXISTS (SELECT 1 FROM invoice_cash_deposit_evidence WHERE request_id = ?9) THEN 'request-conflict'
            WHEN EXISTS (SELECT 1 FROM invoice_cash_deposit_evidence AS evidence WHERE ${forDay}
              AND voided_at IS NULL) THEN 'day-linked'
            WHEN NOT is_current OR date(?6, '+0 days') IS NOT ?6 OR ?6 NOT BETWEEN ?3 AND ?10 THEN 'stale'
            WHEN deposits_paise = 0 OR deposits_paise <> ?8 THEN 'amount-mismatch'
            ELSE 'reference-used'
          END FROM candidate
        )) END AS status
    `).bind(...values),
  ])
  if (inserted?.meta.changes === 1) return 'recorded'
  const row = decision?.results[0]
  if (!row) throw new Error('Cash deposit evidence write receipt missing')
  return row.status
}

export async function voidCashDepositEvidence(
  env: InvoiceEnv,
  input: { email: string; branch: string; day: string; id: number; reason: string },
): Promise<VoidStatus> {
  const { email, branch, day, id } = input
  if (email === developerEmail(env)) return 'forbidden'
  const values = [email, branch, day, env.BILLING_SOURCE, id, input.reason.trim()]
  const evidenceScope = `${forDay} AND evidence.id = ?5`
  const [updated, decision] = await env.DB.batch<{ status: VoidStatus }>([
    env.DB.prepare(`
      UPDATE invoice_cash_deposit_evidence AS evidence
      SET voided_at = MAX(recorded_at, ?7), voided_by = ?1, void_reason = ?6
      WHERE ${evidenceScope} AND voided_at IS NULL AND ${canRecord}
    `).bind(...values, Date.now()),
    env.DB.prepare(`
      SELECT CASE WHEN NOT ${canRecord} THEN 'forbidden' ELSE COALESCE((
        SELECT CASE WHEN voided_by = ?1 AND void_reason = ?6 THEN 'replay' ELSE 'conflict' END
        FROM invoice_cash_deposit_evidence AS evidence WHERE ${evidenceScope}
      ), 'missing') END AS status
    `).bind(...values),
  ])
  if (updated?.meta.changes === 1) return 'voided'
  const row = decision?.results[0]
  if (!row) throw new Error('Cash deposit correction write receipt missing')
  return row.status
}
