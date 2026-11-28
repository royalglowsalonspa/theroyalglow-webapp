CREATE INDEX issued_invoice_period_branch ON issued_invoice (rtrim(issued_at, 'Z'), branch_id);
