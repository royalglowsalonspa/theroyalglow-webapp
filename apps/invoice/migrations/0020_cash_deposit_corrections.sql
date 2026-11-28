CREATE TABLE invoice_cash_deposit_corrections (
  id INTEGER PRIMARY KEY,
  request_id TEXT UNIQUE,
  source TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  day TEXT NOT NULL,
  draft_id TEXT NOT NULL REFERENCES invoice_cash_close_approval(draft_id) ON DELETE RESTRICT,
  credited_on TEXT NOT NULL CHECK (date(credited_on, '+0 days') IS credited_on AND credited_on >= day),
  reference TEXT NOT NULL CHECK (length(reference) BETWEEN 4 AND 80 AND reference = upper(trim(reference))),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL CHECK (recorded_at >= 0),
  voided_by TEXT,
  voided_at INTEGER,
  void_reason TEXT,
  CHECK ((voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR (voided_by IS NOT NULL AND voided_at IS NOT NULL AND voided_at >= recorded_at
      AND void_reason IS NOT NULL AND length(trim(void_reason)) BETWEEN 1 AND 500))
) STRICT;

INSERT INTO invoice_cash_deposit_corrections
  (source, branch_id, day, draft_id, credited_on, reference, amount_paise, recorded_by, recorded_at)
SELECT source, branch_id, day, draft_id, credited_on, reference, amount_paise, recorded_by, recorded_at
FROM invoice_cash_deposit_evidence;

DROP TABLE invoice_cash_deposit_evidence;

ALTER TABLE invoice_cash_deposit_corrections RENAME TO invoice_cash_deposit_evidence;

CREATE UNIQUE INDEX invoice_cash_deposit_active_day
  ON invoice_cash_deposit_evidence (source, branch_id, day) WHERE voided_at IS NULL;

CREATE UNIQUE INDEX invoice_cash_deposit_active_reference
  ON invoice_cash_deposit_evidence (source, reference) WHERE voided_at IS NULL;

CREATE INDEX invoice_cash_deposit_day_history
  ON invoice_cash_deposit_evidence (source, branch_id, day, voided_at DESC, id DESC);
