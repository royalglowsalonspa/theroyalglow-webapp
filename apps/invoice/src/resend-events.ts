export type ResendStatus =
  | 'sent'
  | 'delayed'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'suppressed'
  | 'complained'

type ResendEvent = {
  eventId: string
  providerId: string
  status: ResendStatus
  occurredAt: number
  callbackTag: string | null
}

// Sent and delayed callbacks cannot undo an outcome. Suppression and spam reports stay visible.
function phase(field: 'provider_status' | '?4') {
  return `CASE ${field}
    WHEN 'sent' THEN 1 WHEN 'delayed' THEN 2
    WHEN 'suppressed' THEN 4 WHEN 'complained' THEN 5
    ELSE 3 END`
}

export async function recordResendEvent(db: D1Database, event: ResendEvent): Promise<void> {
  const { eventId, providerId, status, occurredAt, callbackTag } = event
  const { results: matches } = await db
    .prepare(`
    SELECT operation_id FROM invoice_delivery
    WHERE provider_id = ?1 OR callback_tag = ?2 LIMIT 2
  `)
    .bind(providerId, callbackTag)
    .all<{ operation_id: string }>()
  const operation = matches[0]
  if (matches.length !== 1 || !operation) return

  const values = [eventId, operation.operation_id, providerId, status, occurredAt] as const
  const changes = [
    db
      .prepare(`
      INSERT INTO invoice_email_webhook_receipt (event_id, operation_id, provider_id, event_status, occurred_at)
      SELECT ?1, d.operation_id, ?3, ?4, ?5 FROM invoice_delivery d
      WHERE d.operation_id = ?2
        AND (d.provider_id = ?3 OR (d.provider_id IS NULL AND d.callback_tag = ?6 AND d.request_hash IS NOT NULL))
        AND (?6 IS NULL OR d.callback_tag IS NULL OR d.callback_tag = ?6)
        AND NOT EXISTS (SELECT 1 FROM invoice_delivery other
          WHERE other.provider_id = ?3 AND other.operation_id <> ?2)
      ON CONFLICT(event_id) DO NOTHING
    `)
      .bind(...values, callbackTag),
    db
      .prepare(`
      UPDATE invoice_delivery
      SET state = 'accepted', provider_id = ?3, provider_status = ?4, provider_event_at = ?5, failure = NULL
      WHERE operation_id = ?2 AND (provider_id IS NULL OR provider_id = ?3)
        AND EXISTS (SELECT 1 FROM invoice_email_webhook_receipt
          WHERE event_id = ?1 AND operation_id = ?2 AND provider_id = ?3 AND event_status = ?4 AND occurred_at = ?5)
        AND (provider_status IS NULL OR ${phase('?4')} > ${phase('provider_status')}
          OR (${phase('?4')} = ${phase('provider_status')} AND (
            ?5 > provider_event_at OR (?5 = provider_event_at AND (
              (?4 IN ('failed', 'bounced') AND provider_status = 'delivered')
              OR (?4 = 'bounced' AND provider_status = 'failed')
            ))
          )))
    `)
      .bind(...values),
  ]
  if (status === 'suppressed' || status === 'complained') {
    // Once a request is pinned it may already have reached Resend, so retain it for reconciliation.
    changes.push(
      db
        .prepare(`
        UPDATE invoice_delivery SET state = 'failed', failure = 'provider_contact_blocked'
        WHERE state IN ('queued', 'retry', 'sending') AND request_hash IS NULL
          AND invoice_id = (SELECT invoice_id FROM invoice_delivery
            WHERE operation_id = ? AND provider_id = ? AND provider_status IN ('suppressed', 'complained'))
      `)
        .bind(operation.operation_id, providerId),
    )
  }
  await db.batch(changes)
}
