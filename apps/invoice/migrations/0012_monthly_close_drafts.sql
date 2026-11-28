CREATE TABLE invoice_monthly_close_draft (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES invoice_access_branch(branch_id),
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
    AND substr(month, 1, 4) <> '0000' AND substr(month, 6, 2) BETWEEN '01' AND '12'),
  version INTEGER NOT NULL CHECK (version > 0),
  captured_at INTEGER NOT NULL CHECK (captured_at >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= captured_at),
  created_by TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  UNIQUE (branch_id, month, version)
) STRICT;

CREATE TABLE invoice_monthly_close_download (
  id TEXT PRIMARY KEY NOT NULL,
  draft_id TEXT NOT NULL REFERENCES invoice_monthly_close_draft(id),
  actor_email TEXT NOT NULL,
  file TEXT NOT NULL CHECK (file IN ('package.json', 'invoice-register.csv', 'line-tax-register.csv')),
  downloaded_at INTEGER NOT NULL CHECK (downloaded_at >= 0)
) STRICT;

CREATE INDEX invoice_monthly_close_download_draft
  ON invoice_monthly_close_download (draft_id, downloaded_at DESC);
