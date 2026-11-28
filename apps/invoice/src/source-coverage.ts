import { DEFAULT_SIGNATURE_TOLERANCE_MS, istMonthBounds } from '@rgss/business'
import { type InvoiceSourceCoverage, invoiceSourceCoverageSchema } from '@rgss/types'
import type { InvoiceEnv } from './env'
import { signedBody } from './signed-body'

type CoverageRow = { observed_at: number; body: string }

function coverageStatement(env: InvoiceEnv, branch: string, month: string) {
  return env.DB.prepare(`
    SELECT observed_at, body FROM invoice_source_coverage
    WHERE source = ? AND branch_id = ? AND month = ?
  `).bind(env.BILLING_SOURCE, branch, month)
}

export async function ingestSourceCoverage(request: Request, env: InvoiceEnv): Promise<Response> {
  const body = await signedBody(request, env.BILLING_EVENT_SECRET, 2048)
  if (typeof body !== 'string') return body

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response(null, { status: 400 })
  }
  const parsed = invoiceSourceCoverageSchema.safeParse(payload)
  if (!parsed.success || parsed.data.source !== env.BILLING_SOURCE) {
    return new Response(null, { status: 400 })
  }

  const { source, branchId, month, observedAt } = parsed.data
  const now = Date.now()
  const [, end] = istMonthBounds(month)
  const observed = Date.parse(observedAt)
  const signedAt = Number(request.headers.get('x-rgss-timestamp'))
  if (
    !Number.isSafeInteger(observed) ||
    now < end.getTime() ||
    observed < end.getTime() ||
    Math.abs(now - observed) > DEFAULT_SIGNATURE_TOLERANCE_MS ||
    Math.abs(signedAt - observed) > DEFAULT_SIGNATURE_TOLERANCE_MS
  ) {
    return new Response(null, { status: 400 })
  }

  const [write, stored] = await env.DB.batch<CoverageRow>([
    env.DB.prepare(`
      INSERT INTO invoice_source_coverage (source, branch_id, month, observed_at, body)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (source, branch_id, month) DO UPDATE
      SET observed_at = excluded.observed_at, body = excluded.body
      WHERE invoice_source_coverage.observed_at < excluded.observed_at
    `).bind(source, branchId, month, observed, body),
    coverageStatement(env, branchId, month),
  ])
  const latest = stored?.results[0]
  if (!write || !latest) throw new Error('Source coverage receipt missing')
  if (write.meta.changes === 1) return new Response(null, { status: 201 })
  const conflict = latest.observed_at === observed && latest.body !== body
  return new Response(null, { status: conflict ? 409 : 204 })
}

export async function readSourceCoverage(
  env: InvoiceEnv,
  branch: string,
  month: string,
): Promise<InvoiceSourceCoverage | null> {
  const row = await coverageStatement(env, branch, month).first<CoverageRow>()
  if (!row) return null
  const result = invoiceSourceCoverageSchema.parse(JSON.parse(row.body))
  if (
    result.branchId !== branch ||
    result.month !== month ||
    result.source !== env.BILLING_SOURCE ||
    Date.parse(result.observedAt) !== row.observed_at
  ) {
    throw new Error('Source coverage does not match the register')
  }
  return result
}
