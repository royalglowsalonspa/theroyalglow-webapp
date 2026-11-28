CREATE TABLE invoice_branch_settlement (
  source TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES invoice_access_branch(branch_id) ON DELETE RESTRICT,
  month TEXT NOT NULL,
  observed_at INTEGER NOT NULL CHECK (observed_at >= 0),
  body TEXT NOT NULL CHECK (json_valid(body)),
  PRIMARY KEY (source, branch_id, month)
) STRICT;
