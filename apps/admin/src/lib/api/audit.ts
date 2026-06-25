/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : api/audit
 * Scope        : API Infrastructure — audit trail
 *
 * Description  : Best-effort helper that records an admin mutation into the
 *                audit_log. Extracts the actor from the session and the client
 *                IP from the request, then writes via @rgss/db. Never throws —
 *                a failed audit must not break the primary operation.
 *
 * Responsibilities :
 * - Resolve actor id (from session) + client IP (from forwarded headers)
 * - Delegate the insert to recordAudit (swallow + log any failure)
 *
 * Tech Stack   : TypeScript, Next.js 16
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/db/queries (recordAudit), @rgss/types (AuditAction)
 *
 * Notes        : Call AFTER the mutation succeeds. Pass old/new snapshots for
 *                a full change history in the Logs viewer.
 ************************************************************/

import { recordAudit } from '@rgss/db/queries'
import type { AuditAction } from '@rgss/types'

type AuditActor = { user: { id: string } }

// Derive the client IP from standard proxy headers (Cloudflare/Render set these).
function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) {
    return fwd.split(',')[0]?.trim() ?? null
  }
  return req.headers.get('x-real-ip') ?? req.headers.get('cf-connecting-ip') ?? null
}

/**
 * Record an audit entry for an admin mutation. Best-effort: any failure is
 * logged and swallowed so the caller's response is unaffected.
 */
export async function audit(
  req: Request,
  session: AuditActor,
  entry: {
    action: AuditAction
    entityType: string
    entityId: string
    oldValues?: unknown
    newValues?: unknown
  },
): Promise<void> {
  try {
    await recordAudit({
      actorId: session.user.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValues: entry.oldValues,
      newValues: entry.newValues,
      ipAddress: clientIp(req),
    })
  } catch (err) {
    console.error('[audit] failed to record entry', err)
  }
}
