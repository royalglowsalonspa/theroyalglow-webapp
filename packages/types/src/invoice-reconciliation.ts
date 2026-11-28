import { z } from 'zod'
import { INVOICE_ISSUE_EVENT_PATH, invoiceEventIdSchema } from './invoice-issue-event'

export const INVOICE_RECONCILIATION_PATH = `${INVOICE_ISSUE_EVENT_PATH}/reconcile`
export const INVOICE_SOURCE_COVERAGE_PATH = `${INVOICE_ISSUE_EVENT_PATH}/source-coverage`
export const MAX_INVOICE_RECONCILIATION_BRANCHES = 200
export const MAX_INVOICE_SOURCE_COVERAGE_ROWS = 2000
export const invoiceReconciliationMonthSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/)
const scope = {
  version: z.literal(1),
  source: z.string().min(1).max(32),
  month: invoiceReconciliationMonthSchema,
}

export const invoiceReconciliationRequestSchema = z.strictObject({
  ...scope,
  type: z.literal('invoice.reconciliation'),
})
export const invoiceBranchReconciliationRequestSchema = z.strictObject({
  ...scope,
  type: z.literal('invoice.branch-reconciliation'),
  branchId: invoiceEventIdSchema,
})
export const invoiceBranchReconciliationResponseSchema =
  invoiceBranchReconciliationRequestSchema.extend({
    checkedAt: z.iso.datetime(),
    invoices: z
      .array(z.strictObject({ invoiceId: invoiceEventIdSchema, totalPaise: z.int().nonnegative() }))
      .max(MAX_INVOICE_SOURCE_COVERAGE_ROWS)
      .refine(
        (invoices) => new Set(invoices.map(({ invoiceId }) => invoiceId)).size === invoices.length,
      ),
  })
export const invoiceReconciliationResponseSchema = z.strictObject({
  ...scope,
  checkedAt: z.iso.datetime(),
  branches: z
    .array(
      z.strictObject({
        branchId: invoiceEventIdSchema,
        invoiceCount: z.int().positive(),
        totalPaise: z.int().nonnegative(),
      }),
    )
    .max(MAX_INVOICE_RECONCILIATION_BRANCHES)
    .refine(
      (branches) => new Set(branches.map(({ branchId }) => branchId)).size === branches.length,
    ),
})

const coverageCount = z.int().min(0).max(MAX_INVOICE_SOURCE_COVERAGE_ROWS)
export const invoiceSourceCoverageSchema = z
  .strictObject({
    ...scope,
    type: z.literal('invoice.source-coverage'),
    branchId: invoiceEventIdSchema,
    observedAt: z.iso.datetime(),
    invoiceCount: coverageCount,
    totalPaise: z.int().nonnegative(),
    publishedCount: coverageCount,
    pendingCount: coverageCount,
    failedCount: coverageCount,
    uncapturedCount: coverageCount,
    identitiesSha256: z.hash('sha256').regex(/^[a-f0-9]{64}$/),
  })
  .refine(
    (coverage) =>
      coverage.publishedCount +
        coverage.pendingCount +
        coverage.failedCount +
        coverage.uncapturedCount ===
        coverage.invoiceCount &&
      (coverage.invoiceCount > 0 || coverage.totalPaise === 0),
  )

export type InvoiceSourceCoverage = z.infer<typeof invoiceSourceCoverageSchema>
export type InvoiceCoverageIdentity = { invoiceId: string; totalPaise: number }

export function invoiceCoverageIdentityText(rows: readonly InvoiceCoverageIdentity[]): string {
  return JSON.stringify(
    [...rows]
      .sort((a, b) => (a.invoiceId < b.invoiceId ? -1 : a.invoiceId > b.invoiceId ? 1 : 0))
      .map(({ invoiceId, totalPaise }) => [invoiceId, totalPaise]),
  )
}
