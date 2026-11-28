CREATE TABLE invoice_delivery_review (
  operation_id TEXT NOT NULL REFERENCES invoice_delivery(operation_id),
  provider_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  PRIMARY KEY (operation_id, provider_id)
) STRICT;

CREATE INDEX invoice_delivery_review_latest
  ON invoice_delivery_review (operation_id, requested_at DESC, provider_id);
