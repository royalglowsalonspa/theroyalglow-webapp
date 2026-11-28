import {
  DEFAULT_SIGNATURE_TOLERANCE_MS,
  istDateInDays,
  istMonthBounds,
  istToday,
} from '@rgss/business'
import { branchSettlementSnapshotSchema } from '@rgss/types'
import type { InvoiceEnv } from './env'
import { signedBody } from './signed-body'

type StoredSettlement = { observedAt: number; body: string }

export async function ingestSettlementSnapshot(
  request: Request,
  env: InvoiceEnv,
): Promise<Response> {
  const body = await signedBody(request, env.BILLING_EVENT_SECRET, 4096)
  if (typeof body !== 'string') return body
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response(null, { status: 400 })
  }
  const parsed = branchSettlementSnapshotSchema.safeParse(payload)
  if (!parsed.success || parsed.data.source !== env.BILLING_SOURCE)
    return new Response(null, { status: 400 })

  const { source, branchId, month, observedAt, through, membershipBalances } = parsed.data
  const observed = Date.parse(observedAt)
  if (!Number.isSafeInteger(observed)) return new Response(null, { status: 400 })
  const today = istToday(new Date(observed))
  const lastDay = istDateInDays(istMonthBounds(month)[1], -1)
  const signedAt = Number(request.headers.get('x-rgss-timestamp'))
  if (
    Math.abs(Date.now() - observed) > DEFAULT_SIGNATURE_TOLERANCE_MS ||
    Math.abs(signedAt - observed) > DEFAULT_SIGNATURE_TOLERANCE_MS ||
    (membershipBalances !== undefined && month !== today.slice(0, 7)) ||
    through !== (today < lastDay ? today : lastDay)
  )
    return new Response(null, { status: 400 })

  const [written, stored] = await env.DB.batch<StoredSettlement>([
    env.DB.prepare(`
      INSERT INTO invoice_branch_settlement (source, branch_id, month, observed_at, body)
      SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM invoice_access_branch WHERE branch_id = ?2)
      ON CONFLICT (source, branch_id, month) DO UPDATE
      SET observed_at = excluded.observed_at, body = excluded.body
      WHERE invoice_branch_settlement.observed_at < excluded.observed_at
    `).bind(source, branchId, month, observed, body),
    env.DB.prepare(`SELECT observed_at AS observedAt, body FROM invoice_branch_settlement
      WHERE source = ? AND branch_id = ? AND month = ?`).bind(source, branchId, month),
  ])
  if (written?.meta.changes === 1) return new Response(null, { status: 201 })
  const latest = stored?.results[0]
  if (!latest) return new Response(null, { status: 404 })
  return new Response(null, {
    status: observed === latest.observedAt && body !== latest.body ? 409 : 204,
  })
}
