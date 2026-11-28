import { istToday } from '@rgss/business'
import { developerEmail } from './auth'
import type { InvoiceEnv } from './env'

export interface CashCloseAmounts {
  openingPaise: number
  otherReceiptsPaise: number
  refundsPaise: number
  payoutsPaise: number
  depositsPaise: number
  countedPaise: number
}

export interface CashCloseDraft {
  id: string
  revision: number
  branchId: string
  day: string
  observedAt: string
  serviceCashPaise: number
  amounts: CashCloseAmounts
  expectedPaise: number
  variancePaise: number
  note: string
  recordedBy: string
  createdAt: string
  approval: { approvedBy: string; approvedAt: string; note: string } | null
}

type DraftRow = Omit<CashCloseDraft, 'amounts' | 'observedAt' | 'createdAt' | 'approval'> &
  CashCloseAmounts & {
    observedAt: number
    createdAt: number
    approvedAt: number | null
    approvedBy: string | null
    approvalNote: string | null
  }

type SaveStatus =
  | 'saved'
  | 'replay'
  | 'stale'
  | 'forbidden'
  | 'conflict'
  | 'note-required'
  | 'invalid-amounts'

type ApprovalStatus =
  | 'approved'
  | 'replay'
  | 'forbidden'
  | 'missing'
  | 'stale'
  | 'conflict'
  | 'note-required'

const branchGrant = `SELECT 1 FROM invoice_effective_grant WHERE email = ?1 AND branch_id = ?2`
const canEdit = `EXISTS (${branchGrant} AND role IN ('owner', 'manager'))`
const isBranchOwner = `EXISTS (${branchGrant} AND role = 'owner')`
const sameDay = 'source = ?4 AND branch_id = ?2 AND day = ?3'
const snapshotScope = `snapshot.source = ?4 AND snapshot.branch_id = ?2
  AND snapshot.month = substr(?3, 1, 7)`
const snapshotCash = `COALESCE((
  SELECT json_extract(receipt.value, '$.totalPaise') FROM json_each(snapshot.body, '$.rows') AS receipt
  WHERE json_extract(receipt.value, '$.day') = ?3 AND json_extract(receipt.value, '$.method') = 'cash'
), 0)`
// Both approval and bank evidence validate the same draft and source in their write transaction.
export const cashCloseDraftIsCurrent = `draft.revision = (
  SELECT MAX(revision) FROM invoice_cash_close_draft WHERE ${sameDay}
) AND EXISTS (
  SELECT 1 FROM invoice_checkout_collections AS snapshot
  WHERE ${snapshotScope} AND snapshot.observed_at >= draft.observed_at
    AND ${snapshotCash} = draft.service_cash_paise
)`
const snapshotMatches = `EXISTS (
  SELECT 1 FROM invoice_checkout_collections AS snapshot
  WHERE ${snapshotScope} AND snapshot.observed_at = ?6 AND ${snapshotCash} = ?7
)`
const replay = `EXISTS (
  SELECT 1 FROM invoice_cash_close_draft
  WHERE id = ?5 AND ${sameDay} AND recorded_by = ?1
    AND observed_at = ?6 AND service_cash_paise = ?7
    AND opening_paise = ?8 AND other_receipts_paise = ?9 AND refunds_paise = ?10
    AND payouts_paise = ?11 AND deposits_paise = ?12 AND counted_paise = ?13 AND note = ?14
)`

export function cashCloseTotals(amounts: CashCloseAmounts, serviceCashPaise: number) {
  const {
    openingPaise,
    otherReceiptsPaise,
    refundsPaise,
    payoutsPaise,
    depositsPaise,
    countedPaise,
  } = amounts
  const received = openingPaise + serviceCashPaise + otherReceiptsPaise
  const removed = refundsPaise + payoutsPaise + depositsPaise
  if (
    ![
      openingPaise,
      otherReceiptsPaise,
      refundsPaise,
      payoutsPaise,
      depositsPaise,
      countedPaise,
      serviceCashPaise,
      received,
      removed,
    ].every((paise) => Number.isSafeInteger(paise) && paise >= 0) ||
    removed > received
  )
    return null
  const expectedPaise = received - removed
  return { expectedPaise, variancePaise: countedPaise - expectedPaise }
}

export async function listCashCloseDrafts(
  env: InvoiceEnv,
  email: string,
  branch: string,
  day: string,
): Promise<CashCloseDraft[]> {
  if (email === developerEmail(env)) return []
  const { results } = await env.DB.prepare(`
    SELECT id, revision, branch_id AS branchId, day, observed_at AS observedAt,
      service_cash_paise AS serviceCashPaise, opening_paise AS openingPaise,
      other_receipts_paise AS otherReceiptsPaise, refunds_paise AS refundsPaise,
      payouts_paise AS payoutsPaise, deposits_paise AS depositsPaise, counted_paise AS countedPaise,
      expected_paise AS expectedPaise, variance_paise AS variancePaise, draft.note,
      recorded_by AS recordedBy, created_at AS createdAt,
      approval.approved_at AS approvedAt, approval.approved_by AS approvedBy, approval.note AS approvalNote
    FROM invoice_cash_close_draft AS draft
    LEFT JOIN invoice_cash_close_approval AS approval ON approval.draft_id = draft.id
    WHERE ${sameDay}
      AND EXISTS (${branchGrant} AND role IN ('owner', 'manager', 'accountant'))
    ORDER BY revision DESC LIMIT 10
  `)
    .bind(email, branch, day, env.BILLING_SOURCE)
    .all<DraftRow>()
  return results.map(
    ({
      observedAt,
      createdAt,
      approvedAt,
      approvedBy,
      approvalNote,
      openingPaise,
      otherReceiptsPaise,
      refundsPaise,
      payoutsPaise,
      depositsPaise,
      countedPaise,
      ...draft
    }) => ({
      ...draft,
      observedAt: new Date(observedAt).toISOString(),
      createdAt: new Date(createdAt).toISOString(),
      approval:
        approvedAt !== null && approvedBy !== null && approvalNote !== null
          ? { approvedAt: new Date(approvedAt).toISOString(), approvedBy, note: approvalNote }
          : null,
      amounts: {
        openingPaise,
        otherReceiptsPaise,
        refundsPaise,
        payoutsPaise,
        depositsPaise,
        countedPaise,
      },
    }),
  )
}

