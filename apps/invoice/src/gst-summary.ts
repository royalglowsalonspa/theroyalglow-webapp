import { istMonthBounds } from '@rgss/business'
import { hasValidGstinCheckCharacter } from '@rgss/types'

const MAX_ROWS = 5000
const MAX_INVOICES = 2000
const taxAmounts = ['taxablePaise', 'cgstPaise', 'sgstPaise', 'gstPaise'] as const
type TaxAmounts = Record<(typeof taxAmounts)[number], number>
type ReviewStatus = 'reviewed' | 'provisional'

export type GstRow = {
  invoiceId: string
  number: string
  branchId: string
  totalPaise: number
  headerReceivedAt: number | null
  invoiceType: string | null
  paid: string | null
  reviewStatus: ReviewStatus | null
  gstin: string | null
  headerSubtotal: number | null
  headerDiscount: number | null
  headerTaxable: number | null
  headerCgst: number | null
  headerSgst: number | null
  headerGst: number | null
  lineReceivedAt: number | null
  lineNumber: number | null
  sacCode: string | null
  rateBps: number | null
  lineAmount: number | null
  lineDiscount: number | null
  taxablePaise: number | null
  cgstPaise: number | null
  sgstPaise: number | null
  gstPaise: number | null
}

type GstLine = TaxAmounts & { sacCode: string; rateBps: number }
type GstException = Pick<GstRow, 'invoiceId' | 'number' | 'branchId'> & { reason: string }
type GstGroup = GstLine & {
  branchId: string
  gstin: string | null
  reviewStatus: ReviewStatus
  lineCount: number
}
type GstBucket = TaxAmounts & { invoiceCount: number }

export type GstSummary = {
  invoiceCount: number
  reviewed: GstBucket
  provisional: GstBucket
  usageCount: number
  exceptionCount: number
  exceptions: GstException[]
  groups: GstGroup[]
  groupCount: number
  latestReceivedAt: number | null
  branches: string[]
}

const numericColumns = [
  'totalPaise',
  'headerReceivedAt',
  'headerSubtotal',
  'headerDiscount',
  'headerTaxable',
  'headerCgst',
  'headerSgst',
  'headerGst',
  'lineReceivedAt',
  'lineNumber',
  'rateBps',
  'lineAmount',
  'lineDiscount',
  ...taxAmounts,
] as const

function emptyAmounts(): TaxAmounts {
  return { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, gstPaise: 0 }
}

function addAmounts(target: TaxAmounts, amounts: TaxAmounts): boolean {
  for (const name of taxAmounts) {
    target[name] += amounts[name]
    if (!Number.isSafeInteger(target[name])) return false
  }
  return true
}

type ClassifiedInvoice =
  | { reviewStatus: ReviewStatus; totals: TaxAmounts; lines: GstLine[] }
  | { reason: string }
  | 'usage'
  | 'overflow'

