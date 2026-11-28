CREATE TABLE invoice_refund_request (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL REFERENCES issued_invoice(id) ON DELETE RESTRICT,
  snapshot_hash TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash', 'upi', 'card', 'online')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  lines TEXT NOT NULL CHECK (json_valid(lines) AND json_type(lines) = 'array'),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  decision TEXT CHECK (decision IN ('approved', 'rejected')),
  decision_note TEXT CHECK (length(decision_note) BETWEEN 1 AND 500),
  decided_by TEXT,
  decided_at TEXT,
  CHECK ((decision IS NULL AND decision_note IS NULL AND decided_by IS NULL AND decided_at IS NULL)
    OR (decision IS NOT NULL AND decision_note IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
) STRICT;

CREATE INDEX invoice_refund_request_invoice ON invoice_refund_request(invoice_id, requested_at);
CREATE INDEX invoice_refund_request_recent ON invoice_refund_request(requested_at);
