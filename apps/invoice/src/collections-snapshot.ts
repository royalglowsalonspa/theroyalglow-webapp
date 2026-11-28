import { DEFAULT_SIGNATURE_TOLERANCE_MS, istToday } from '@rgss/business'
import { type CheckoutCollectionsSnapshot, checkoutCollectionsSnapshotSchema } from '@rgss/types'
import type { InvoiceEnv } from './env'
import { signedBody } from './signed-body'

type CollectionRow = { observed_at: number; body: string }

function scopedCollections(env: InvoiceEnv, branch: string, month: string) {
  return env.DB.prepare(`
    SELECT observed_at, body FROM invoice_checkout_collections
    WHERE source = ? AND branch_id = ? AND month = ?
  `).bind(env.BILLING_SOURCE, branch, month)
}

export async function ingestCollectionsSnapshot(
  request: Request,
  env: InvoiceEnv,
): Promise<Response> {
  const body = await signedBody(request, env.BILLING_EVENT_SECRET, 24 * 1024)
  if (typeof body !== 'string') return body
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response(null, { status: 400 })
  }
  const parsed = checkoutCollectionsSnapshotSchema.safeParse(payload)
  if (!parsed.success || parsed.data.source !== env.BILLING_SOURCE)
    return new Response(null, { status: 400 })
  const { source, branchId, month, observedAt, rows } = parsed.data
  const observed = Date.parse(observedAt)
  if (!Number.isSafeInteger(observed)) return new Response(null, { status: 400 })
  const today = istToday(new Date(observed))
  const signedAt = Number(request.headers.get('x-rgss-timestamp'))
  if (
    Math.abs(Date.now() - observed) > DEFAULT_SIGNATURE_TOLERANCE_MS ||
    Math.abs(signedAt - observed) > DEFAULT_SIGNATURE_TOLERANCE_MS ||
    month > today.slice(0, 7) ||
    rows.some(({ day }) => day > today)
  )
    return new Response(null, { status: 400 })

  const [write, stored] = await env.DB.batch<CollectionRow>([
    env.DB.prepare(`
      INSERT INTO invoice_checkout_collections (source, branch_id, month, observed_at, body)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (source, branch_id, month) DO UPDATE
      SET observed_at = excluded.observed_at, body = excluded.body
      WHERE invoice_checkout_collections.observed_at < excluded.observed_at
    `).bind(source, branchId, month, observed, body),
    scopedCollections(env, branchId, month),
  ])
  const latest = stored?.results[0]
  if (!write || !latest) throw new Error('Collections snapshot receipt missing')
  if (write.meta.changes === 1) return new Response(null, { status: 201 })
  const conflict = observed === latest.observed_at && body !== latest.body
  return new Response(null, { status: conflict ? 409 : 204 })
}

export async function readCollectionsSnapshot(
  env: InvoiceEnv,
  branch: string,
  month: string,
): Promise<CheckoutCollectionsSnapshot | null> {
  const stored = await scopedCollections(env, branch, month).first<CollectionRow>()
  return stored ? decodeCollectionsSnapshot(stored, env.BILLING_SOURCE, branch, month) : null
}

export function decodeCollectionsSnapshot(
  stored: CollectionRow,
  source: string,
  branch: string,
  month: string,
): CheckoutCollectionsSnapshot {
  const decoded = checkoutCollectionsSnapshotSchema.parse(JSON.parse(stored.body))
  if (
    decoded.source !== source ||
    decoded.branchId !== branch ||
    decoded.month !== month ||
    Date.parse(decoded.observedAt) !== stored.observed_at
  )
    throw new Error('Collections snapshot does not match the selected register')
  return decoded
}
