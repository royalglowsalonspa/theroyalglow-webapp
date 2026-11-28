CREATE TABLE invoice_monthly_close_review (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36
    AND id GLOB '????????-????-4???-[89ab]???-????????????'
    AND length(replace(id, '-', '')) = 32 AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  draft_id TEXT NOT NULL REFERENCES invoice_monthly_close_draft(id),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  actor_email TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('reviewed', 'changes_requested')),
  note TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 500
    AND length(trim(note, ' ' || char(9, 10, 13))) > 0),
  recorded_at INTEGER NOT NULL CHECK (recorded_at >= 0)
) STRICT;

CREATE INDEX invoice_monthly_close_review_draft
  ON invoice_monthly_close_review (draft_id, recorded_at DESC, id DESC);
