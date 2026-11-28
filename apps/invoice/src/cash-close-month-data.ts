import { istToday } from '@rgss/business'
import { developerEmail } from './auth'
import { decodeCollectionsSnapshot } from './collections-snapshot'
import type { InvoiceEnv } from './env'

export interface CashCloseMonthRow {
  day: string
  serviceCashPaise: number | null
  revision: number | null
  approved: boolean
  draftServiceCashPaise: number | null
  sourceCurrent: boolean
  expectedPaise: number | null
  countedPaise: number | null
  variancePaise: number | null
  depositsPaise: number | null
  bankCreditPaise: number | null
  bankCreditRevision: number | null
}

type ScopedCollection = { observed_at: number | null; body: string | null }
type LatestDraft = {
  day: string
  revision: number
  approved: number
  observed_at: number
  service_cash_paise: number
  expected_paise: number
  counted_paise: number
  variance_paise: number
  deposits_paise: number
  bank_credit_paise: number | null
  bank_credit_revision: number | null
}

const branchGrant = `SELECT 1 FROM invoice_effective_grant
  WHERE email = ?3 AND branch_id = ?2 AND role IN ('owner', 'manager', 'accountant')`

export async function readCashCloseMonth(
  env: InvoiceEnv,
  email: string,
  branch: string,
  month: string,
  lastClosedDay: string,
): Promise<{ sourceObservedAt: string | null; rows: CashCloseMonthRow[] } | null> {
  if (email === developerEmail(env)) return null
  const values = [env.BILLING_SOURCE, branch, email, month]
  const [collection, drafts] = await env.DB.batch<ScopedCollection | LatestDraft>([
    env.DB.prepare(`
      SELECT snapshot.observed_at, snapshot.body
      FROM (${branchGrant} LIMIT 1) AS grant_row
      LEFT JOIN invoice_checkout_collections AS snapshot
        ON snapshot.source = ?1 AND snapshot.branch_id = ?2 AND snapshot.month = ?4
    `).bind(...values),
    env.DB.prepare(`
      WITH latest AS (
        SELECT day, MAX(revision) AS revision
        FROM invoice_cash_close_draft
        WHERE source = ?1 AND branch_id = ?2 AND day BETWEEN ?4 || '-01' AND MIN(?4 || '-31', ?5)
          AND EXISTS (${branchGrant})
        GROUP BY day
      )
      SELECT draft.day, draft.revision, draft.observed_at, draft.service_cash_paise,
        draft.expected_paise, draft.counted_paise, draft.variance_paise, draft.deposits_paise,
        approval.draft_id IS NOT NULL AS approved,
        CASE WHEN linked.id IS NOT NULL THEN evidence.amount_paise END AS bank_credit_paise,
        linked.revision AS bank_credit_revision
      FROM latest
      JOIN invoice_cash_close_draft AS draft
        ON draft.source = ?1 AND draft.branch_id = ?2 AND draft.day = latest.day AND draft.revision = latest.revision
      LEFT JOIN invoice_cash_close_approval AS approval ON approval.draft_id = draft.id
      LEFT JOIN invoice_cash_deposit_evidence AS evidence
        ON evidence.source = ?1 AND evidence.branch_id = ?2 AND evidence.day = draft.day AND evidence.voided_at IS NULL
      LEFT JOIN invoice_cash_close_draft AS linked
        ON linked.id = evidence.draft_id AND linked.source = ?1 AND linked.branch_id = ?2 AND linked.day = draft.day
    `).bind(...values, lastClosedDay),
  ])
  if (!collection || !drafts) throw new Error('Cash close month read did not complete')
  const stored = collection.results[0]
  if (!stored) return null
  if (!('body' in stored)) throw new Error('Cash close collections result is invalid')
  const observed = stored.observed_at
  const snapshot =
    stored.body !== null && observed !== null
      ? decodeCollectionsSnapshot(
          { body: stored.body, observed_at: observed },
          env.BILLING_SOURCE,
          branch,
          month,
        )
      : null

  const cashByDay = new Map<string, number>()
  for (const row of snapshot?.rows ?? []) {
    if (row.method === 'cash' && row.day <= lastClosedDay) cashByDay.set(row.day, row.totalPaise)
  }
  const draftsByDay = new Map<string, LatestDraft>()
  for (const row of drafts.results) {
    if (!('day' in row)) throw new Error('Cash close draft result is invalid')
    draftsByDay.set(row.day, row)
  }

  const observedDay = snapshot ? istToday(new Date(snapshot.observedAt)) : null
  const days = [...new Set([...cashByDay.keys(), ...draftsByDay.keys()])].sort()
  return {
    sourceObservedAt: snapshot?.observedAt ?? null,
    rows: days.map((day) => {
      const draft = draftsByDay.get(day)
      const serviceCashPaise = observedDay && observedDay > day ? (cashByDay.get(day) ?? 0) : null
      return {
        day,
        serviceCashPaise,
        revision: draft?.revision ?? null,
        approved: Boolean(draft?.approved),
        draftServiceCashPaise: draft?.service_cash_paise ?? null,
        sourceCurrent: Boolean(
          draft &&
            observed !== null &&
            observed >= draft.observed_at &&
            serviceCashPaise === draft.service_cash_paise,
        ),
        expectedPaise: draft?.expected_paise ?? null,
        countedPaise: draft?.counted_paise ?? null,
        variancePaise: draft?.variance_paise ?? null,
        depositsPaise: draft?.deposits_paise ?? null,
        bankCreditPaise: draft?.bank_credit_paise ?? null,
        bankCreditRevision: draft?.bank_credit_revision ?? null,
      }
    }),
  }
}
