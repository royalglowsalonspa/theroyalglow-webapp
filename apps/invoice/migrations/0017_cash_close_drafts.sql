CREATE TABLE invoice_cash_close_draft (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES invoice_access_branch(branch_id),
  day TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  observed_at INTEGER NOT NULL CHECK (observed_at >= 0),
  service_cash_paise INTEGER NOT NULL CHECK (service_cash_paise >= 0),
  opening_paise INTEGER NOT NULL CHECK (opening_paise >= 0),
  other_receipts_paise INTEGER NOT NULL CHECK (other_receipts_paise >= 0),
  refunds_paise INTEGER NOT NULL CHECK (refunds_paise >= 0),
  payouts_paise INTEGER NOT NULL CHECK (payouts_paise >= 0),
  deposits_paise INTEGER NOT NULL CHECK (deposits_paise >= 0),
  counted_paise INTEGER NOT NULL CHECK (counted_paise >= 0),
  expected_paise INTEGER NOT NULL CHECK (expected_paise >= 0 AND expected_paise =
    opening_paise + service_cash_paise + other_receipts_paise - refunds_paise - payouts_paise - deposits_paise),
  variance_paise INTEGER NOT NULL CHECK (variance_paise = counted_paise - expected_paise),
  note TEXT NOT NULL CHECK (length(note) <= 500 AND ((revision = 1 AND variance_paise = 0) OR length(trim(note)) > 0)),
  recorded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE (source, branch_id, day, revision)
) STRICT;
