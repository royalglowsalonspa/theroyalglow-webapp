-- A correction keeps the booking, its original hold, and its invoice as issued.
-- Membership totals include both the consumed holds and the correction notes.
CREATE OR REPLACE FUNCTION membership_minutes_balanced_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target text;
  m spa_membership%ROWTYPE;
  held_sum bigint;
  used_sum bigint;
BEGIN
  IF ledger_fixture() THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'spa_membership' THEN
    target := NEW.id;
  ELSIF TG_TABLE_NAME = 'membership_correction' THEN
    target := NEW.membership_id;
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD.spa_membership_id;
  ELSE
    target := NEW.spa_membership_id;
  END IF;
  SELECT * INTO m FROM spa_membership WHERE id = target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(sum(minutes) FILTER (WHERE state = 'held'), 0),
         coalesce(sum(minutes) FILTER (WHERE state = 'consumed'), 0)
    INTO held_sum, used_sum FROM membership_hold WHERE spa_membership_id = target;
  used_sum := used_sum - coalesce((SELECT sum(available_minutes_delta)
    FROM membership_correction WHERE membership_id = target), 0);
  IF m.reserved_minutes <> held_sum OR m.used_hours_minutes <> used_sum THEN
    RAISE EXCEPTION 'membership minutes differ from its holds and corrections'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_minutes_balanced';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION assert_membership_correction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  m spa_membership%ROWTYPE;
  original settlement_entry%ROWTYPE;
  original_minutes integer;
  available_adjusted bigint;
  resulting_used bigint;
  selling_branch text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF ledger_fixture() THEN RETURN OLD; END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'membership corrections are append-only'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_correction_immutable';
  END IF;
  PERFORM 1 FROM "user" WHERE id = NEW.performed_by AND role = 'developer' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership correction requires a Developer'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_correction_actor';
  END IF;
  SELECT * INTO m FROM spa_membership WHERE id = NEW.membership_id FOR UPDATE;
  IF NOT FOUND OR m.status = 'cancelled' THEN
    RAISE EXCEPTION 'membership cannot be corrected'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_correction_target';
  END IF;

  SELECT h.minutes INTO original_minutes FROM membership_hold h
  JOIN booking b ON b.id = h.booking_id AND b.spa_membership_id = h.spa_membership_id
  JOIN invoice i ON i.booking_id = b.id AND i.branch_id = b.branch_id
  WHERE b.id = NEW.booking_id AND b.branch_id = NEW.branch_id AND b.status = 'completed'
    AND b.is_membership_session AND b.customer_id = m.customer_id
    AND session_start_instant(b.started_at, b.booking_date, b.start_time) BETWEEN m.starts_at AND m.expires_at
    AND h.branch_id = NEW.branch_id AND h.spa_membership_id = m.id AND h.state = 'consumed'
    AND i.id = NEW.original_invoice_id AND i.customer_id = m.customer_id
    AND i.invoice_type = 'membership_session' AND i.total_amount_paise = 0;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an issued zero-charge invoice must match the completed session and branch'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_correction_target';
  END IF;

  resulting_used := m.used_hours_minutes::bigint - NEW.available_minutes_delta;
  SELECT coalesce(sum(available_minutes_delta), 0) + NEW.available_minutes_delta
    INTO available_adjusted FROM membership_correction WHERE booking_id = NEW.booking_id;
  IF resulting_used < 0 OR resulting_used + m.reserved_minutes > m.total_hours_minutes
     OR original_minutes - available_adjusted NOT BETWEEN 0 AND greatest(original_minutes, 480) THEN
    RAISE EXCEPTION 'corrected minutes exceed the session or unreserved membership balance'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_correction_balance';
  END IF;

  selling_branch := coalesce(m.selling_branch_id,
    (SELECT i.branch_id FROM invoice i WHERE i.id = m.invoice_id), NEW.branch_id);
  SELECT * INTO original FROM settlement_entry
  WHERE booking_id = NEW.booking_id AND kind = 'membership_session'
    AND spa_membership_id = m.id AND owing_branch_id = selling_branch AND owed_branch_id = NEW.branch_id
  FOR UPDATE;
  IF (original.id IS NULL AND selling_branch <> NEW.branch_id)
     OR EXISTS (SELECT 1 FROM settlement_entry WHERE reverses_entry_id = original.id) THEN
    RAISE EXCEPTION 'the original settlement is missing or reversed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_correction_settlement_reversed';
  END IF;
  NEW.performed_at := now();
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION apply_membership_correction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  m spa_membership%ROWTYPE;
  original settlement_entry%ROWTYPE;
  before_used bigint;
  invoice_gst bigint;
  value_delta bigint;
  gst_delta bigint;
