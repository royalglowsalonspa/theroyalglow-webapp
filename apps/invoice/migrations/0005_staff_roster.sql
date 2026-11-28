CREATE TABLE invoice_roster_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  body_hash TEXT NOT NULL,
  received_at TEXT
) STRICT;

INSERT INTO invoice_roster_state (id, revision, body_hash) VALUES (1, 0, '');
