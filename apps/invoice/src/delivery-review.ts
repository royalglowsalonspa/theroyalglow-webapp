interface DeliveryReview {
  operationId: string
  invoiceId: string
  providerId: string
  actor: string
  requestedAt: number
}

const reviewableDelivery = `
  FROM invoice_delivery d
  JOIN issued_invoice i ON i.id = d.invoice_id
  JOIN invoice_effective_grant g ON g.branch_id = i.branch_id AND g.email = ?3 AND g.role = 'owner'
  WHERE d.operation_id = ?1 AND i.id = ?2 AND d.state = 'uncertain'
    AND d.request_hash IS NOT NULL AND d.callback_tag IS NOT NULL
`

export async function recordDeliveryReview(
  db: D1Database,
  { operationId, invoiceId, providerId, actor, requestedAt }: DeliveryReview,
): Promise<boolean> {
  const write = await db
    .prepare(`
      INSERT INTO invoice_delivery_review (operation_id, provider_id, requested_by, requested_at)
      SELECT d.operation_id, ?4, ?3, ?5 ${reviewableDelivery}
      ON CONFLICT (operation_id, provider_id) DO NOTHING
    `)
    .bind(operationId, invoiceId, actor, providerId, requestedAt)
    .run()
  if (write.meta.changes === 1) return true

  const replay = await db
    .prepare(`
      SELECT 1 ${reviewableDelivery}
      AND EXISTS (SELECT 1 FROM invoice_delivery_review r
        WHERE r.operation_id = d.operation_id AND r.provider_id = ?4 AND r.requested_by = ?3)
    `)
    .bind(operationId, invoiceId, actor, providerId)
    .first()
  return replay !== null
}