function classify(header: GstRow, rows: GstRow[]): ClassifiedInvoice {
  const {
    totalPaise,
    invoiceType,
    paid,
    reviewStatus,
    gstin,
    headerSubtotal,
    headerDiscount,
    headerTaxable,
    headerCgst,
    headerSgst,
    headerGst,
  } = header
  if (
    header.headerReceivedAt === null ||
    headerSubtotal === null ||
    headerDiscount === null ||
    headerTaxable === null ||
    headerCgst === null ||
    headerSgst === null ||
    headerGst === null
  ) {
    return { reason: 'Invoice facts missing' }
  }
  if (invoiceType === 'membership_session') {
    const nonzero =
      [
        totalPaise,
        headerSubtotal,
        headerDiscount,
        headerTaxable,
        headerCgst,
        headerSgst,
        headerGst,
      ].some(Boolean) ||
      rows.some(
        (line) => line.lineAmount || line.lineDiscount || taxAmounts.some((name) => line[name]),
      )
    return nonzero ? { reason: 'Nonzero membership usage' } : 'usage'
  }
  if (invoiceType !== 'service' && invoiceType !== 'membership_purchase') {
    return { reason: 'Invoice type unavailable' }
  }
  if (paid !== 'paid') return { reason: 'Payment status unavailable' }
  if (reviewStatus !== 'reviewed' && reviewStatus !== 'provisional') {
    return { reason: 'Tax review status unavailable' }
  }
  if (reviewStatus === 'reviewed' && (!gstin || !hasValidGstinCheckCharacter(gstin))) {
    return { reason: 'Issuer GSTIN missing or invalid' }
  }

  const totals = emptyAmounts()
  const lines: GstLine[] = []
  let subtotal = 0
  let discounts = 0
  for (const row of rows) {
    const {
      lineNumber,
      sacCode,
      rateBps,
      lineAmount,
      lineDiscount,
      taxablePaise,
      cgstPaise,
      sgstPaise,
      gstPaise,
    } = row
    if (
      lineNumber !== lines.length + 1 ||
      !sacCode ||
      rateBps === null ||
      lineAmount === null ||
      lineDiscount === null ||
      taxablePaise === null ||
      cgstPaise === null ||
      sgstPaise === null ||
      gstPaise === null
    ) {
      return { reason: 'Line tax facts missing' }
    }
    const components = cgstPaise + sgstPaise
    const charged = taxablePaise + gstPaise
    subtotal += lineAmount
    discounts += lineDiscount
    if (![components, charged, subtotal, discounts].every(Number.isSafeInteger)) return 'overflow'
    if (components !== gstPaise || lineAmount - lineDiscount !== charged) {
      return { reason: 'Saved amounts disagree' }
    }
    const line = { sacCode, rateBps, taxablePaise, cgstPaise, sgstPaise, gstPaise }
    if (!addAmounts(totals, line)) return 'overflow'
    lines.push(line)
  }

  const headerComponents = headerCgst + headerSgst
  const headerCharged = headerTaxable + headerGst
  if (!Number.isSafeInteger(headerComponents) || !Number.isSafeInteger(headerCharged))
    return 'overflow'
  if (
    headerComponents !== headerGst ||
    headerCharged !== totalPaise ||
    headerSubtotal - headerDiscount !== totalPaise ||
    subtotal !== headerSubtotal ||
    discounts !== headerDiscount ||
    totals.taxablePaise !== headerTaxable ||
    totals.cgstPaise !== headerCgst ||
    totals.sgstPaise !== headerSgst ||
    totals.gstPaise !== headerGst
  ) {
    return { reason: 'Saved amounts disagree' }
  }
  return { reviewStatus, totals, lines }
}

function amountOverflow(): Response {
  return new Response('Saved amounts exceed the supported GST summary range.', { status: 422 })
}

export function gstSummaryStatement(
  db: D1Database,
  email: string,
  month: string,
  branch?: string,
): D1PreparedStatement {
  const [start, end] = istMonthBounds(month)
  return db
    .prepare(`
      SELECT i.id AS invoiceId, i.invoice_number AS number, i.branch_id AS branchId,
        i.total_paise AS totalPaise, f.received_at AS headerReceivedAt, f.issuer_gstin AS gstin,
        f.invoice_type AS invoiceType, f.payment_status_at_issue AS paid, f.tax_review_status AS reviewStatus,
        f.subtotal_paise AS headerSubtotal, f.discount_paise AS headerDiscount, f.taxable_value_paise AS headerTaxable,
        f.cgst_paise AS headerCgst, f.sgst_paise AS headerSgst, f.gst_paise AS headerGst,
        l.received_at AS lineReceivedAt, l.line_number AS lineNumber, l.sac_code AS sacCode, l.rate_bps AS rateBps,
        l.line_amount_paise AS lineAmount, l.discount_paise AS lineDiscount, l.taxable_value_paise AS taxablePaise,
        l.cgst_paise AS cgstPaise, l.sgst_paise AS sgstPaise, l.gst_paise AS gstPaise
      FROM invoice_effective_grant g
      JOIN issued_invoice i ON i.branch_id = g.branch_id
        AND rtrim(i.issued_at, 'Z') >= ?2 AND rtrim(i.issued_at, 'Z') < ?3
      LEFT JOIN invoice_register_fact f ON f.invoice_id = i.id
      LEFT JOIN invoice_line_tax_fact l ON l.invoice_id = i.id
      WHERE g.email = ?1 AND g.role IN ('owner', 'manager', 'accountant')
        ${branch ? 'AND g.branch_id = ?5' : ''}
      ORDER BY rtrim(i.issued_at, 'Z') DESC, i.id DESC, l.line_number LIMIT ?4
    `)
    .bind(
      email,
      start.toISOString().slice(0, 16),
      end.toISOString().slice(0, 16),
      MAX_ROWS + 1,
      ...(branch ? [branch] : []),
    )
}

