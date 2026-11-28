CREATE TABLE invoice_cash_close_approval (
  draft_id TEXT PRIMARY KEY NOT NULL REFERENCES invoice_cash_close_draft(id) ON DELETE RESTRICT,
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL CHECK (approved_at >= 0),
  note TEXT NOT NULL CHECK (length(note) <= 500)
) STRICT;
