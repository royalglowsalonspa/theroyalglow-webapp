import type { InvoiceEnv } from './env'

export const expenseCategories = ['consumables', 'rent', 'utilities', 'other'] as const
export const supplierPaymentMethods = ['cash', 'upi', 'card', 'bank_transfer'] as const

interface BranchScope {
  email: string
  branch: string
}

interface BillInput {
  id: string
  supplier: string
  billNumber: string
  billedOn: string
  category: (typeof expenseCategories)[number]
  totalPaise: number
  gstPaise: number | null
}

interface PaymentInput {
  id: string
  billId: string
  paidOn: string
  method: (typeof supplierPaymentMethods)[number]
  reference: string | null
  amountPaise: number
}

interface RecordedExpense {
  recordedBy: string
  recordedAt: number
  voidedBy: string | null
  voidedAt: number | null
  voidReason: string | null
}

export interface ExpenseBill extends BillInput, RecordedExpense {
  paidPaise: number
  evidenceSha256: string | null
  evidenceBytes: number | null
}

export interface SupplierPayment extends PaymentInput, RecordedExpense {}

const grant = 'SELECT 1 FROM invoice_effective_grant WHERE email = ?1 AND branch_id = ?2'
const canRead = `EXISTS (${grant} AND role IN ('owner', 'manager', 'accountant'))`
const canEnter = `EXISTS (${grant} AND role IN ('owner', 'manager'))`
const isOwner = `EXISTS (${grant} AND role = 'owner')`
const branchScope = 'b.branch_id = ?2 AND b.source = ?3'
const paidPaise = `COALESCE((SELECT SUM(amount_paise) FROM invoice_supplier_payment
  WHERE bill_id = b.id AND voided_at IS NULL), 0)`
const billColumns = `b.id, b.supplier, b.bill_number AS billNumber, b.billed_on AS billedOn,
  b.category, b.total_paise AS totalPaise, b.gst_paise AS gstPaise,
  b.recorded_by AS recordedBy, b.recorded_at AS recordedAt, b.voided_by AS voidedBy,
  b.voided_at AS voidedAt, b.void_reason AS voidReason, ${paidPaise} AS paidPaise,
  e.sha256 AS evidenceSha256, e.bytes AS evidenceBytes`
const billSource = `FROM invoice_supplier_bill AS b
  LEFT JOIN invoice_supplier_bill_evidence AS e ON e.bill_id = b.id`

export async function expenseBranches(env: InvoiceEnv, email: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`
    SELECT branch_id FROM invoice_effective_grant
    WHERE email = ? AND role IN ('owner', 'manager', 'accountant') ORDER BY branch_id
  `)
    .bind(email)
    .all<{ branch_id: string }>()
  return results.map(({ branch_id }) => branch_id)
}

export async function listExpenseBills(
  env: InvoiceEnv,
  {
    email,
    branch,
    month,
    limit,
    offset,
  }: BranchScope & {
    month: string
    limit: number
    offset: number
  },
): Promise<ExpenseBill[]> {
  const { results } = await env.DB.prepare(`
    SELECT ${billColumns} ${billSource}
    WHERE ${branchScope} AND b.billed_on BETWEEN ?4 AND ?5 AND ${canRead}
    ORDER BY b.billed_on DESC, b.id DESC LIMIT ?6 OFFSET ?7
  `)
    .bind(email, branch, env.BILLING_SOURCE, `${month}-01`, `${month}-31`, limit, offset)
    .all<ExpenseBill>()
  return results
}

export async function readExpenseBill(
  env: InvoiceEnv,
  { email, branch, billId }: BranchScope & { billId: string },
): Promise<ExpenseBill | null> {
  return env.DB.prepare(`
    SELECT ${billColumns} ${billSource} WHERE ${branchScope} AND b.id = ?4 AND ${canRead}
  `)
    .bind(email, branch, env.BILLING_SOURCE, billId)
    .first<ExpenseBill>()
}

