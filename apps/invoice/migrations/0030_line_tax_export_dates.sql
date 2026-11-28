ALTER TABLE invoice_register_export ADD COLUMN range_from TEXT;
ALTER TABLE invoice_register_export ADD COLUMN range_through TEXT
  CHECK (
    (range_from IS NULL AND range_through IS NULL) OR
    (range_from IS NOT NULL AND range_through IS NOT NULL AND report_kind = 'line_tax'
      AND length(range_from) = 10 AND length(range_through) = 10
      AND substr(range_from, 1, 7) = month AND substr(range_through, 1, 7) = month
      AND range_from <= range_through)
  );
