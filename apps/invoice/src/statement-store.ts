import { snapshotHash } from './contracts'
import type { InvoiceEnv } from './env'
import type { StatementEntry } from './statement-csv'

type ImportReceipt = {
  id: string
  account: string
  digest: string
  rowCount: number
  importedBy: string
  importedAt: number
}

const receiptColumns = `id, account, digest, row_count AS rowCount,
  imported_by AS importedBy, imported_at AS importedAt`
const branchGrant = 'SELECT 1 FROM invoice_effective_grant WHERE email = ?1 AND branch_id = ?2'
const canRead = `EXISTS (${branchGrant} AND role IN ('owner', 'manager', 'accountant'))`
const canImport = `EXISTS (${branchGrant} AND role IN ('owner', 'manager'))`

export function statementDigest(branch: string, account: string, entries: StatementEntry[]) {
  const rows = entries.slice().sort((a, b) => (a.reference < b.reference ? -1 : 1))
  return snapshotHash(JSON.stringify([branch, account, rows]))
}

export async function readStatementHistory(
  env: InvoiceEnv,
  email: string,
  branch: string,
  before: string | undefined,
) {
  const { results } = await env.DB.prepare(`
    SELECT ${receiptColumns} FROM invoice_statement_import
    WHERE branch_id = ?2 AND ${canRead}
      AND (?3 IS NULL OR (imported_at, id) < (
        SELECT imported_at, id FROM invoice_statement_import WHERE branch_id = ?2 AND id = ?3
      ))
    ORDER BY imported_at DESC, id DESC LIMIT 26
  `)
    .bind(email, branch, before ?? null)
    .all<ImportReceipt>()
  const imports = results.slice(0, 25)
  return { imports, next: results.length > 25 ? imports.at(-1)?.id : undefined }
}

export async function readStatementImport(
  env: InvoiceEnv,
  email: string,
  branch: string,
  id: string,
) {
  const receipt = await env.DB.prepare(`
    SELECT ${receiptColumns} FROM invoice_statement_import
    WHERE branch_id = ?2 AND id = ?3 AND ${canRead}
  `)
    .bind(email, branch, id)
    .first<ImportReceipt>()
  if (!receipt) return null
  const { results } = await env.DB.prepare(`
    SELECT entry.posted_on AS postedOn, entry.reference, entry.direction, entry.amount_paise AS amountPaise,
      evidence.day AS cashCloseDay
    FROM invoice_statement_entry AS entry
    LEFT JOIN invoice_cash_deposit_evidence AS evidence ON evidence.source = ?4 AND evidence.voided_at IS NULL
      AND entry.direction = 'credit' AND evidence.branch_id = entry.branch_id
      AND evidence.reference = entry.reference AND evidence.credited_on = entry.posted_on
      AND evidence.amount_paise = entry.amount_paise
    WHERE entry.branch_id = ?2 AND entry.import_id = ?3 AND ${canRead}
    ORDER BY entry.posted_on, entry.reference LIMIT 100
  `)
    .bind(email, branch, id, env.BILLING_SOURCE)
    .all<StatementEntry & { cashCloseDay: string | null }>()
  return results.length === receipt.rowCount ? { receipt, entries: results } : null
}

type ImportStatus = { id: string } | { error: 'forbidden' | 'reference-used' }

export async function saveStatementImport(
  env: InvoiceEnv,
  input: {
    email: string
    branch: string
    account: string
    digest: string
    entries: StatementEntry[]
  },
): Promise<ImportStatus> {
  const { email, branch, account, digest, entries } = input
  const id = crypto.randomUUID()
  const values = [email, branch, account, id, digest, JSON.stringify(entries)]
  const receipt = 'branch_id = ?2 AND account = ?3 AND digest = ?5'
  // D1 executes the receipt, entries, and decision together or rolls the batch back.
  const [, , decision] = await env.DB.batch<{ allowed: number; id: string | null }>([
    env.DB.prepare(`
      INSERT INTO invoice_statement_import (id, branch_id, account, digest, row_count, imported_by, imported_at)
      SELECT ?4, ?2, ?3, ?5, ?7, ?1, ?8 WHERE ${canImport}
        AND NOT EXISTS (
          SELECT 1 FROM json_each(?6) AS row
          JOIN invoice_statement_entry AS previous ON previous.branch_id = ?2 AND previous.account = ?3
            AND previous.reference = row.value ->> '$.reference'
        )
      ON CONFLICT DO NOTHING
    `).bind(...values, entries.length, Date.now()),
    env.DB.prepare(`
      INSERT INTO invoice_statement_entry (import_id, branch_id, account, reference, posted_on, direction, amount_paise)
      SELECT ?4, ?2, ?3, row.value ->> '$.reference', row.value ->> '$.postedOn',
        row.value ->> '$.direction', row.value ->> '$.amountPaise'
      FROM json_each(?6) AS row
      WHERE ${canImport} AND EXISTS (SELECT 1 FROM invoice_statement_import WHERE id = ?4 AND ${receipt})
    `).bind(...values),
    env.DB.prepare(`
      SELECT (${canImport}) AS allowed,
        (SELECT id FROM invoice_statement_import WHERE ${receipt} AND ${canImport}) AS id
    `).bind(...values.slice(0, 5)),
  ])
  const result = decision?.results[0]
  if (!result) throw new Error('Statement import decision missing')
  if (!result.allowed) return { error: 'forbidden' }
  return result.id ? { id: result.id } : { error: 'reference-used' }
}
