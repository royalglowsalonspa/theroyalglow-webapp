CREATE TABLE invoice_source_coverage (
  source TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  month TEXT NOT NULL,
  observed_at INTEGER NOT NULL CHECK (observed_at >= 0),
  body TEXT NOT NULL,
  PRIMARY KEY (source, branch_id, month)
) STRICT;
