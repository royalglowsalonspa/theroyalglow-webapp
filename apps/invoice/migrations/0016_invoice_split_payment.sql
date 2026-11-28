ALTER TABLE invoice_register_fact ADD COLUMN has_split_payment INTEGER NOT NULL DEFAULT 0
  CHECK (has_split_payment IN (0, 1));
