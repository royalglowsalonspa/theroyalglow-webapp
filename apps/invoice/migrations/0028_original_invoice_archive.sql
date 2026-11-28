CREATE TABLE original_invoice_archive (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES invoice_access_branch(branch_id),
  booking_id TEXT,
  booking_number TEXT,
  invoice_number TEXT NOT NULL UNIQUE,
  recorded_at TEXT NOT NULL,
  date_basis TEXT NOT NULL CHECK (date_basis IN ('tax_point', 'created_at')),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^a-f0-9]*'),
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 5 AND 1048576),
  archived_at INTEGER NOT NULL CHECK (archived_at >= 0)
) STRICT;

CREATE INDEX original_invoice_archive_booking_id_idx ON original_invoice_archive(booking_id, branch_id);
CREATE INDEX original_invoice_archive_booking_number_idx ON original_invoice_archive(booking_number, branch_id);
