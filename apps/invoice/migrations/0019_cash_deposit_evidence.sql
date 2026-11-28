-- shortcut: one full credit per branch day, add allocations when split bank credits are supported.
CREATE TABLE invoice_cash_deposit_evidence (
  source TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  day TEXT NOT NULL,
  draft_id TEXT NOT NULL UNIQUE REFERENCES invoice_cash_close_approval(draft_id) ON DELETE RESTRICT,
  credited_on TEXT NOT NULL CHECK (date(credited_on, '+0 days') IS credited_on AND credited_on >= day),
  reference TEXT NOT NULL CHECK (length(reference) BETWEEN 4 AND 80 AND reference = upper(trim(reference))),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL CHECK (recorded_at >= 0),
  PRIMARY KEY (source, branch_id, day),
  UNIQUE (source, reference)
) STRICT;
