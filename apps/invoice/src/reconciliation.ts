import { istMonthBounds } from '@rgss/business'
import {
  invoiceBranchReconciliationRequestSchema,
  invoiceBranchReconciliationResponseSchema,
  invoiceReconciliationRequestSchema,
  invoiceReconciliationResponseSchema,
  MAX_INVOICE_RECONCILIATION_BRANCHES,
  MAX_INVOICE_SOURCE_COVERAGE_ROWS,
} from '@rgss/types'
import type { InvoiceEnv } from './env'
import { signedBody } from './signed-body'

export async function reconcile(request: Request, env: InvoiceEnv): Promise<Response> {
  const body = await signedBody(request, env.BILLING_EVENT_SECRET, 1024)
  if (typeof body !== 'string') return body

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response(null, { status: 400 })
  }
  const detail = invoiceBranchReconciliationRequestSchema.safeParse(payload)
  if (detail.success) {
    const { source, month, branchId } = detail.data
    const [, end] = istMonthBounds(month)
    if (source !== env.BILLING_SOURCE || Date.now() < end.getTime())
      return new Response(null, { status: 400 })
    return env.REGISTER.getByName(`billing-reconcile/${branchId}`).reconcileBranch(month, branchId)
  }
  const parsed = invoiceReconciliationRequestSchema.safeParse(payload)
  if (!parsed.success || parsed.data.source !== env.BILLING_SOURCE) {
    return new Response(null, { status: 400 })
  }

  const { source, month } = parsed.data
  const [start, end] = istMonthBounds(month)
  if (Date.now() < end.getTime()) return new Response(null, { status: 400 })

  // UTC minute prefixes include whole-second and fractional timestamps at the cutoff.
  const { results: branches } = await env.DB.prepare(`
    SELECT branch_id AS branchId, COUNT(*) AS invoiceCount, SUM(total_paise) AS totalPaise
    FROM issued_invoice
    WHERE rtrim(issued_at, 'Z') >= ?1 AND rtrim(issued_at, 'Z') < ?2
    GROUP BY branch_id ORDER BY branch_id LIMIT ?3
  `)
    .bind(
      start.toISOString().slice(0, 16),
      end.toISOString().slice(0, 16),
      MAX_INVOICE_RECONCILIATION_BRANCHES + 1,
    )
    .all()
  const report = invoiceReconciliationResponseSchema.safeParse({
    version: 1,
    source,
    month,
    checkedAt: new Date().toISOString(),
    branches,
  })
  if (!report.success) return new Response(null, { status: 503 })
  return Response.json(report.data)
}

export async function reconcileBranch(env: InvoiceEnv, month: string, branchId: string) {
  const [start, end] = istMonthBounds(month)
  const { results: invoices } = await env.DB.prepare(`
    SELECT id AS invoiceId, total_paise AS totalPaise FROM issued_invoice
    WHERE branch_id = ?1 AND rtrim(issued_at, 'Z') >= ?2 AND rtrim(issued_at, 'Z') < ?3
    ORDER BY id LIMIT ?4
  `)
    .bind(
      branchId,
      start.toISOString().slice(0, 16),
      end.toISOString().slice(0, 16),
      MAX_INVOICE_SOURCE_COVERAGE_ROWS + 1,
    )
    .all()
  if (invoices.length > MAX_INVOICE_SOURCE_COVERAGE_ROWS) return new Response(null, { status: 422 })
  const report = invoiceBranchReconciliationResponseSchema.safeParse({
    version: 1,
    type: 'invoice.branch-reconciliation',
    source: env.BILLING_SOURCE,
    month,
    branchId,
    checkedAt: new Date().toISOString(),
    invoices,
  })
  return report.success ? Response.json(report.data) : new Response(null, { status: 503 })
}
