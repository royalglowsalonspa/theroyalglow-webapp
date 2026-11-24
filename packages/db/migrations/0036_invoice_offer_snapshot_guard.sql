-- Custom SQL migration file, put your code below! --
-- Offers in Payload (multi-branch tasks §6, offers.md). 0035 added the
-- invoice's offer snapshot (`offer_id`, `offer_name_snapshot`,
-- `offer_type_snapshot`, `offer_value_snapshot`). An issued invoice's facts
-- never change (TX-05, 0018): the offer applied and its rule as it was then
-- join them, so a later CMS edit or a retired offer never alters a past
-- invoice. Payment details, the PDF URL and notes may still be recorded.
-- Rerunnable: the function is replaced and the trigger already points at it.
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
          NEW.issuer_state, NEW.offer_id, NEW.offer_name_snapshot, NEW.offer_type_snapshot,
          NEW.offer_value_snapshot)
         IS DISTINCT FROM
         (OLD.invoice_number, OLD.branch_id, OLD.booking_id, OLD.customer_id, OLD.invoice_type,
          OLD.subtotal_paise, OLD.discount_amount_paise, OLD.taxable_value_paise,
          OLD.gst_amount_paise, OLD.cgst_paise, OLD.sgst_paise, OLD.total_amount_paise,
          OLD.gems_earned, OLD.gems_redeemed, OLD.gems_redeemed_service_id,
          OLD.tax_point_at, OLD.financial_year, OLD.sequence_number, OLD.tax_review_status,
          OLD.issuer_name, OLD.issuer_legal_name, OLD.issuer_gstin, OLD.issuer_address,
          OLD.issuer_state, OLD.offer_id, OLD.offer_name_snapshot, OLD.offer_type_snapshot,
          OLD.offer_value_snapshot) THEN
    RAISE EXCEPTION 'invoice % is issued; its facts can''t change', OLD.invoice_number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
