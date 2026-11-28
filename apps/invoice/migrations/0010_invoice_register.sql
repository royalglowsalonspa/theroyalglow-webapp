CREATE TABLE invoice_register_fact (
  invoice_id TEXT PRIMARY KEY NOT NULL REFERENCES issued_invoice(id),
  received_at INTEGER NOT NULL CHECK (received_at >= 0),
  issuer_name TEXT NOT NULL,
  issuer_gstin TEXT,
  invoice_type TEXT CHECK (invoice_type IN ('service', 'membership_purchase', 'membership_session')),
  payment_status_at_issue TEXT CHECK (payment_status_at_issue = 'paid'),
  tax_review_status TEXT CHECK (tax_review_status IN ('provisional', 'reviewed')),
  financial_year TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card', 'online')),
  subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  discount_paise INTEGER NOT NULL CHECK (discount_paise >= 0),
  taxable_value_paise INTEGER NOT NULL CHECK (taxable_value_paise >= 0),
  cgst_paise INTEGER NOT NULL CHECK (cgst_paise >= 0),
  sgst_paise INTEGER NOT NULL CHECK (sgst_paise >= 0),
  gst_paise INTEGER NOT NULL CHECK (gst_paise >= 0)
) STRICT;

CREATE TABLE invoice_register_export (
  id TEXT PRIMARY KEY NOT NULL,
  actor_email TEXT NOT NULL,
  source TEXT NOT NULL,
  month TEXT NOT NULL,
  branch_id TEXT,
  generated_at INTEGER NOT NULL CHECK (generated_at >= 0),
  latest_received_at INTEGER CHECK (latest_received_at >= 0),
  invoice_count INTEGER NOT NULL CHECK (invoice_count >= 0),
  missing_facts_count INTEGER NOT NULL CHECK (missing_facts_count BETWEEN 0 AND invoice_count),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0)
) STRICT;
