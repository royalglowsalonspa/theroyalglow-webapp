CREATE TABLE invoice_delivery (
  invoice_id TEXT PRIMARY KEY NOT NULL REFERENCES issued_invoice(id),
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'sending', 'retry', 'accepted', 'failed', 'uncertain')),
  due_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at INTEGER,
  request_hash TEXT,
  provider_id TEXT,
  failure TEXT
) STRICT;

CREATE INDEX invoice_delivery_due ON invoice_delivery (state, due_at);