export async function listSupplierPayments(
  env: InvoiceEnv,
  {
    email,
    branch,
    billId,
    limit,
    offset,
  }: BranchScope & {
    billId: string
    limit: number
    offset: number
  },
): Promise<SupplierPayment[]> {
  const { results } = await env.DB.prepare(`
    SELECT p.id, p.bill_id AS billId, p.paid_on AS paidOn, p.method, p.reference,
      p.amount_paise AS amountPaise, p.recorded_by AS recordedBy, p.recorded_at AS recordedAt,
      p.voided_by AS voidedBy, p.voided_at AS voidedAt, p.void_reason AS voidReason
    FROM invoice_supplier_payment AS p JOIN invoice_supplier_bill AS b ON b.id = p.bill_id
    WHERE ${branchScope} AND b.id = ?4 AND ${canRead}
    ORDER BY p.paid_on DESC, p.id DESC LIMIT ?5 OFFSET ?6
  `)
    .bind(email, branch, env.BILLING_SOURCE, billId, limit, offset)
    .all<SupplierPayment>()
  return results
}

export async function saveExpenseBill(
  env: InvoiceEnv,
  {
    email,
    branch,
    id,
    supplier,
    billNumber,
    billedOn,
    category,
    totalPaise,
    gstPaise,
  }: BranchScope & BillInput,
): Promise<boolean> {
  const values = [
    email,
    branch,
    env.BILLING_SOURCE,
    id,
    supplier,
    billNumber,
    billedOn,
    category,
    totalPaise,
    gstPaise,
  ]
  const [insert, replay] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO invoice_supplier_bill
        (id, source, branch_id, supplier, bill_number, billed_on, category, total_paise, gst_paise, recorded_by, recorded_at)
      SELECT ?4, ?3, ?2, ?5, ?6, ?7, ?8, ?9, ?10, ?1, ?11 WHERE ${canEnter}
      ON CONFLICT DO NOTHING
    `).bind(...values, Date.now()),
    env.DB.prepare(`
      SELECT 1 FROM invoice_supplier_bill AS b WHERE ${branchScope} AND id = ?4 AND supplier = ?5
        AND bill_number = ?6 AND billed_on = ?7 AND category = ?8 AND total_paise = ?9
        AND gst_paise IS ?10 AND recorded_by = ?1 AND ${canEnter}
    `).bind(...values),
  ])
  return insert?.meta.changes === 1 || Boolean(replay?.results.length)
}

export async function saveSupplierPayment(
  env: InvoiceEnv,
  { email, branch, id, billId, paidOn, method, reference, amountPaise }: BranchScope & PaymentInput,
): Promise<boolean> {
  const values = [
    email,
    branch,
    env.BILLING_SOURCE,
    id,
    billId,
    paidOn,
    method,
    reference,
    amountPaise,
  ]
  // Calculate the balance in the same transaction as the write, including competing payments.
  const [insert, replay] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO invoice_supplier_payment
        (id, bill_id, paid_on, method, reference, amount_paise, recorded_by, recorded_at)
      SELECT ?4, b.id, ?6, ?7, ?8, ?9, ?1, ?10 FROM invoice_supplier_bill AS b
      WHERE ${branchScope} AND b.id = ?5 AND b.voided_at IS NULL AND ?6 >= b.billed_on
        AND b.total_paise - ${paidPaise} >= ?9 AND ${isOwner}
      ON CONFLICT DO NOTHING
    `).bind(...values, Date.now()),
    env.DB.prepare(`
      SELECT 1 FROM invoice_supplier_payment AS p JOIN invoice_supplier_bill AS b ON b.id = p.bill_id
      WHERE ${branchScope} AND p.id = ?4 AND b.id = ?5 AND p.paid_on = ?6 AND p.method = ?7
        AND p.reference IS ?8 AND p.amount_paise = ?9 AND p.recorded_by = ?1 AND ${isOwner}
    `).bind(...values),
  ])
  return insert?.meta.changes === 1 || Boolean(replay?.results.length)
}

