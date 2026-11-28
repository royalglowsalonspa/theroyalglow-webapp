import { MAX_INVOICE_SOURCE_COVERAGE_ROWS } from '@rgss/types'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, expect, it, vi } from 'vitest'

const execute = vi.hoisted(() => vi.fn<(statement: SQL) => Promise<{ rows: unknown[] }>>())
vi.mock('../index', () => ({ db: { execute } }))

import {
  readInvoiceReconciliation,
  readInvoiceSourceCoverage,
  readOriginalInvoiceArchiveCandidate,
} from './invoice-reconciliation'

const start = new Date('2026-09-30T18:30:00.000Z')
const end = new Date('2026-10-31T18:30:00.000Z')
const branch = {
  branchId: 'branch-1',
  invoiceCount: '5',
  totalPaise: '9007199254740991',
  publishedCount: '2',
  pendingCount: '1',
  failedCount: '1',
  uncapturedCount: '1',
}

beforeEach(() => execute.mockReset())

it('selects uncaptured originals by branch and rejects normalized key collisions for the UTC year', async () => {
  execute.mockResolvedValue({ rows: [] })
  await expect(readOriginalInvoiceArchiveCandidate('invoice-42', 'branch-1')).resolves.toBeNull()
  const statement = execute.mock.calls[0]?.[0]
  if (!statement) throw new Error('Expected a historical invoice read')
  const query = new PgDialect().sqlToQuery(statement)
  expect(query.params).toEqual(['invoice-42', 'branch-1'])
  expect(query.sql).toMatch(/WHERE i\.id = \$1 AND i\.branch_id = \$2/)
  expect(query.sql).toMatch(/NOT EXISTS \(SELECT 1 FROM invoice_issue_outbox/)
  expect(query.sql).toMatch(/sibling\.created_at\) AT TIME ZONE 'UTC'/)
  expect(query.sql).toMatch(/regexp_replace\(sibling\.invoice_number COLLATE "C"/)
  expect(query.sql).not.toMatch(/customer_id|pdf_url/i)
})

it('compares the whole ledger in the half-open period, including uncaptured invoices', async () => {
  execute.mockResolvedValue({ rows: [branch] })

  await expect(readInvoiceReconciliation(start, end)).resolves.toEqual([
    {
      branchId: 'branch-1',
      invoiceCount: 5,
      totalPaise: Number.MAX_SAFE_INTEGER,
      publishedCount: 2,
      pendingCount: 1,
      failedCount: 1,
      uncapturedCount: 1,
    },
  ])
  expect(execute).toHaveBeenCalledOnce()
  const statement = execute.mock.calls[0]?.[0]
  expect(statement).toBeDefined()
  if (!statement) throw new Error('Expected the reconciliation read')
  const query = new PgDialect().sqlToQuery(statement)
  expect(query.params).toEqual(['2026-09-30T18:30:00.000Z', '2026-10-31T18:30:00.000Z'])
  expect(query.sql).toMatch(/LEFT JOIN invoice_issue_outbox/i)
  expect(query.sql).toMatch(/coalesce\(i\.tax_point_at, i\.created_at\)\s*>=\s*\$1/i)
  expect(query.sql).toMatch(/coalesce\(i\.tax_point_at, i\.created_at\)\s*<\s*\$2/i)
  expect(query.sql).toMatch(/sum\(i\.total_amount_paise\)/i)
  expect(query.sql).toMatch(
    /o\.invoice_id IS NOT NULL AND o\.published_at IS NULL AND o\.failed_at IS NULL/i,
  )
  expect(query.sql).toMatch(/WHERE o\.published_at IS NULL AND o\.failed_at IS NOT NULL/i)
  expect(query.sql).toMatch(/WHERE o\.invoice_id IS NULL/i)
  expect(query.sql).toMatch(/GROUP BY i\.branch_id/i)
  expect(query.sql).not.toMatch(/payment_status|tax_review_status/i)
})

it('rejects an amount above the safe integer range instead of reporting a rounded total', async () => {
  execute.mockResolvedValue({ rows: [{ ...branch, totalPaise: '9007199254740993' }] })
  await expect(readInvoiceReconciliation(start, end)).rejects.toThrow('safe integer')
})

it('rejects reversed and invalid dates before accessing the database', async () => {
  await expect(readInvoiceReconciliation(end, start)).rejects.toBeInstanceOf(RangeError)
  await expect(readInvoiceReconciliation(new Date(Number.NaN), end)).rejects.toBeInstanceOf(
    RangeError,
  )
  expect(execute).not.toHaveBeenCalled()
})

it('reads bounded invoice IDs and publication states for one branch and issue period', async () => {
  const rows = [
    { invoiceId: 'a', totalPaise: 0, publication: 'published' },
    { invoiceId: 'b', totalPaise: 100, publication: 'pending' },
    { invoiceId: 'c', totalPaise: 200, publication: 'failed' },
    { invoiceId: 'd', totalPaise: 300, publication: 'uncaptured' },
  ]
  execute.mockResolvedValue({ rows })

  await expect(readInvoiceSourceCoverage(start, end, 'branch-1')).resolves.toEqual(rows)
  expect(execute).toHaveBeenCalledOnce()
  const statement = execute.mock.calls[0]?.[0]
  if (!statement) throw new Error('Expected a branch coverage read')
  const query = new PgDialect().sqlToQuery(statement)
  expect(query.params).toEqual([
    'branch-1',
    start.toISOString(),
    end.toISOString(),
    MAX_INVOICE_SOURCE_COVERAGE_ROWS + 1,
  ])
  expect(query.sql).toMatch(/LEFT JOIN invoice_issue_outbox/i)
  expect(query.sql).toMatch(/WHERE i\.branch_id = \$1/)
  expect(query.sql).toMatch(/coalesce\(i\.tax_point_at, i\.created_at\) >= \$2/i)
  expect(query.sql).toMatch(/coalesce\(i\.tax_point_at, i\.created_at\) < \$3/i)
  expect(query.sql).toMatch(/WHEN o\.invoice_id IS NULL THEN 'uncaptured'/i)
  expect(query.sql).toMatch(/WHEN o\.published_at IS NOT NULL THEN 'published'/i)
  expect(query.sql).toMatch(/WHEN o\.failed_at IS NOT NULL THEN 'failed'/i)
  expect(query.sql).toMatch(/ELSE 'pending'/i)
  expect(query.sql).toMatch(/i\.invoice_number AS "invoiceNumber"/)
  expect(query.sql).toMatch(/tax_point_at IS NOT NULL\) AS "savedIssueTime"/)
  expect(query.sql).toMatch(/event_body IS NOT NULL\) AS "pinnedEvent"/)
  expect(query.sql).toMatch(
    /nullif\(btrim\(i\.pdf_url\), ''\) IS NOT NULL\) AS "legacyPdfReference"/,
  )
  expect(query.sql).not.toMatch(/customer_id|JOIN "user"|AS "pdfUrl"/i)
  expect(query.sql).toMatch(/ORDER BY i\.id COLLATE "C"\s+LIMIT \$4/i)
})
