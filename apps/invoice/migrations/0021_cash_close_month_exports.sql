CREATE TABLE invoice_cash_close_month_export (
  id TEXT PRIMARY KEY NOT NULL,
  actor_email TEXT NOT NULL,
  source TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES invoice_access_branch(branch_id),
  month TEXT NOT NULL CHECK (month GLOB '[1-9][0-9][0-9][0-9]-[0-9][0-9]'
    AND substr(month, 6, 2) BETWEEN '01' AND '12'),
  generated_at INTEGER NOT NULL CHECK (generated_at >= 0),
  source_observed_at INTEGER CHECK (source_observed_at >= 0),
  row_count INTEGER NOT NULL CHECK (row_count BETWEEN 0 AND 31),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*')
) STRICT;