export async function readGstSummary(
  db: D1Database,
  email: string,
  month: string,
  branch?: string,
): Promise<Response | GstSummary> {
  const { results } = await gstSummaryStatement(db, email, month, branch).all<GstRow>()
  return summarizeGstRows(results)
}

export function summarizeGstRows(results: readonly GstRow[]): Response | GstSummary {
  if (results.length > MAX_ROWS) {
    return new Response('This selection exceeds the 5,000-row GST summary limit.', { status: 422 })
  }

  const invoices = new Map<string, { header: GstRow; rows: GstRow[] }>()
  const branches = new Set<string>()
  let latestReceivedAt: number | null = null
  for (const row of results) {
    if (
      numericColumns.some((column) => {
        const value = row[column]
        return value !== null && (!Number.isSafeInteger(value) || value < 0)
      })
    ) {
      return amountOverflow()
    }
    const existing = invoices.get(row.invoiceId)
    if (existing) existing.rows.push(row)
    else invoices.set(row.invoiceId, { header: row, rows: [row] })
    if (invoices.size > MAX_INVOICES) {
      return new Response('This selection exceeds the 2,000-invoice GST summary limit.', {
        status: 422,
      })
    }
    branches.add(row.branchId)
    for (const receivedAt of [row.headerReceivedAt, row.lineReceivedAt]) {
      if (receivedAt !== null)
        latestReceivedAt = Math.max(latestReceivedAt ?? receivedAt, receivedAt)
    }
  }

  const groups = new Map<string, GstGroup>()
  const buckets = {
    reviewed: { ...emptyAmounts(), invoiceCount: 0 },
    provisional: { ...emptyAmounts(), invoiceCount: 0 },
  }
  const exceptions: GstException[] = []
  let exceptionCount = 0
  let usageCount = 0
  for (const { header, rows } of invoices.values()) {
    const result = classify(header, rows)
    if (result === 'overflow') return amountOverflow()
    if (result === 'usage') {
      usageCount++
      continue
    }
    if ('reason' in result) {
      exceptionCount++
      if (exceptions.length < 20) {
        const { invoiceId, number, branchId } = header
        exceptions.push({ invoiceId, number, branchId, reason: result.reason })
      }
      continue
    }

    // Only a fully checked invoice contributes to either review totals or SAC groups.
    const { reviewStatus, totals, lines } = result
    const bucket = buckets[reviewStatus]
    if (!addAmounts(bucket, totals)) return amountOverflow()
    bucket.invoiceCount++
    const { branchId, gstin } = header
    for (const line of lines) {
      const { sacCode, rateBps } = line
      const key = JSON.stringify([branchId, gstin, sacCode, rateBps, reviewStatus])
      let group = groups.get(key)
      if (!group) {
        group = { ...emptyAmounts(), branchId, gstin, sacCode, rateBps, reviewStatus, lineCount: 0 }
        groups.set(key, group)
      }
      if (!addAmounts(group, line)) return amountOverflow()
      group.lineCount++
    }
  }

  return {
    invoiceCount: invoices.size,
    ...buckets,
    usageCount,
    exceptionCount,
    exceptions,
    groups: [...groups.values()]
      .sort(
        (a, b) =>
          a.branchId.localeCompare(b.branchId) ||
          (a.gstin ?? '').localeCompare(b.gstin ?? '') ||
          a.sacCode.localeCompare(b.sacCode) ||
          a.rateBps - b.rateBps ||
          a.reviewStatus.localeCompare(b.reviewStatus),
      )
      .slice(0, 50),
    groupCount: groups.size,
    latestReceivedAt,
    branches: [...branches].sort(),
  }
}
