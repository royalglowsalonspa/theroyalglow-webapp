CREATE TABLE invoice_line_tax_fact (
  invoice_id TEXT NOT NULL REFERENCES invoice_register_fact(invoice_id),
  received_at INTEGER NOT NULL CHECK (received_at >= 0),
  line_number INTEGER NOT NULL CHECK (line_number BETWEEN 1 AND 60),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  service_id TEXT,
  tax_version_id TEXT,
  sac_code TEXT,
  rate_bps INTEGER CHECK (rate_bps BETWEEN 0 AND 2800),
  gems_covered INTEGER NOT NULL CHECK (gems_covered IN (0, 1)),
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
  line_amount_paise INTEGER NOT NULL CHECK (line_amount_paise >= 0),
  discount_paise INTEGER CHECK (discount_paise >= 0),
  taxable_value_paise INTEGER CHECK (taxable_value_paise >= 0),
  cgst_paise INTEGER CHECK (cgst_paise >= 0),
  sgst_paise INTEGER CHECK (sgst_paise >= 0),
  gst_paise INTEGER CHECK (gst_paise >= 0),
  PRIMARY KEY (invoice_id, line_number)
) STRICT;

ALTER TABLE invoice_register_export ADD COLUMN report_kind TEXT NOT NULL DEFAULT 'invoice'
  CHECK (report_kind IN ('invoice', 'line_tax'));
ALTER TABLE invoice_register_export ADD COLUMN line_count INTEGER CHECK (line_count >= 0);
ALTER TABLE invoice_register_export ADD COLUMN incomplete_line_count INTEGER
  CHECK (incomplete_line_count IS NULL OR
    (line_count IS NOT NULL AND incomplete_line_count BETWEEN 0 AND line_count));
