CREATE TABLE invoice_supplier_bill (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  supplier TEXT NOT NULL CHECK (length(trim(supplier)) BETWEEN 1 AND 120),
  bill_number TEXT NOT NULL CHECK (length(trim(bill_number)) BETWEEN 1 AND 80),
  billed_on TEXT NOT NULL CHECK (date(billed_on, '+0 days') IS billed_on),
  category TEXT NOT NULL CHECK (category IN ('consumables', 'rent', 'utilities', 'other')),
  total_paise INTEGER NOT NULL CHECK (total_paise BETWEEN 1 AND 9999999999),
  gst_paise INTEGER CHECK (gst_paise BETWEEN 0 AND total_paise),
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL CHECK (recorded_at >= 0),
  voided_by TEXT,
  voided_at INTEGER,
  void_reason TEXT,
  CHECK ((voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR (voided_by IS NOT NULL AND voided_at IS NOT NULL AND voided_at >= recorded_at
      AND void_reason IS NOT NULL AND length(trim(void_reason)) BETWEEN 1 AND 500))
) STRICT;

CREATE UNIQUE INDEX invoice_supplier_bill_active_identity
  ON invoice_supplier_bill (source, branch_id, lower(supplier), lower(bill_number),
    (CAST(substr(billed_on, 1, 4) AS INTEGER) - (substr(billed_on, 6, 2) < '04')))
  WHERE voided_at IS NULL;

CREATE INDEX invoice_supplier_bill_period
  ON invoice_supplier_bill (source, branch_id, billed_on DESC, id DESC);

CREATE TABLE invoice_supplier_payment (
  id TEXT PRIMARY KEY NOT NULL,
  bill_id TEXT NOT NULL REFERENCES invoice_supplier_bill(id) ON DELETE RESTRICT,
  paid_on TEXT NOT NULL CHECK (date(paid_on, '+0 days') IS paid_on),
  method TEXT NOT NULL CHECK (method IN ('cash', 'upi', 'card', 'bank_transfer')),
  reference TEXT CHECK (length(reference) BETWEEN 1 AND 100),
  amount_paise INTEGER NOT NULL CHECK (amount_paise BETWEEN 1 AND 9999999999),
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL CHECK (recorded_at >= 0),
  voided_by TEXT,
  voided_at INTEGER,
  void_reason TEXT,
  CHECK (method = 'cash' OR reference IS NOT NULL),
  CHECK ((voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR (voided_by IS NOT NULL AND voided_at IS NOT NULL AND voided_at >= recorded_at
      AND void_reason IS NOT NULL AND length(trim(void_reason)) BETWEEN 1 AND 500))
) STRICT;

CREATE INDEX invoice_supplier_payment_bill_history
  ON invoice_supplier_payment (bill_id, paid_on DESC, id DESC);

CREATE UNIQUE INDEX invoice_supplier_payment_active_reference
  ON invoice_supplier_payment (bill_id, method, lower(reference))
  WHERE voided_at IS NULL AND reference IS NOT NULL;

CREATE TABLE invoice_supplier_bill_evidence (
  bill_id TEXT PRIMARY KEY NOT NULL REFERENCES invoice_supplier_bill(id) ON DELETE RESTRICT,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 5 AND 1048576),
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL CHECK (recorded_at >= 0)
) STRICT;

CREATE TABLE invoice_supplier_register_export (
  id TEXT PRIMARY KEY NOT NULL,
  actor_email TEXT NOT NULL,
  source TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  month TEXT NOT NULL,
  generated_at INTEGER NOT NULL CHECK (generated_at >= 0),
  row_count INTEGER NOT NULL CHECK (row_count BETWEEN 0 AND 500),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*')
) STRICT;
