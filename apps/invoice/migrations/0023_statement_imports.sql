CREATE TABLE invoice_statement_import (
  id TEXT PRIMARY KEY NOT NULL,
  branch_id TEXT NOT NULL REFERENCES invoice_access_branch(branch_id) ON DELETE RESTRICT,
  account TEXT NOT NULL CHECK (length(account) BETWEEN 1 AND 40 AND account = upper(account)),
  digest TEXT NOT NULL CHECK (length(digest) = 64 AND digest NOT GLOB '*[^a-f0-9]*'),
  row_count INTEGER NOT NULL CHECK (row_count BETWEEN 1 AND 100),
  imported_by TEXT NOT NULL,
  imported_at INTEGER NOT NULL CHECK (imported_at >= 0),
  UNIQUE (branch_id, account, digest),
  UNIQUE (id, branch_id, account)
) STRICT;

CREATE INDEX invoice_statement_import_history
  ON invoice_statement_import (branch_id, imported_at DESC, id DESC);

CREATE TABLE invoice_statement_entry (
  import_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  account TEXT NOT NULL,
  reference TEXT NOT NULL CHECK (length(reference) BETWEEN 4 AND 80 AND reference = upper(reference)),
  posted_on TEXT NOT NULL CHECK (date(posted_on, '+0 days') IS posted_on AND posted_on >= '0001-01-01'),
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise BETWEEN 1 AND 9999999999),
  PRIMARY KEY (branch_id, account, reference),
  FOREIGN KEY (import_id, branch_id, account)
    REFERENCES invoice_statement_import (id, branch_id, account) ON DELETE RESTRICT
) STRICT;

CREATE INDEX invoice_statement_entry_by_import
  ON invoice_statement_entry (import_id, posted_on, reference);
