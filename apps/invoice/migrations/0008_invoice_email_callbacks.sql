ALTER TABLE invoice_delivery ADD COLUMN callback_tag TEXT;
ALTER TABLE invoice_delivery ADD COLUMN provider_status TEXT
  CHECK (provider_status IN ('sent', 'delayed', 'delivered', 'bounced', 'failed', 'suppressed', 'complained'));
ALTER TABLE invoice_delivery ADD COLUMN provider_event_at INTEGER;

CREATE UNIQUE INDEX invoice_delivery_callback_tag ON invoice_delivery (callback_tag)
  WHERE callback_tag IS NOT NULL;
CREATE INDEX invoice_delivery_provider_id ON invoice_delivery (provider_id)
  WHERE provider_id IS NOT NULL;

CREATE TABLE invoice_email_webhook_receipt (
  event_id TEXT PRIMARY KEY NOT NULL,
  operation_id TEXT NOT NULL REFERENCES invoice_delivery(operation_id),
  provider_id TEXT NOT NULL,
  event_status TEXT NOT NULL
    CHECK (event_status IN ('sent', 'delayed', 'delivered', 'bounced', 'failed', 'suppressed', 'complained')),
  occurred_at INTEGER NOT NULL
) STRICT;
