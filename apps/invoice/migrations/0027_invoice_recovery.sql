ALTER TABLE issued_invoice ADD COLUMN recovered_from_outbox INTEGER NOT NULL DEFAULT 0
  CHECK (recovered_from_outbox IN (0, 1));
