CREATE TABLE invoice_grant (
  email TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'accountant')),
  PRIMARY KEY (email, branch_id)
) STRICT;

CREATE TABLE issued_invoice (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  booking_id TEXT,
  booking_number TEXT,
  issued_at TEXT NOT NULL,
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  snapshot_hash TEXT NOT NULL,
  snapshot_key TEXT NOT NULL
) STRICT;

CREATE INDEX invoice_booking_id ON issued_invoice (booking_id, branch_id);
CREATE INDEX invoice_booking_number ON issued_invoice (booking_number, branch_id);
