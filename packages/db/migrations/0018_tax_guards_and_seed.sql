-- 0018: guards and seed data for branch tax versions and invoice snapshots
-- (multi-branch R6, tax-settings.md §2). Hand-written; reviewed before use.
-- Rerunnable statements only (CREATE OR REPLACE, ON CONFLICT DO NOTHING,
-- guarded updates), so a partial rehearsal can be repeated.

-- 1. A branch inserted without an invoice prefix gets the default one.
CREATE OR REPLACE FUNCTION branch_invoice_prefix_default()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoice_prefix IS NULL THEN
    NEW.invoice_prefix := branch_default_invoice_prefix(NEW.number);
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS branch_invoice_prefix_default ON branch;--> statement-breakpoint
CREATE TRIGGER branch_invoice_prefix_default
  BEFORE INSERT ON branch
  FOR EACH ROW EXECUTE FUNCTION branch_invoice_prefix_default();--> statement-breakpoint

-- 2. Once a branch has numbered an invoice, its prefix is fixed: changing it
--    would make two numbering series for one counter.
CREATE OR REPLACE FUNCTION branch_invoice_prefix_fixed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoice_prefix IS DISTINCT FROM OLD.invoice_prefix
     AND EXISTS (SELECT 1 FROM invoice_sequence s WHERE s.branch_id = OLD.id) THEN
    RAISE EXCEPTION 'branch % has issued invoices, so its invoice prefix % is fixed',
      OLD.id, OLD.invoice_prefix
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS branch_invoice_prefix_fixed ON branch;--> statement-breakpoint
CREATE TRIGGER branch_invoice_prefix_fixed
  BEFORE UPDATE OF invoice_prefix ON branch
  FOR EACH ROW EXECUTE FUNCTION branch_invoice_prefix_fixed();--> statement-breakpoint

-- 3. Category tax classifications from the provisional table (tax-settings.md
--    §1), by the seeded category slugs. A service without its own code uses its
--    category's. Payload takes these over with the CMS field (tasks §6).
UPDATE service_category
   SET sac_code = CASE slug
     WHEN 'haircut-styling' THEN '999721'
     WHEN 'hair-colouring-treatment' THEN '999721'
     WHEN 'hair-spa-head-therapies' THEN '999721'
     WHEN 'facial-skincare' THEN '999722'
     WHEN 'manicure-pedicure' THEN '999722'
     WHEN 'makeup-services' THEN '999722'
     WHEN 'waxing' THEN '999729'
     WHEN 'standard-spa' THEN '999723'
     WHEN 'premium-spa' THEN '999723'
     WHEN 'vvip-spa' THEN '999723'
   END
 WHERE sac_code IS NULL
   AND slug IN ('haircut-styling', 'hair-colouring-treatment', 'hair-spa-head-therapies',
                'facial-skincare', 'manicure-pedicure', 'makeup-services', 'waxing',
                'standard-spa', 'premium-spa', 'vvip-spa');--> statement-breakpoint

