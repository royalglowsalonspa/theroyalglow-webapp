import { MAX_INVOICE_SOURCE_COVERAGE_ROWS } from '@rgss/types'
import { sql } from 'drizzle-orm'
import { db } from '../index'

type InvoiceReconciliationRow = {
  branchId: string
  invoiceCount: number
  totalPaise: number
  publishedCount: number
  pendingCount: number
  failedCount: number
  uncapturedCount: number
}

function parseAggregate(value: string): number {
  const parsed = Number(value)
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(parsed)) {
    throw new Error('Invoice reconciliation aggregate is outside the safe integer range')
  }
  return parsed
}

/** Invoice totals for a UTC interval, including rows created before outbox capture. */
export async function readInvoiceReconciliation(
  startAt: Date,
  endAt: Date,
): Promise<InvoiceReconciliationRow[]> {
  if (!(startAt < endAt)) throw new RangeError('Invalid invoice reconciliation period')

  const { rows } = await db.execute<Record<keyof InvoiceReconciliationRow, string>>(sql`
    SELECT i.branch_id AS "branchId",
           count(*)::text AS "invoiceCount",
           sum(i.total_amount_paise)::text AS "totalPaise",
           count(o.published_at)::text AS "publishedCount",
           count(*) FILTER (
             WHERE o.invoice_id IS NOT NULL AND o.published_at IS NULL AND o.failed_at IS NULL
           )::text AS "pendingCount",
           count(*) FILTER (WHERE o.published_at IS NULL AND o.failed_at IS NOT NULL)::text AS "failedCount",
           count(*) FILTER (WHERE o.invoice_id IS NULL)::text AS "uncapturedCount"
    FROM invoice i
    LEFT JOIN invoice_issue_outbox o ON o.invoice_id = i.id
    WHERE coalesce(i.tax_point_at, i.created_at) >= ${startAt.toISOString()}
      AND coalesce(i.tax_point_at, i.created_at) < ${endAt.toISOString()}
    GROUP BY i.branch_id
    ORDER BY i.branch_id
  `)

  return rows.map((row) => ({
    branchId: row.branchId,
    invoiceCount: parseAggregate(row.invoiceCount),
    totalPaise: parseAggregate(row.totalPaise),
    publishedCount: parseAggregate(row.publishedCount),
    pendingCount: parseAggregate(row.pendingCount),
    failedCount: parseAggregate(row.failedCount),
    uncapturedCount: parseAggregate(row.uncapturedCount),
  }))
}

type InvoiceSourceCoverageRow = {
  invoiceId: string
  invoiceNumber: string
  totalPaise: number
  publication: 'published' | 'pending' | 'failed' | 'uncaptured'
  savedIssueTime: boolean
  pinnedEvent: boolean
  legacyPdfReference: boolean
}

/** Source invoice identities for a single branch. The extra row signals an oversized period. */
export async function readInvoiceSourceCoverage(
  startAt: Date,
  endAt: Date,
  branchId: string,
): Promise<InvoiceSourceCoverageRow[]> {
  if (!(startAt < endAt)) throw new RangeError('Invalid invoice reconciliation period')
  const { rows } = await db.execute<InvoiceSourceCoverageRow>(sql`
    SELECT i.id AS "invoiceId", i.invoice_number AS "invoiceNumber",
           i.total_amount_paise AS "totalPaise",
           (i.tax_point_at IS NOT NULL) AS "savedIssueTime",
           (o.event_body IS NOT NULL) AS "pinnedEvent",
           (nullif(btrim(i.pdf_url), '') IS NOT NULL) AS "legacyPdfReference",
           CASE
             WHEN o.invoice_id IS NULL THEN 'uncaptured'
             WHEN o.published_at IS NOT NULL THEN 'published'
             WHEN o.failed_at IS NOT NULL THEN 'failed'
             ELSE 'pending'
           END AS publication
    FROM invoice i
    LEFT JOIN invoice_issue_outbox o ON o.invoice_id = i.id
    WHERE i.branch_id = ${branchId}
      AND coalesce(i.tax_point_at, i.created_at) >= ${startAt.toISOString()}
      AND coalesce(i.tax_point_at, i.created_at) < ${endAt.toISOString()}
    ORDER BY i.id COLLATE "C"
    LIMIT ${MAX_INVOICE_SOURCE_COVERAGE_ROWS + 1}
  `)
  return rows
}

/** Resolve an uncaptured invoice without reading current customer profile fields. */
export async function readOriginalInvoiceArchiveCandidate(invoiceId: string, branchId: string) {
  const { rows } = await db.execute<{
    invoiceId: string
    branchId: string
    bookingId: string | null
    bookingNumber: string | null
    invoiceNumber: string
    recordedAt: string
    dateBasis: 'tax_point' | 'created_at'
    totalPaise: number
  }>(sql`
    SELECT i.id AS "invoiceId", i.branch_id AS "branchId", i.booking_id AS "bookingId",
           b.booking_number AS "bookingNumber", i.invoice_number AS "invoiceNumber",
           to_char(coalesce(i.tax_point_at, i.created_at) AT TIME ZONE 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "recordedAt",
           CASE WHEN i.tax_point_at IS NULL THEN 'created_at' ELSE 'tax_point' END AS "dateBasis",
           i.total_amount_paise AS "totalPaise"
    FROM invoice i LEFT JOIN booking b ON b.id = i.booking_id
    WHERE i.id = ${invoiceId} AND i.branch_id = ${branchId}
      AND NOT EXISTS (SELECT 1 FROM invoice_issue_outbox o WHERE o.invoice_id = i.id)
      AND NOT EXISTS (
        SELECT 1 FROM invoice sibling WHERE sibling.id <> i.id
          AND extract(year FROM coalesce(sibling.tax_point_at, sibling.created_at) AT TIME ZONE 'UTC')
            = extract(year FROM coalesce(i.tax_point_at, i.created_at) AT TIME ZONE 'UTC')
          AND regexp_replace(sibling.invoice_number COLLATE "C", '[^A-Za-z0-9-]+', '-', 'g')
            = regexp_replace(i.invoice_number COLLATE "C", '[^A-Za-z0-9-]+', '-', 'g')
      )
  `)
  return rows[0] ?? null
}
