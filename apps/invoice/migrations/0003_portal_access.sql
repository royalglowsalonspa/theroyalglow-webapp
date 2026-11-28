CREATE TABLE invoice_access_branch (
  branch_id TEXT PRIMARY KEY NOT NULL
) STRICT;

INSERT INTO invoice_access_branch SELECT DISTINCT branch_id FROM invoice_grant;

-- Only the trusted branch roster importer or setup operator writes these assignments.
CREATE TABLE invoice_staff_assignment (
  email TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES invoice_access_branch(branch_id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager')),
  PRIMARY KEY (email, branch_id, role)
) STRICT;

CREATE VIEW invoice_effective_grant AS
SELECT g.email, g.branch_id, g.role FROM invoice_grant AS g
JOIN invoice_access_branch AS b ON b.branch_id = g.branch_id
WHERE g.role = 'accountant' OR EXISTS (
  SELECT 1 FROM invoice_staff_assignment AS s
  WHERE s.email = g.email AND s.branch_id = g.branch_id AND s.role = g.role
);

CREATE INDEX invoice_grant_by_branch ON invoice_grant(branch_id, email);

CREATE TABLE invoice_grant_change (
  id TEXT PRIMARY KEY NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor TEXT NOT NULL,
  email TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES invoice_access_branch(branch_id),
  old_role TEXT CHECK (old_role IN ('owner', 'manager', 'accountant')),
  new_role TEXT CHECK (new_role IN ('owner', 'manager', 'accountant')),
  CHECK (old_role IS NOT new_role)
) STRICT;

CREATE INDEX invoice_grant_history ON invoice_grant_change(branch_id, changed_at DESC);

-- Last confirmed Cloudflare policy membership. Authorization always uses current grants.
CREATE TABLE invoice_access_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  members_json TEXT NOT NULL DEFAULT '[]',
  checked_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed'))
) STRICT;
INSERT INTO invoice_access_sync(id, status) VALUES (1, 'pending');
