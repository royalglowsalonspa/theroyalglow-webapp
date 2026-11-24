-- 0022: guards, backfill and seed for gems batches and the cross-branch
-- settlement ledger (multi-branch R10, settlement.md, membership-scheduling.md
-- "Cross-branch settlement"). Hand-written; reviewed before use. Rerunnable
-- statements only (CREATE OR REPLACE, guarded updates and inserts), so a
-- partial rehearsal can be repeated.
--
-- 0021 adds the 'returned' gems value in the same migration transaction, so
-- nothing here uses it as an enum literal. The trigger bodies are PL/pgSQL,
-- planned when they first run, which is after the migration commits.

-- 1. Helpers.
--    Test fixtures only: with rgss.ledger_fixture = 'on' for one transaction
--    (set_config(..., true)), ledger rows can be deleted and an entry keeps
--    the month it names. The application never sets it.
CREATE OR REPLACE FUNCTION ledger_fixture()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('rgss.ledger_fixture', true), '') = 'on'
$$;--> statement-breakpoint

-- The IST calendar month of an instant, as the month's first day.
CREATE OR REPLACE FUNCTION settlement_month_of(instant timestamptz)
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT date_trunc('month', instant AT TIME ZONE 'Asia/Kolkata')::date
$$;--> statement-breakpoint

-- A batch's unspent gems: what it earned, less what active redemptions took
-- from it, less what of it has expired (expired amounts are negative).
CREATE OR REPLACE FUNCTION loyalty_batch_unspent(batch text)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT e.gems_amount::bigint
         - coalesce((SELECT sum(a.gems) FROM loyalty_allocation a
                      WHERE a.batch_id = e.id AND a.released_at IS NULL), 0)
         + coalesce((SELECT sum(x.gems_amount) FROM loyalty_transaction x
                      WHERE x.batch_id = e.id AND x.type = 'expired'), 0)
    FROM loyalty_transaction e
   WHERE e.id = batch
$$;--> statement-breakpoint

-- 2. A redemption spends earned gems of its own account that had not expired
--    when it was made, never more than a batch has unspent, and never more
--    than its own amount. Allocations and expiries of one batch take turns on
--    the batch's row, so two redemptions can't spend the same gems (ST-06).
CREATE OR REPLACE FUNCTION loyalty_allocation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  spent loyalty_transaction%ROWTYPE;
  batch loyalty_transaction%ROWTYPE;
  taken bigint;
BEGIN
  SELECT * INTO spent FROM loyalty_transaction t WHERE t.id = NEW.redemption_id;
  SELECT * INTO batch FROM loyalty_transaction t WHERE t.id = NEW.batch_id FOR NO KEY UPDATE;
  IF spent.type::text <> 'redeemed' THEN
    RAISE EXCEPTION 'gems allocation % is for transaction %, which is not a redemption',
      NEW.id, NEW.redemption_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF batch.type::text <> 'earned' OR batch.loyalty_account_id <> spent.loyalty_account_id THEN
    RAISE EXCEPTION 'redemption % can only spend earned gems of its own account', spent.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF batch.expires_at IS NOT NULL AND batch.expires_at <= spent.created_at THEN
    RAISE EXCEPTION 'gems batch % had expired when redemption % was made', batch.id, spent.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'loyalty_batch_expired';
  END IF;
  IF loyalty_batch_unspent(batch.id) < 0 THEN
    RAISE EXCEPTION 'gems batch % would be spent beyond what it earned', batch.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'loyalty_batch_overspent';
  END IF;
  SELECT coalesce(sum(a.gems), 0) INTO taken
    FROM loyalty_allocation a
   WHERE a.redemption_id = spent.id AND a.released_at IS NULL;
  IF taken > spent.gems_amount THEN
    RAISE EXCEPTION 'redemption % of % gems would take % from its batches',
      spent.id, spent.gems_amount, taken
      USING ERRCODE = 'check_violation', CONSTRAINT = 'loyalty_redemption_overallocated';
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS loyalty_allocation_guard ON loyalty_allocation;--> statement-breakpoint
CREATE TRIGGER loyalty_allocation_guard
  AFTER INSERT ON loyalty_allocation
  FOR EACH ROW EXECUTE FUNCTION loyalty_allocation_guard();--> statement-breakpoint

-- An allocation is only ever released, once: the free service didn't happen
-- and its gems went back to the batch.
CREATE OR REPLACE FUNCTION loyalty_allocation_fixed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF ledger_fixture() THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'gems allocation % can''t be deleted; release it instead', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL
     OR (to_jsonb(NEW) - 'released_at') <> (to_jsonb(OLD) - 'released_at') THEN
    RAISE EXCEPTION 'gems allocation % can only be released, once', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS loyalty_allocation_fixed ON loyalty_allocation;--> statement-breakpoint
