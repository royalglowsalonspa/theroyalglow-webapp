CREATE TABLE invoice_delivery_operations (
  operation_id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL REFERENCES issued_invoice(id),
  requested_by TEXT,
  requested_at INTEGER,
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'sending', 'retry', 'accepted', 'failed', 'uncertain')),
  due_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at INTEGER,
  request_hash TEXT,
  provider_id TEXT,
  failure TEXT,
  CHECK (
    (requested_by IS NULL AND requested_at IS NULL AND operation_id = 'initial:' || invoice_id)
    OR (requested_by IS NOT NULL AND requested_at IS NOT NULL AND operation_id NOT LIKE 'initial:%')
  )
) STRICT;

INSERT INTO invoice_delivery_operations (
  operation_id, invoice_id, state, due_at, attempts, first_attempt_at, request_hash, provider_id, failure
)
SELECT 'initial:' || invoice_id, invoice_id, state, due_at, attempts, first_attempt_at,
  request_hash, provider_id, failure
FROM invoice_delivery;

DROP TABLE invoice_delivery;

ALTER TABLE invoice_delivery_operations RENAME TO invoice_delivery;

CREATE INDEX invoice_delivery_due ON invoice_delivery (state, due_at);
CREATE INDEX invoice_delivery_history ON invoice_delivery (invoice_id, requested_at DESC);
