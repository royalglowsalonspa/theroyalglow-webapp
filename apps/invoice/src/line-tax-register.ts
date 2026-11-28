import { istMonthBounds, istToday } from '@rgss/business'
import { csvCell, csvFile } from './register-csv'

const MAX_ROWS = 5000
const MAX_INVOICES = 2000
const taxAmounts = [
  'discount_paise',
  'taxable_value_paise',
  'cgst_paise',
  'sgst_paise',
  'gst_paise',
] as const
const columns = [
  'invoice_id',
  'invoice_number',
  'branch_id',
  'issuer_gstin',
  'issued_at_utc',
  'issue_date_ist',
  'tax_review_status',
  'invoice_type',
  'line_number',
  'description',
  'service_id',
  'tax_version_id',
  'sac_code',
  'rate_bps',
  'quantity',
  'gems_covered',
  'unit_price_paise',
  'line_amount_paise',
  ...taxAmounts,
  'facts_status',
] as const
const numericColumns = [
  'line_number',
  'rate_bps',
  'quantity',
  'gems_covered',
  'unit_price_paise',
  'line_amount_paise',
  ...taxAmounts,
  'received_at',
  'total_paise',
] as const
type NumericColumn = (typeof numericColumns)[number]
export type LineTaxDateRange = { from: string; through: string }
export type LineTaxRow = Record<
  Exclude<(typeof columns)[number], NumericColumn | 'issue_date_ist' | 'facts_status'>,
  string | null
> &
  Record<NumericColumn, number | null> & {
    invoice_id: string
    branch_id: string
    issued_at_utc: string
    total_paise: number
  }

type LineTaxRegister = {
  file: string
  invoiceCount: number
  missingFacts: number
  lineCount: number
  incompleteLineCount: number
  totalPaise: number
  latestReceivedAt: number | null
  branches: string[]
}

export function lineTaxRegisterStatement(
  db: D1Database,
  email: string,
  month: string,
  branch?: string,
  range?: LineTaxDateRange,
): D1PreparedStatement {
  const [start, end] = istMonthBounds(month)
  const rangeStart = range ? new Date(`${range.from}T00:00:00+05:30`) : start
  const rangeEnd = range ? new Date(`${range.through}T00:00:00+05:30`) : end
  if (range) rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1)
  return db
    .prepare(`
      SELECT i.id AS invoice_id, i.invoice_number, i.branch_id, i.issued_at AS issued_at_utc,
        i.total_paise, f.issuer_gstin, f.tax_review_status, f.invoice_type,
        l.line_number, l.description, l.service_id, l.tax_version_id, l.sac_code, l.rate_bps,
        l.quantity, l.gems_covered, l.unit_price_paise, l.line_amount_paise, l.discount_paise,
        l.taxable_value_paise, l.cgst_paise, l.sgst_paise, l.gst_paise, l.received_at
      FROM invoice_effective_grant g
      JOIN issued_invoice i ON i.branch_id = g.branch_id
        AND rtrim(i.issued_at, 'Z') >= ?2 AND rtrim(i.issued_at, 'Z') < ?3
      LEFT JOIN invoice_register_fact f ON f.invoice_id = i.id
      LEFT JOIN invoice_line_tax_fact l ON l.invoice_id = i.id
      WHERE g.email = ?1 AND g.role IN ('owner', 'manager', 'accountant')
        ${branch ? 'AND g.branch_id = ?5' : ''}
      ORDER BY rtrim(i.issued_at, 'Z'), i.id, l.line_number LIMIT ?4
    `)
    .bind(
      email,
      rangeStart.toISOString().slice(0, 16),
      rangeEnd.toISOString().slice(0, 16),
      MAX_ROWS + 1,
      ...(branch ? [branch] : []),
    )
}

export async function buildLineTaxRegister(
  db: D1Database,
  email: string,
  month: string,
  branch?: string,
  range?: LineTaxDateRange,
): Promise<Response | LineTaxRegister> {
  const { results } = await lineTaxRegisterStatement(
    db,
    email,
    month,
    branch,
    range,
  ).all<LineTaxRow>()
  return renderLineTaxRegister(results, branch)
}

export function renderLineTaxRegister(
  results: readonly LineTaxRow[],
  branch?: string,
): Response | LineTaxRegister {
  if (results.length > MAX_ROWS) {
    return new Response(
      branch
        ? 'This selection exceeds the 5,000-row line-tax export limit.'
        : 'This selection exceeds 5,000 line-tax rows. Choose one branch.',
      { status: 422 },
    )
  }

  const invoices = new Set<string>()
  const branches = new Set<string>()
  const lines = [columns.join(',')]
  let missingFacts = 0
  let lineCount = 0
  let incompleteLineCount = 0
  let totalPaise = 0
  let latestReceivedAt: number | null = null
  for (const row of results) {
    if (!invoices.has(row.invoice_id)) {
      invoices.add(row.invoice_id)
      branches.add(row.branch_id)
      totalPaise += row.total_paise
    }
    if (invoices.size > MAX_INVOICES) {
      return new Response(
        branch
          ? 'This branch month exceeds the 2,000-invoice export limit.'
          : 'This selection exceeds 2,000 invoices. Choose one branch.',
        { status: 422 },
      )
    }
    if (
      !Number.isSafeInteger(totalPaise) ||
      numericColumns.some((column) => {
        const value = row[column]
        return value !== null && (!Number.isSafeInteger(value) || value < 0)
      })
    ) {
      return new Response('Values exceed the supported line-tax export range.', { status: 422 })
    }

    const incomplete =
      row.sac_code === null ||
      row.rate_bps === null ||
      taxAmounts.some((column) => row[column] === null)
    let factsStatus: 'missing' | 'incomplete' | 'projected'
    if (row.line_number === null) {
      factsStatus = 'missing'
      missingFacts++
    } else {
      factsStatus = incomplete ? 'incomplete' : 'projected'
      lineCount++
      if (incomplete) incompleteLineCount++
    }
    if (row.received_at !== null) {
      latestReceivedAt = Math.max(latestReceivedAt ?? row.received_at, row.received_at)
    }
    const issued = new Date(row.issued_at_utc)
    if (!Number.isFinite(issued.getTime())) throw new Error('Invalid invoice issue instant')
    const record = {
      ...row,
      issue_date_ist: istToday(issued).padStart(10, '0'),
      facts_status: factsStatus,
    }
    lines.push(columns.map((column) => csvCell(record[column])).join(','))
  }

  return {
    file: csvFile(lines),
    invoiceCount: invoices.size,
    missingFacts,
    lineCount,
    incompleteLineCount,
    totalPaise,
    latestReceivedAt,
    branches: [...branches].sort(),
  }
}
