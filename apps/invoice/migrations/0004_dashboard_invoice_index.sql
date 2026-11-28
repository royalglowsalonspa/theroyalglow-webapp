CREATE INDEX issued_invoice_branch_period ON issued_invoice (branch_id, rtrim(issued_at, 'Z'), id);