export async function voidSupplierRecord(
  env: InvoiceEnv,
  {
    email,
    branch,
    billId,
    paymentId,
    reason,
  }: BranchScope & {
    billId: string
    paymentId?: string | undefined
    reason: string
  },
): Promise<boolean> {
  const eligible = `${branchScope} AND b.id = ?4 AND ${isOwner}`
  const [update, replay] = paymentId
    ? await env.DB.batch([
        env.DB.prepare(`
          UPDATE invoice_supplier_payment
          SET voided_at = MAX(recorded_at, ?7), voided_by = ?1, void_reason = ?6
          WHERE id = ?5 AND voided_at IS NULL AND bill_id IN (
            SELECT b.id FROM invoice_supplier_bill AS b WHERE ${eligible}
          )
        `).bind(email, branch, env.BILLING_SOURCE, billId, paymentId, reason, Date.now()),
        env.DB.prepare(`
          SELECT 1 FROM invoice_supplier_payment AS p JOIN invoice_supplier_bill AS b ON b.id = p.bill_id
          WHERE ${eligible} AND p.id = ?5 AND p.voided_by = ?1 AND p.void_reason = ?6
        `).bind(email, branch, env.BILLING_SOURCE, billId, paymentId, reason),
      ])
    : await env.DB.batch([
        env.DB.prepare(`
          UPDATE invoice_supplier_bill AS b
          SET voided_at = MAX(recorded_at, ?6), voided_by = ?1, void_reason = ?5
          WHERE ${eligible} AND b.voided_at IS NULL AND ${paidPaise} = 0
        `).bind(email, branch, env.BILLING_SOURCE, billId, reason, Date.now()),
        env.DB.prepare(`
          SELECT 1 FROM invoice_supplier_bill AS b WHERE ${eligible} AND b.voided_by = ?1 AND b.void_reason = ?5
        `).bind(email, branch, env.BILLING_SOURCE, billId, reason),
      ])
  return update?.meta.changes === 1 || Boolean(replay?.results.length)
}

export async function recordExpenseEvidence(
  env: InvoiceEnv,
  {
    email,
    branch,
    billId,
    sha256,
    bytes,
  }: BranchScope & { billId: string; sha256: string; bytes: number },
): Promise<boolean> {
  const values = [email, branch, env.BILLING_SOURCE, billId, sha256, bytes]
  const [insert, replay] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO invoice_supplier_bill_evidence (bill_id, sha256, bytes, recorded_by, recorded_at)
      SELECT b.id, ?5, ?6, ?1, ?7 FROM invoice_supplier_bill AS b
      WHERE ${branchScope} AND b.id = ?4 AND b.voided_at IS NULL AND ${canEnter}
      ON CONFLICT DO NOTHING
    `).bind(...values, Date.now()),
    env.DB.prepare(`
      SELECT 1 ${billSource} WHERE ${branchScope} AND b.id = ?4 AND e.sha256 = ?5
        AND e.bytes = ?6 AND ${canEnter}
    `).bind(...values),
  ])
  return insert?.meta.changes === 1 || Boolean(replay?.results.length)
}

export async function recordExpenseExport(
  env: InvoiceEnv,
  {
    email,
    branch,
    id,
    month,
    rowCount,
    sha256,
  }: BranchScope & {
    id: string
    month: string
    rowCount: number
    sha256: string
  },
): Promise<boolean> {
  const result = await env.DB.prepare(`
    INSERT INTO invoice_supplier_register_export
      (id, actor_email, source, branch_id, month, generated_at, row_count, schema_version, sha256)
    SELECT ?4, ?1, ?3, ?2, ?5, ?6, ?7, 1, ?8 WHERE ${canRead}
  `)
    .bind(email, branch, env.BILLING_SOURCE, id, month, Date.now(), rowCount, sha256)
    .run()
  return result.meta.changes === 1
}