CREATE TRIGGER loyalty_allocation_fixed
  BEFORE UPDATE OR DELETE ON loyalty_allocation
  FOR EACH ROW EXECUTE FUNCTION loyalty_allocation_fixed();--> statement-breakpoint

-- An expiry names the earned batch it expires, after the batch's expiry, and
-- never takes more than the batch has unspent (ST-04). It is recorded at the
-- batch's branch.
CREATE OR REPLACE FUNCTION loyalty_expiry_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch loyalty_transaction%ROWTYPE;
BEGIN
  IF NEW.batch_id IS NULL THEN
    RAISE EXCEPTION 'an expiry must name the gems batch it expires'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO batch FROM loyalty_transaction t WHERE t.id = NEW.batch_id FOR NO KEY UPDATE;
  IF NOT FOUND OR batch.type::text <> 'earned'
     OR batch.loyalty_account_id <> NEW.loyalty_account_id THEN
    RAISE EXCEPTION 'an expiry can only expire earned gems of its own account'
      USING ERRCODE = 'check_violation';
  END IF;
  IF batch.expires_at IS NULL OR batch.expires_at > NEW.created_at THEN
    RAISE EXCEPTION 'gems batch % has not expired yet', batch.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF loyalty_batch_unspent(batch.id) + NEW.gems_amount < 0 THEN
    RAISE EXCEPTION 'gems batch % has fewer unspent gems than the % this expires',
      batch.id, -NEW.gems_amount
      USING ERRCODE = 'check_violation', CONSTRAINT = 'loyalty_batch_overspent';
  END IF;
  NEW.branch_id := batch.branch_id;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS loyalty_expiry_guard ON loyalty_transaction;--> statement-breakpoint
CREATE TRIGGER loyalty_expiry_guard
  BEFORE INSERT ON loyalty_transaction
  FOR EACH ROW
  WHEN (NEW.type = 'expired')
  EXECUTE FUNCTION loyalty_expiry_guard();--> statement-breakpoint

-- 3. Backfill. Every earned row is a batch at the branch whose invoice earned
--    it; a redemption is at its booking's branch; an expiry names the batch
--    from the old 'expired:<batch id>' marker, at the batch's branch.
UPDATE loyalty_transaction t
   SET branch_id = CASE
         WHEN t.type = 'earned'
           THEN (SELECT i.branch_id FROM invoice i WHERE i.id = t.invoice_id)
         ELSE coalesce((SELECT b.branch_id FROM booking b WHERE b.id = t.booking_id),
                       (SELECT i.branch_id FROM invoice i WHERE i.id = t.invoice_id))
       END
 WHERE t.branch_id IS NULL
   AND t.type IN ('earned', 'redeemed');--> statement-breakpoint
UPDATE loyalty_transaction t
   SET batch_id = e.id
  FROM loyalty_transaction e
 WHERE t.type = 'expired'
   AND t.batch_id IS NULL
   AND e.type = 'earned'
   AND e.loyalty_account_id = t.loyalty_account_id
   AND t.description = 'expired:' || e.id;--> statement-breakpoint
UPDATE loyalty_transaction t
   SET branch_id = e.branch_id
  FROM loyalty_transaction e
 WHERE t.type = 'expired'
   AND t.branch_id IS NULL
   AND e.id = t.batch_id;--> statement-breakpoint

-- Redemptions made before batches existed spend, in the order they were
-- made, the earliest-expiring gems that were unspent and unexpired at the
-- time (none exist on 28 October 2026; this keeps a rehearsal honest).
DO $$
DECLARE
  r record;
  b record;
  remaining bigint;
  take bigint;
BEGIN
  FOR r IN
    SELECT t.id, t.loyalty_account_id, t.gems_amount, t.created_at
      FROM loyalty_transaction t
     WHERE t.type = 'redeemed'
       AND NOT EXISTS (SELECT 1 FROM loyalty_allocation a WHERE a.redemption_id = t.id)
     ORDER BY t.created_at, t.id
  LOOP
    remaining := r.gems_amount;
    FOR b IN
      SELECT e.id, loyalty_batch_unspent(e.id) AS unspent
        FROM loyalty_transaction e
       WHERE e.loyalty_account_id = r.loyalty_account_id
         AND e.type = 'earned'
         AND e.created_at < r.created_at
         AND (e.expires_at IS NULL OR e.expires_at > r.created_at)
       ORDER BY e.expires_at ASC NULLS LAST, e.created_at, e.id
    LOOP
      EXIT WHEN remaining = 0;
      CONTINUE WHEN b.unspent <= 0;
      take := least(b.unspent, remaining);
      INSERT INTO loyalty_allocation (redemption_id, batch_id, gems, created_at)
      VALUES (r.id, b.id, take, r.created_at);
      remaining := remaining - take;
    END LOOP;
    IF remaining > 0 THEN
      RAISE EXCEPTION 'redemption % of % gems is not covered by earned gems (% short)',
        r.id, r.gems_amount, remaining;
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint

-- Every balance must equal its movements, and no batch may be overspent,
-- before redemptions start spending batches.
DO $$
DECLARE
  bad bigint;
BEGIN
  SELECT count(*) INTO bad
    FROM loyalty_account a
   WHERE a.gems_balance <> coalesce((
           SELECT sum(CASE WHEN t.type = 'redeemed' THEN -t.gems_amount ELSE t.gems_amount END)
             FROM loyalty_transaction t
            WHERE t.loyalty_account_id = a.id), 0);
  IF bad > 0 THEN
    RAISE EXCEPTION '% gems account(s) have a balance their transactions don''t add up to', bad;
  END IF;
  SELECT count(*) INTO bad
    FROM loyalty_transaction e
   WHERE e.type = 'earned' AND loyalty_batch_unspent(e.id) < 0;
  IF bad > 0 THEN
    RAISE EXCEPTION '% gems batch(es) are spent or expired beyond what they earned', bad;
  END IF;
END
$$;--> statement-breakpoint

-- 4. The ledger. An entry belongs to the IST month it is recorded in; when
--    that month has already closed, to the next open one (MS-24). The share
--    lock on the month's row makes the close wait for entries in flight, so
--    a closed month never gains one. A reversing entry copies the entry it
--    corrects, negated.
CREATE OR REPLACE FUNCTION settlement_entry_post()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_month date;
  v_closed timestamptz;
  original settlement_entry%ROWTYPE;
BEGIN
  IF ledger_fixture() THEN
    v_month := date_trunc('month', NEW.posting_month)::date;
  ELSE
    v_month := settlement_month_of(now());
    NEW.created_at := now();
  END IF;
  LOOP
    INSERT INTO settlement_period (month) VALUES (v_month) ON CONFLICT (month) DO NOTHING;
    SELECT p.closed_at INTO v_closed FROM settlement_period p WHERE p.month = v_month FOR SHARE;
    EXIT WHEN v_closed IS NULL;
    v_month := (v_month + interval '1 month')::date;
  END LOOP;
  NEW.posting_month := v_month;

  IF NEW.kind::text = 'reversal' THEN
    SELECT * INTO original FROM settlement_entry e WHERE e.id = NEW.reverses_entry_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'settlement entry % does not exist', NEW.reverses_entry_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF original.kind::text = 'reversal' THEN
      RAISE EXCEPTION 'reversing entry % can''t itself be reversed', original.id
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.owing_branch_id := original.owing_branch_id;
    NEW.owed_branch_id := original.owed_branch_id;
    NEW.spa_membership_id := original.spa_membership_id;
    NEW.booking_id := original.booking_id;
    NEW.loyalty_transaction_id := original.loyalty_transaction_id;
    NEW.minutes := -original.minutes;
    NEW.gems := -original.gems;
    NEW.value_paise := -original.value_paise;
    NEW.gst_share_paise := -original.gst_share_paise;
    NEW.amount_owed_paise := -original.amount_owed_paise;
    NEW.share_bps := original.share_bps;
    NEW.gem_value_paise := original.gem_value_paise;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS settlement_entry_post ON settlement_entry;--> statement-breakpoint
CREATE TRIGGER settlement_entry_post
  BEFORE INSERT ON settlement_entry
  FOR EACH ROW EXECUTE FUNCTION settlement_entry_post();--> statement-breakpoint

-- An entry never changes; a correction is a reversing entry.
CREATE OR REPLACE FUNCTION settlement_entry_fixed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND ledger_fixture() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'settlement entry % can''t change; record a reversing entry', OLD.id
    USING ERRCODE = 'check_violation';
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS settlement_entry_fixed ON settlement_entry;--> statement-breakpoint
CREATE TRIGGER settlement_entry_fixed
  BEFORE UPDATE OR DELETE ON settlement_entry
  FOR EACH ROW EXECUTE FUNCTION settlement_entry_fixed();--> statement-breakpoint