export async function saveCashCloseDraft(
  env: InvoiceEnv,
  input: {
    id: string
    email: string
    branch: string
    day: string
    observedAt: string
    serviceCashPaise: number
    amounts: CashCloseAmounts
    note: string
  },
): Promise<SaveStatus> {
  const { id, email, branch, day, observedAt, serviceCashPaise, amounts } = input
  if (email === developerEmail(env)) return 'forbidden'
  const totals = cashCloseTotals(amounts, serviceCashPaise)
  if (!totals) return 'invalid-amounts'
  const observed = Date.parse(observedAt)
  const created = new Date()
  if (
    !Number.isSafeInteger(observed) ||
    day >= istToday(new Date(observed)) ||
    day >= istToday(created)
  )
    return 'stale'
  const values = [
    email,
    branch,
    day,
    env.BILLING_SOURCE,
    id,
    observed,
    serviceCashPaise,
    amounts.openingPaise,
    amounts.otherReceiptsPaise,
    amounts.refundsPaise,
    amounts.payoutsPaise,
    amounts.depositsPaise,
    amounts.countedPaise,
    input.note.trim(),
  ]
  const { expectedPaise, variancePaise } = totals
  // Write and classify in one transaction so a concurrent revision or publication cannot change the outcome.
  const [inserted, decision] = await env.DB.batch<{ status: SaveStatus }>([
    env.DB.prepare(`
        INSERT INTO invoice_cash_close_draft
          (id, source, branch_id, day, revision, observed_at, service_cash_paise, opening_paise,
            other_receipts_paise, refunds_paise, payouts_paise, deposits_paise, counted_paise,
            note, expected_paise, variance_paise, recorded_by, created_at)
        SELECT ?5, ?4, ?2, ?3, next.revision, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
          ?14, ?15, ?16, ?1, ?17
        FROM (SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM invoice_cash_close_draft WHERE ${sameDay}) AS next
        WHERE ${canEdit} AND ${snapshotMatches} AND (?14 <> '' OR (next.revision = 1 AND ?16 = 0))
        ON CONFLICT (id) DO NOTHING
      `).bind(...values, expectedPaise, variancePaise, created.getTime()),
    env.DB.prepare(`
        SELECT CASE
          WHEN NOT ${canEdit} THEN 'forbidden'
          WHEN ${replay} THEN 'replay'
          WHEN EXISTS (SELECT 1 FROM invoice_cash_close_draft WHERE id = ?5) THEN 'conflict'
          WHEN NOT ${snapshotMatches} THEN 'stale'
          ELSE 'note-required'
        END AS status
      `).bind(...values),
  ])
  if (inserted?.meta.changes === 1) return 'saved'
  const row = decision?.results[0]
  if (!row) throw new Error('Cash close draft write receipt missing')
  return row.status
}

export async function approveCashCloseDraft(
  env: InvoiceEnv,
  input: { id: string; email: string; branch: string; day: string; note: string },
): Promise<ApprovalStatus> {
  const { id, email, branch, day } = input
  if (email === developerEmail(env)) return 'forbidden'
  const note = input.note.trim()
  const values = [email, branch, day, env.BILLING_SOURCE, id, note]
  const candidate = `WITH candidate AS (
    SELECT draft.id, draft.variance_paise, approval.approved_by, approval.note,
      (${cashCloseDraftIsCurrent}) AS is_current
    FROM invoice_cash_close_draft AS draft
    LEFT JOIN invoice_cash_close_approval AS approval ON approval.draft_id = draft.id
    WHERE draft.id = ?5 AND ${sameDay} AND ${isBranchOwner}
  )`

  // Keep eligibility and the immutable receipt in one transaction with collection updates and new drafts.
  const [inserted, decision] = await env.DB.batch<{ status: ApprovalStatus }>([
    env.DB.prepare(`${candidate}
      INSERT INTO invoice_cash_close_approval (draft_id, approved_by, approved_at, note)
      SELECT id, ?1, ?7, ?6 FROM candidate
      WHERE is_current AND (variance_paise = 0 OR ?6 <> '')
      ON CONFLICT (draft_id) DO NOTHING
    `).bind(...values, Date.now()),
    env.DB.prepare(`${candidate}
      SELECT CASE WHEN NOT ${isBranchOwner} THEN 'forbidden' ELSE COALESCE((
        SELECT CASE
          WHEN approved_by = ?1 AND note = ?6 THEN 'replay'
          WHEN approved_by IS NOT NULL THEN 'conflict'
          WHEN NOT is_current THEN 'stale'
          ELSE 'note-required'
        END FROM candidate
      ), 'missing') END AS status
    `).bind(...values),
  ])
  if (inserted?.meta.changes === 1) return 'approved'
  const row = decision?.results[0]
  if (!row) throw new Error('Cash close approval write receipt missing')
  return row.status
}