-- 4. Provisional development rates for every branch: 5% total GST without ITC
--    for each reviewed SAC code, in force since 22 September 2025 00:00 IST
--    (the official FAQ's effective date). Review before live invoicing (TX-10).
INSERT INTO branch_tax_version (id, branch_id, sac_code, rate_bps, prices_include_tax,
                                effective_from, review_status, reason)
SELECT 'tax_' || b.id || '_' || s.code, b.id, s.code, 500, true,
       timestamptz '2025-09-22 00:00:00+05:30', 'provisional',
       'Provisional development rate: 5% GST without ITC (tax-settings.md §1). Review before live invoicing.'
  FROM branch b
 CROSS JOIN (VALUES ('999721'), ('999722'), ('999723'), ('999729')) AS s(code)
    ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 5. A branch created later gets provisional copies of the rates in force at
--    the primary branch, starting 00:00 IST on its creation day, so it can
--    invoice in testing; live invoicing still needs them reviewed (TX-08).
CREATE OR REPLACE FUNCTION branch_copy_tax_versions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  primary_branch_id text;
  primary_name text;
BEGIN
  SELECT id, name INTO primary_branch_id, primary_name
    FROM branch
   WHERE is_primary AND id <> NEW.id
   ORDER BY display_order, id
   LIMIT 1;
  IF primary_branch_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO branch_tax_version (id, branch_id, sac_code, rate_bps, prices_include_tax,
                                  effective_from, review_status, reason)
  SELECT 'tax_' || NEW.id || '_' || v.sac_code, NEW.id, v.sac_code, v.rate_bps, true,
         date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata',
         'provisional',
         'Copied from ' || primary_name || ' when the branch was created; review before live invoicing.'
    FROM (
      SELECT DISTINCT ON (sac_code) sac_code, rate_bps
        FROM branch_tax_version
       WHERE branch_id = primary_branch_id AND effective_from <= now()
       ORDER BY sac_code, effective_from DESC
    ) v
      ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS branch_copy_tax_versions ON branch;--> statement-breakpoint
CREATE TRIGGER branch_copy_tax_versions
  AFTER INSERT ON branch
  FOR EACH ROW EXECUTE FUNCTION branch_copy_tax_versions();--> statement-breakpoint

-- 6. A version is fixed once created; only its launch review is recorded
--    (provisional → reviewed). A version already in force can't be deleted:
--    that would change today's rate retroactively. Deleting the branch
--    (allowed only while it has no invoices) removes its versions.
CREATE OR REPLACE FUNCTION branch_tax_version_fixed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.effective_from <= now()
       AND EXISTS (SELECT 1 FROM branch b WHERE b.id = OLD.branch_id) THEN
      RAISE EXCEPTION 'tax version % is in force and can''t be deleted; add a new rate instead', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.branch_id, NEW.sac_code, NEW.rate_bps, NEW.prices_include_tax, NEW.effective_from,
      NEW.reason, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.branch_id, OLD.sac_code, OLD.rate_bps, OLD.prices_include_tax, OLD.effective_from,
      OLD.reason, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'tax version % can''t change; add a new rate instead', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.review_status = 'reviewed' AND NEW.review_status IS DISTINCT FROM OLD.review_status THEN
    RAISE EXCEPTION 'tax version % is already reviewed', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS branch_tax_version_fixed ON branch_tax_version;--> statement-breakpoint
CREATE TRIGGER branch_tax_version_fixed
  BEFORE UPDATE OR DELETE ON branch_tax_version
  FOR EACH ROW EXECUTE FUNCTION branch_tax_version_fixed();--> statement-breakpoint

-- 7. Every invoice issued from now on carries its issue snapshot (R6.1).
--    Invoices issued before this migration keep their header-only facts.
CREATE OR REPLACE FUNCTION invoice_requires_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tax_point_at IS NULL THEN
    RAISE EXCEPTION 'invoice % is missing its issue snapshot', NEW.invoice_number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS invoice_requires_snapshot ON invoice;--> statement-breakpoint
CREATE TRIGGER invoice_requires_snapshot
  BEFORE INSERT ON invoice
  FOR EACH ROW EXECUTE FUNCTION invoice_requires_snapshot();--> statement-breakpoint

-- 8. An issued invoice's facts never change: number, issuer, tax point,
--    classification and every amount (TX-05). Payment details, the PDF URL
--    and notes may still be recorded.
CREATE OR REPLACE FUNCTION invoice_snapshot_fixed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.tax_point_at IS NOT NULL
     AND (NEW.invoice_number, NEW.branch_id, NEW.booking_id, NEW.customer_id, NEW.invoice_type,
          NEW.subtotal_paise, NEW.discount_amount_paise, NEW.taxable_value_paise,
          NEW.gst_amount_paise, NEW.cgst_paise, NEW.sgst_paise, NEW.total_amount_paise,
          NEW.gems_earned, NEW.gems_redeemed, NEW.gems_redeemed_service_id,
          NEW.tax_point_at, NEW.financial_year, NEW.sequence_number, NEW.tax_review_status,
          NEW.issuer_name, NEW.issuer_legal_name, NEW.issuer_gstin, NEW.issuer_address,
          NEW.issuer_state)
         IS DISTINCT FROM
         (OLD.invoice_number, OLD.branch_id, OLD.booking_id, OLD.customer_id, OLD.invoice_type,
          OLD.subtotal_paise, OLD.discount_amount_paise, OLD.taxable_value_paise,
          OLD.gst_amount_paise, OLD.cgst_paise, OLD.sgst_paise, OLD.total_amount_paise,
          OLD.gems_earned, OLD.gems_redeemed, OLD.gems_redeemed_service_id,
          OLD.tax_point_at, OLD.financial_year, OLD.sequence_number, OLD.tax_review_status,
          OLD.issuer_name, OLD.issuer_legal_name, OLD.issuer_gstin, OLD.issuer_address,
          OLD.issuer_state) THEN
    RAISE EXCEPTION 'invoice % is issued; its facts can''t change', OLD.invoice_number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS invoice_snapshot_fixed ON invoice;--> statement-breakpoint
CREATE TRIGGER invoice_snapshot_fixed
  BEFORE UPDATE ON invoice
  FOR EACH ROW EXECUTE FUNCTION invoice_snapshot_fixed();--> statement-breakpoint

-- 9. A snapshotted invoice's lines use the rate in force for their SAC code at
--    the invoice's branch and tax point, and never change afterwards.
CREATE OR REPLACE FUNCTION invoice_item_tax_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  inv_branch text;
  inv_tax_point timestamptz;
  v_branch text;
  v_sac text;
  v_rate integer;
  v_from timestamptz;
BEGIN
  SELECT branch_id, tax_point_at INTO inv_branch, inv_tax_point
    FROM invoice WHERE id = NEW.invoice_id;
  IF inv_tax_point IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'invoice item % belongs to an issued invoice and can''t change', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.tax_version_id IS NULL THEN
    RAISE EXCEPTION 'invoice item on invoice % has no tax version', NEW.invoice_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT branch_id, sac_code, rate_bps, effective_from INTO v_branch, v_sac, v_rate, v_from
    FROM branch_tax_version WHERE id = NEW.tax_version_id;
  IF v_branch IS DISTINCT FROM inv_branch
     OR v_sac IS DISTINCT FROM NEW.sac_code
     OR v_rate IS DISTINCT FROM NEW.rate_bps
     OR v_from > inv_tax_point
     OR EXISTS (
       SELECT 1 FROM branch_tax_version later
        WHERE later.branch_id = inv_branch
          AND later.sac_code = NEW.sac_code
          AND later.effective_from > v_from
          AND later.effective_from <= inv_tax_point
     ) THEN
    RAISE EXCEPTION 'invoice item on invoice % does not use the rate in force for SAC % at its branch',
      NEW.invoice_id, NEW.sac_code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS invoice_item_tax_guard ON invoice_item;--> statement-breakpoint
CREATE TRIGGER invoice_item_tax_guard
  BEFORE INSERT OR UPDATE ON invoice_item
  FOR EACH ROW EXECUTE FUNCTION invoice_item_tax_guard();--> statement-breakpoint

-- 10. The 18% GST setting is replaced by the branch tax versions (R6.4).
DELETE FROM system_setting WHERE key = 'gst';
