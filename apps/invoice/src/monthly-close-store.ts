import { developerEmail } from './auth'
import type { InvoiceEnv } from './env'

export const MONTHLY_CLOSE_DRAFT_LIST_LIMIT = 25

type BranchRole = 'owner' | 'manager' | 'accountant'

export interface MonthlyCloseDraft {
  id: string
  branchId: string
  month: string
  version: number
  capturedAt: number
  createdAt: number
  createdBy: string
  objectKey: string
  sha256: string
  bytes: number
}

const draftColumns = `id, branch_id AS branchId, month, version,
  captured_at AS capturedAt, created_at AS createdAt, created_by AS createdBy,
  object_key AS objectKey, sha256, bytes`

const actorBranchGrant = `FROM invoice_effective_grant WHERE email = ?1 AND branch_id = ?2`
const canRead = `EXISTS (SELECT 1 ${actorBranchGrant} AND role IN ('owner', 'manager', 'accountant'))`
const canCreate = `EXISTS (SELECT 1 ${actorBranchGrant} AND role = 'owner')`

export async function monthlyCloseBranchRole(
  env: InvoiceEnv,
  email: string,
  branchId: string,
): Promise<BranchRole | null> {
  if (email === developerEmail(env)) return null
  const grant = await env.DB.prepare(
    `SELECT role ${actorBranchGrant} AND role IN ('owner', 'manager', 'accountant')`,
  )
    .bind(email, branchId)
    .first<{ role: BranchRole }>()
  return grant?.role ?? null
}

export async function listMonthlyCloseDrafts(
  env: InvoiceEnv,
  email: string,
  branchId: string,
  month: string,
): Promise<MonthlyCloseDraft[]> {
  if (email === developerEmail(env)) return []
  const { results } = await env.DB.prepare(`
    SELECT ${draftColumns} FROM invoice_monthly_close_draft
    WHERE branch_id = ?2 AND month = ?3 AND ${canRead}
    ORDER BY version DESC LIMIT ?4
  `)
    .bind(email, branchId, month, MONTHLY_CLOSE_DRAFT_LIST_LIMIT)
    .all<MonthlyCloseDraft>()
  return results
}

export async function readMonthlyCloseDraft(
  env: InvoiceEnv,
  email: string,
  branchId: string,
  id: string,
): Promise<MonthlyCloseDraft | null> {
  if (email === developerEmail(env)) return null
  return env.DB.prepare(`
    SELECT ${draftColumns} FROM invoice_monthly_close_draft
    WHERE branch_id = ?2 AND id = ?3 AND ${canRead}
  `)
    .bind(email, branchId, id)
    .first<MonthlyCloseDraft>()
}

export async function recordMonthlyCloseDraft(
  env: InvoiceEnv,
  {
    id,
    branchId,
    month,
    capturedAt,
    createdAt,
    createdBy,
    objectKey,
    sha256,
    bytes,
  }: Omit<MonthlyCloseDraft, 'version'>,
): Promise<MonthlyCloseDraft | null> {
  if (createdBy === developerEmail(env)) return null
  const draft = await env.DB.prepare(`
    INSERT INTO invoice_monthly_close_draft
      (id, branch_id, month, version, captured_at, created_at, created_by, object_key, sha256, bytes)
    SELECT ?4, ?2, ?3,
      (SELECT COALESCE(MAX(version), 0) + 1 FROM invoice_monthly_close_draft WHERE branch_id = ?2 AND month = ?3),
      ?5, ?6, ?1, ?7, ?8, ?9
    WHERE ${canCreate}
    ON CONFLICT DO NOTHING
    RETURNING ${draftColumns}
  `)
    .bind(createdBy, branchId, month, id, capturedAt, createdAt, objectKey, sha256, bytes)
    .first<MonthlyCloseDraft>()
  if (draft) return draft

  return env.DB.prepare(`
    SELECT ${draftColumns} FROM invoice_monthly_close_draft
    WHERE created_by = ?1 AND branch_id = ?2 AND month = ?3 AND id = ?4
      AND object_key = ?5 AND sha256 = ?6 AND bytes = ?7 AND ${canCreate}
  `)
    .bind(createdBy, branchId, month, id, objectKey, sha256, bytes)
    .first<MonthlyCloseDraft>()
}

export async function auditMonthlyCloseDownload(
  env: InvoiceEnv,
  email: string,
  draft: MonthlyCloseDraft,
  file: string,
): Promise<boolean> {
  if (email === developerEmail(env)) return false
  const write = await env.DB.prepare(`
    INSERT INTO invoice_monthly_close_download (id, draft_id, actor_email, file, downloaded_at)
    SELECT ?4, id, ?1, ?5, ?6 FROM invoice_monthly_close_draft
    WHERE branch_id = ?2 AND id = ?3 AND sha256 = ?7 AND ${canRead}
  `)
    .bind(email, draft.branchId, draft.id, crypto.randomUUID(), file, Date.now(), draft.sha256)
    .run()
  return write.meta.changes === 1
}