BEGIN
  UPDATE spa_membership SET used_hours_minutes = used_hours_minutes - NEW.available_minutes_delta,
    updated_at = NEW.performed_at WHERE id = NEW.membership_id RETURNING * INTO m;
  before_used := m.used_hours_minutes + NEW.available_minutes_delta;
  SELECT * INTO original FROM settlement_entry
  WHERE booking_id = NEW.booking_id AND kind = 'membership_session' AND owing_branch_id <> owed_branch_id;
  IF FOUND THEN
    invoice_gst := coalesce((SELECT gst_amount_paise FROM invoice WHERE id = m.invoice_id), 0);
    value_delta := (m.price_paid_paise::bigint * m.used_hours_minutes) / m.total_hours_minutes
                 - (m.price_paid_paise::bigint * before_used) / m.total_hours_minutes;
    gst_delta := (invoice_gst * m.used_hours_minutes) / m.total_hours_minutes
               - (invoice_gst * before_used) / m.total_hours_minutes;
    INSERT INTO settlement_entry (kind, owing_branch_id, owed_branch_id, spa_membership_id,
      booking_id, membership_correction_id, minutes, value_paise, gst_share_paise,
      amount_owed_paise, share_bps, note, created_by)
    VALUES ('membership_correction', original.owing_branch_id, original.owed_branch_id, m.id,
      NEW.booking_id, NEW.id, -NEW.available_minutes_delta, value_delta, gst_delta,
      (value_delta - gst_delta) * original.share_bps / 10000,
      original.share_bps, NEW.reason, NEW.performed_by);
  END IF;
  INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, branch_id, old_values, new_values, created_at)
  VALUES (gen_random_uuid()::text, NEW.performed_by, 'create', 'membership_correction', NEW.id, NEW.branch_id,
    jsonb_build_object('usedMinutes', before_used),
    jsonb_build_object('usedMinutes', m.used_hours_minutes, 'membershipId', m.id, 'bookingId', NEW.booking_id,
      'originalInvoiceId', NEW.original_invoice_id, 'availableMinutesDelta', NEW.available_minutes_delta,
      'reason', NEW.reason, 'evidenceReference', NEW.evidence_reference), NEW.performed_at);
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION assert_membership_correction_settlement()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  original settlement_entry%ROWTYPE;
BEGIN
  IF NEW.kind::text = 'membership_correction' AND pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'settlement adjustments are posted by the membership correction'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'settlement_membership_correction_link';
  END IF;
  IF NEW.kind = 'reversal' THEN
    SELECT * INTO original FROM settlement_entry WHERE id = NEW.reverses_entry_id FOR UPDATE;
    IF original.kind::text = 'membership_correction' OR (original.kind = 'membership_session'
       AND EXISTS (SELECT 1 FROM membership_correction WHERE booking_id = original.booking_id)) THEN
      RAISE EXCEPTION 'use a membership correction to adjust this session again'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'settlement_membership_correction_link';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER membership_correction_guard
BEFORE INSERT OR UPDATE OR DELETE ON membership_correction
FOR EACH ROW EXECUTE FUNCTION assert_membership_correction();--> statement-breakpoint

CREATE TRIGGER membership_correction_apply AFTER INSERT ON membership_correction
FOR EACH ROW EXECUTE FUNCTION apply_membership_correction();--> statement-breakpoint

CREATE CONSTRAINT TRIGGER membership_minutes_balanced_correction AFTER INSERT ON membership_correction
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION membership_minutes_balanced_check();--> statement-breakpoint

CREATE TRIGGER settlement_entry_membership_correction_guard BEFORE INSERT ON settlement_entry
FOR EACH ROW EXECUTE FUNCTION assert_membership_correction_settlement();
