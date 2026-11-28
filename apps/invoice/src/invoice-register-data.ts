import { istMonthBounds, istToday } from '@rgss/business'
import { csvCell, csvFile } from './register-csv'

const MAX_INVOICES = 2000
const moneyColumns = [
  'subtotal_paise',
  'discount_paise',
  'taxable_value_paise',
  'cgst_paise',
  'sgst_paise',
  'gst_paise',
  'total_paise',
] as const
const columns = [
  'invoice_id',
  'invoice_number',
  'branch_id',
  'booking_id',
  'booking_number',
  'issued_at_utc',
  'issue_date_ist',
  'received_at_utc',
  'issuer_name',
  'issuer_gstin',
  'invoice_type',
  'payment_status_at_issue',
  'tax_review_status',
  'financial_year',
  'payment_method',
  ...moneyColumns,
  'facts_status',
] as const

type MoneyColumn = (typeof moneyColumns)[number]
export type RegisterRow = Record<
  Exclude<(typeof columns)[number], MoneyColumn | 'issue_date_ist' | 'received_at_utc'>,
  string | null
> &
  Record<MoneyColumn, number | null> & {
    branch_id: string
    issued_at_utc: string
    received_at: number | null
    total_paise: number
    facts_status: 'projected' | 'missing'
  }

export function invoiceRegisterStatement(
  db: D1Database,
  email: string,
  month: string,
  branch?: string,
): D1PreparedStatement {
  const [start, end] = istMonthBounds(month)
  // Minute prefixes include both whole-second and fractional UTC instants at the cutoff.
  return db
    .prepare(`
    SELECT i.id AS invoice_id, i.invoice_number, i.branch_id, i.booking_id, i.booking_number,
      i.issued_at AS issued_at_utc, i.total_paise,
      f.received_at, f.issuer_name, f.issuer_gstin, f.invoice_type, f.payment_status_at_issue,
      f.tax_review_status, f.financial_year,
      CASE WHEN f.has_split_payment = 1 THEN 'split' ELSE f.payment_method END AS payment_method,
      f.subtotal_paise, f.discount_paise,
      f.taxable_value_paise, f.cgst_paise, f.sgst_paise, f.gst_paise,
      CASE WHEN f.invoice_id IS NULL THEN 'missing' ELSE 'projected' END AS facts_status
    FROM invoice_effective_grant g
    JOIN issued_invoice i ON i.branch_id = g.branch_id
      AND rtrim(i.issued_at, 'Z') >= ?2 AND rtrim(i.issued_at, 'Z') < ?3
    LEFT JOIN invoice_register_fact f ON f.invoice_id = i.id
    WHERE g.email = ?1 AND g.role IN ('owner', 'manager', 'accountant')
      ${branch ? 'AND g.branch_id = ?5' : ''}
    ORDER BY rtrim(i.issued_at, 'Z'), i.id LIMIT ?4
  `)
    .bind(
      email,
      start.toISOString().slice(0, 16),
      end.toISOString().slice(0, 16),
      MAX_INVOICES + 1,
      ...(branch ? [branch] : []),
    )
}

export function renderInvoiceRegister(results: readonly RegisterRow[], branch?: string) {
  if (results.length > MAX_INVOICES) {
    return new Response(
      branch
        ? 'This branch month exceeds the 2,000-invoice export limit.'
        : 'This selection exceeds 2,000 invoices. Choose one branch.',
      {
        status: 422,
      },
    )
  }

  let totalPaise = 0
  let missingFacts = 0
  let latestReceivedAt: number | null = null
  const csv = [columns.join(',')]
  for (const row of results) {
    totalPaise += row.total_paise
    if (
      !Number.isSafeInteger(totalPaise) ||
      moneyColumns.some((column) => {
        const value = row[column]
        return value !== null && (!Number.isSafeInteger(value) || value < 0)
      })
    ) {
      return new Response('Amounts exceed the supported export range.', { status: 422 })
    }
    if (row.facts_status === 'missing') missingFacts++
    const issued = new Date(row.issued_at_utc)
    if (!Number.isFinite(issued.getTime())) throw new Error('Invalid invoice issue instant')
    let receivedAtUtc: string | null = null
    if (row.received_at !== null) {
      receivedAtUtc = new Date(row.received_at).toISOString()
      latestReceivedAt = Math.max(latestReceivedAt ?? row.received_at, row.received_at)
    }
    const record = {
      ...row,
      issue_date_ist: istToday(issued).padStart(10, '0'),
      received_at_utc: receivedAtUtc,
    }
    csv.push(columns.map((column) => csvCell(record[column])).join(','))
  }

  return {
    file: csvFile(csv),
    invoiceCount: results.length,
    missingFacts,
    totalPaise,
    latestReceivedAt,
    branches: [...new Set(results.map((row) => row.branch_id))],
    lineCount: null,
    incompleteLineCount: null,
  }
}
