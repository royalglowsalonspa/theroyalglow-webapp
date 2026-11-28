CREATE TABLE invoice_accountant_settlement_grant (
  email TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  PRIMARY KEY (email, branch_id),
  FOREIGN KEY (email, branch_id) REFERENCES invoice_grant (email, branch_id) ON DELETE CASCADE
) STRICT;

CREATE TRIGGER invoice_clear_accountant_settlement_grant
AFTER UPDATE OF role ON invoice_grant
WHEN OLD.role = 'accountant' AND NEW.role <> 'accountant'
BEGIN
  DELETE FROM invoice_accountant_settlement_grant WHERE email = OLD.email AND branch_id = OLD.branch_id;
END;

CREATE TABLE invoice_settlement_grant_change (
  id TEXT PRIMARY KEY NOT NULL,
  actor TEXT NOT NULL,
  email TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES invoice_access_branch (branch_id),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE INDEX invoice_settlement_grant_history ON invoice_settlement_grant_change(branch_id, changed_at DESC);

CREATE VIEW invoice_settlement_access AS
SELECT g.email, g.branch_id, g.role
FROM invoice_effective_grant AS g
WHERE g.role IN ('owner', 'manager') OR (
  g.role = 'accountant' AND EXISTS (
    SELECT 1 FROM invoice_accountant_settlement_grant AS s
    WHERE s.email = g.email AND s.branch_id = g.branch_id
  )
);
