import { INVOICE_STAFF_ROSTER_MAX_BYTES, invoiceStaffRosterSchema } from '@rgss/types'
import { snapshotHash } from './contracts'
import type { InvoiceEnv } from './env'
import { signedBody } from './signed-body'

const hasNewRevision = 'EXISTS (SELECT 1 FROM invoice_roster_state WHERE id = 1 AND revision < ?1)'
const incoming = `SELECT value ->> '$.email', value ->> '$.branchId', value ->> '$.role'
                  FROM json_each(?2)`
const removedStaffGrant = `role IN ('owner', 'manager')
                          AND (email, branch_id, role) NOT IN (${incoming})`

export async function ingestStaffRoster(request: Request, env: InvoiceEnv): Promise<Response> {
  if (env.INVOICE_ROSTER_SECRET === env.BILLING_EVENT_SECRET) {
    return new Response(null, { status: 503 })
  }
  const body = await signedBody(request, env.INVOICE_ROSTER_SECRET, INVOICE_STAFF_ROSTER_MAX_BYTES)
  if (typeof body !== 'string') return body

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response(null, { status: 400 })
  }
  const parsed = invoiceStaffRosterSchema.safeParse(payload)
  if (!parsed.success || parsed.data.source !== env.BILLING_SOURCE) {
    return new Response(null, { status: 400 })
  }
  const { revision, branches, assignments } = parsed.data
  if (revision > (Date.now() + 300_000) * 1_000) return new Response(null, { status: 400 })

  const hash = await snapshotHash(body)
  const staff = JSON.stringify(assignments)
  const db = env.DB
  // The watermark advances last. D1 applies the gated roster, revocations, and audit
  // as one transaction, even if another signed request reaches a different isolate.
  const results = await db.batch<{ revision: number; body_hash: string }>([
    db
      .prepare(`INSERT INTO invoice_access_branch (branch_id)
      SELECT value FROM json_each(?2) WHERE ${hasNewRevision}
      ON CONFLICT DO NOTHING`)
      .bind(revision, JSON.stringify(branches)),
    db
      .prepare(`INSERT INTO invoice_grant_change (id, actor, email, branch_id, old_role, new_role)
      SELECT lower(hex(randomblob(16))), 'system:staff-roster', email, branch_id, role, NULL
      FROM invoice_grant WHERE ${hasNewRevision} AND ${removedStaffGrant}`)
      .bind(revision, staff),
    db
      .prepare(`DELETE FROM invoice_grant WHERE ${hasNewRevision}
      AND ${removedStaffGrant}`)
      .bind(revision, staff),
    db
      .prepare(`DELETE FROM invoice_staff_assignment WHERE ${hasNewRevision}
      AND (email, branch_id, role) NOT IN (${incoming})`)
      .bind(revision, staff),
    db
      .prepare(`INSERT INTO invoice_staff_assignment (email, branch_id, role)
      SELECT * FROM (${incoming}) WHERE ${hasNewRevision}
      ON CONFLICT DO NOTHING`)
      .bind(revision, staff),
    db
      .prepare(`UPDATE invoice_roster_state SET revision = ?1, body_hash = ?2, received_at = ?3
      WHERE id = 1 AND revision < ?1`)
      .bind(revision, hash, new Date().toISOString()),
    db.prepare('SELECT revision, body_hash FROM invoice_roster_state WHERE id = 1'),
  ])
  const update = results.at(-2)
  const receipt = results.at(-1)?.results[0]
  if (!update || !receipt) throw new Error('Invoice roster receipt is missing')
  if (update.meta.changes === 1) return new Response(null, { status: 201 })
  const conflict = receipt.revision === revision && receipt.body_hash !== hash
  return new Response(null, { status: conflict ? 409 : 204 })
}
