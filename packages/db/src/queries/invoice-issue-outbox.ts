import { sql } from 'drizzle-orm'
import { db } from '../index'

type ClaimedInvoiceIssue = {
  invoiceId: string
  snapshot: unknown
  leaseToken: string
  attempts: number
  eventBody: string | null
}

export async function readPublishedInvoiceIssueBody(invoiceId: string, branchId: string) {
  const { rows } = await db.execute<{ eventBody: string }>(sql`
    SELECT o.event_body AS "eventBody"
    FROM invoice_issue_outbox o JOIN invoice i ON i.id = o.invoice_id
    WHERE o.invoice_id = ${invoiceId} AND i.branch_id = ${branchId}
      AND o.published_at IS NOT NULL AND o.event_body IS NOT NULL
  `)
  return rows[0]?.eventBody ?? null
}

/** Claim due invoices without waiting on any other publisher. */
export async function claimPendingInvoiceIssues(limit: number): Promise<ClaimedInvoiceIssue[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new RangeError('Invoice outbox batch size must be between 1 and 20')
  }
  const { rows } = await db.execute<ClaimedInvoiceIssue>(sql`
    WITH due AS (
      SELECT invoice_id
      FROM invoice_issue_outbox
      WHERE published_at IS NULL AND failed_at IS NULL AND ready_at <= now()
      ORDER BY ready_at, captured_at, invoice_id
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE invoice_issue_outbox AS outbox
    SET lease_token = gen_random_uuid()::text,
        ready_at = now() + interval '2 minutes',
        attempts = outbox.attempts + 1
    FROM due WHERE outbox.invoice_id = due.invoice_id
    RETURNING outbox.invoice_id AS "invoiceId", outbox.snapshot,
              outbox.lease_token AS "leaseToken", outbox.attempts,
              outbox.event_body AS "eventBody"
  `)
  return rows
}

function liveLease(invoiceId: string, leaseToken: string) {
  return sql`invoice_id = ${invoiceId} AND lease_token = ${leaseToken}
    AND ready_at > now() AND published_at IS NULL AND failed_at IS NULL`
}

/** Save the first wire representation before attempting delivery. */
export async function saveInvoiceIssueBody(
  invoiceId: string,
  leaseToken: string,
  body: string,
): Promise<boolean> {
  const { rows } = await db.execute(sql`
    UPDATE invoice_issue_outbox SET event_body = ${body}
    WHERE ${liveLease(invoiceId, leaseToken)} AND event_body IS NULL
    RETURNING invoice_id
  `)
  return rows.length === 1
}

/** A stale publisher cannot change the outcome of another claim. */
export async function finishInvoiceIssue(
  invoiceId: string,
  leaseToken: string,
  outcome: 'published' | 'retry' | 'failed',
): Promise<boolean> {
  const { rows } = await db.execute(sql`
    UPDATE invoice_issue_outbox
    SET lease_token = NULL,
        published_at = CASE WHEN ${outcome} = 'published' THEN now() END,
        failed_at = CASE WHEN ${outcome} = 'failed' THEN now() END,
        ready_at = CASE WHEN ${outcome} = 'retry' THEN now() + interval '5 minutes' ELSE ready_at END
    WHERE ${liveLease(invoiceId, leaseToken)}
    RETURNING invoice_id
  `)
  return rows.length === 1
}