-- A month closes once, after it has ended.
CREATE OR REPLACE FUNCTION settlement_period_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF ledger_fixture() THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'settlement month % can''t be deleted', OLD.month
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.closed_at IS NOT NULL OR NEW.closed_at IS NULL
     OR (to_jsonb(NEW) - 'closed_at') <> (to_jsonb(OLD) - 'closed_at') THEN
    RAISE EXCEPTION 'settlement month % can only be closed, once', OLD.month
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.month >= settlement_month_of(now()) THEN
    RAISE EXCEPTION 'settlement month % has not ended yet', OLD.month
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS settlement_period_guard ON settlement_period;--> statement-breakpoint
CREATE TRIGGER settlement_period_guard
  BEFORE UPDATE OR DELETE ON settlement_period
  FOR EACH ROW EXECUTE FUNCTION settlement_period_guard();--> statement-breakpoint

-- A statement is made only by the transaction that closes its month, so a
-- second close adds nothing (ST-07). Afterwards it only gains its payment,
-- once (MS-25).
CREATE OR REPLACE FUNCTION branch_settlement_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM settlement_period p
                    WHERE p.month = NEW.month AND p.closed_at = now()) THEN
      RAISE EXCEPTION 'a statement for % is made only by closing that month', NEW.month
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF ledger_fixture() THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'settlement statement % can''t be deleted', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.paid_on IS NOT NULL THEN
    RAISE EXCEPTION 'settlement statement % is already marked paid', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'branch_settlement_already_paid';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['paid_on', 'payment_reference', 'internal_transfer',
                            'paid_recorded_by', 'paid_recorded_at'])
     <> (to_jsonb(OLD) - ARRAY['paid_on', 'payment_reference', 'internal_transfer',
                               'paid_recorded_by', 'paid_recorded_at']) THEN
    RAISE EXCEPTION 'settlement statement % can''t change except to record its payment', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS branch_settlement_guard ON branch_settlement;--> statement-breakpoint
CREATE TRIGGER branch_settlement_guard
  BEFORE INSERT OR UPDATE OR DELETE ON branch_settlement
  FOR EACH ROW EXECUTE FUNCTION branch_settlement_guard();--> statement-breakpoint

-- A branch's net position is made by the close and never changes.
CREATE OR REPLACE FUNCTION settlement_position_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM settlement_period p
                    WHERE p.month = NEW.month AND p.closed_at = now()) THEN
      RAISE EXCEPTION 'a position for % is made only by closing that month', NEW.month
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND ledger_fixture() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'the % position of branch % can''t change', OLD.month, OLD.branch_id
    USING ERRCODE = 'check_violation';
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS settlement_position_guard ON settlement_position;--> statement-breakpoint
CREATE TRIGGER settlement_position_guard
  BEFORE INSERT OR UPDATE OR DELETE ON settlement_position
  FOR EACH ROW EXECUTE FUNCTION settlement_position_guard();--> statement-breakpoint

-- 5. A membership's price paid and purchased minutes define every session's
--    value, so they are fixed once sold (membership-scheduling.md).
CREATE OR REPLACE FUNCTION spa_membership_terms_fixed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.price_paid_paise IS DISTINCT FROM OLD.price_paid_paise
     OR NEW.total_hours_minutes IS DISTINCT FROM OLD.total_hours_minutes THEN
    RAISE EXCEPTION 'membership % keeps the price paid and hours it was sold with',
      OLD.membership_number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS spa_membership_terms_fixed ON spa_membership;--> statement-breakpoint
CREATE TRIGGER spa_membership_terms_fixed
  BEFORE UPDATE OF price_paid_paise, total_hours_minutes ON spa_membership
  FOR EACH ROW EXECUTE FUNCTION spa_membership_terms_fixed();--> statement-breakpoint

-- 6. The Developer's settlement settings (user decisions of 28 October 2026:
--    the performing branch receives 100%, a gem is worth ₹1.00). The value
--    per gem comes from the old gems_value_paise setting when it holds a
--    valid one; nothing reads that key any more.
INSERT INTO system_setting (id, key, value, description, updated_at)
SELECT 'set_settlement',
       'settlement',
       jsonb_build_object(
         'shareBps', 10000,
         'gemValuePaise', coalesce(
           (SELECT (s.value #>> '{}')::integer
              FROM system_setting s
             WHERE s.key = 'gems_value_paise'
               AND jsonb_typeof(s.value) = 'number'
               AND (s.value #>> '{}') ~ '^[0-9]+$'
               AND (s.value #>> '{}')::numeric BETWEEN 1 AND 100000),
           100)),
       'Cross-branch settlement: the share of an amount the performing branch receives (basis points) and the value of one gem (paise)',
       now()
 WHERE NOT EXISTS (SELECT 1 FROM system_setting WHERE key = 'settlement');--> statement-breakpoint
DELETE FROM system_setting WHERE key = 'gems_value_paise';
