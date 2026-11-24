-- 0020: guards and backfill for branch booking settings (multi-branch R1.1,
-- R6.3, tax-settings.md §3). Hand-written; reviewed before use. Rerunnable
-- statements only (CREATE OR REPLACE, ON CONFLICT DO NOTHING, guarded
-- inserts), so a partial rehearsal can be repeated.

-- 1. The documented defaults (features.md), used where nothing else exists:
--    a branch backfilled with no saved setting, or the first branch of a
--    new database. They must equal DEFAULT_BUSINESS_HOURS and
--    DEFAULT_BOOKING_RULES in @rgss/types (the live suite checks).
CREATE OR REPLACE FUNCTION branch_default_business_hours()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '{
    "mon": {"open": "10:00", "close": "21:00", "closed": false},
    "tue": {"open": "10:00", "close": "21:00", "closed": false},
    "wed": {"open": "10:00", "close": "21:00", "closed": false},
    "thu": {"open": "10:00", "close": "21:00", "closed": false},
    "fri": {"open": "10:00", "close": "21:00", "closed": false},
    "sat": {"open": "10:00", "close": "22:00", "closed": false},
    "sun": {"open": "10:00", "close": "22:00", "closed": false}
  }'::jsonb
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION branch_default_booking_rules()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '{
    "minAdvanceLeadTimeMinutes": 60,
    "maxAdvanceBookingDays": 30,
    "cancellationCutoffHours": 4,
    "maxActiveBookingsPerCustomer": 3,
    "rescheduleCutoffHours": 1,
    "maxReschedulesPerBooking": 2
  }'::jsonb
$$;--> statement-breakpoint

-- 2. Revision 1 for every branch: the settings all branches shared until now
--    (system_setting business_hours and booking_rules), else the defaults.
--    Saved booking rules keep their values; the two new reschedule rules come
--    from the defaults (the right side of || wins).
INSERT INTO branch_setting (id, branch_id, revision, business_hours, booking_rules)
SELECT 'bset_' || b.id || '_1',
       b.id,
       1,
       coalesce(
         (SELECT s.value FROM system_setting s
           WHERE s.key = 'business_hours' AND jsonb_typeof(s.value) = 'object'),
         branch_default_business_hours()),
       branch_default_booking_rules() || coalesce(
         (SELECT s.value FROM system_setting s
           WHERE s.key = 'booking_rules' AND jsonb_typeof(s.value) = 'object'),
         '{}'::jsonb)
  FROM branch b
 WHERE NOT EXISTS (SELECT 1 FROM branch_setting x WHERE x.branch_id = b.id)
    ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 3. A branch created later starts from the primary branch's current
--    settings as its revision 1 (the defaults when there is no primary branch
--    yet). The Developer then adjusts them on Settings.
CREATE OR REPLACE FUNCTION branch_copy_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  hours jsonb;
  rules jsonb;
BEGIN
  SELECT s.business_hours, s.booking_rules INTO hours, rules
    FROM branch_setting s
    JOIN branch p ON p.id = s.branch_id
   WHERE p.is_primary AND p.id <> NEW.id
   ORDER BY p.display_order, p.id, s.revision DESC
   LIMIT 1;
  INSERT INTO branch_setting (id, branch_id, revision, business_hours, booking_rules)
  VALUES ('bset_' || NEW.id || '_1', NEW.id, 1,
          coalesce(hours, branch_default_business_hours()),
          coalesce(rules, branch_default_booking_rules()))
      ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS branch_copy_settings ON branch;--> statement-breakpoint
CREATE TRIGGER branch_copy_settings
  AFTER INSERT ON branch
  FOR EACH ROW EXECUTE FUNCTION branch_copy_settings();--> statement-breakpoint

-- 4. Revisions are numbered 1, 2, 3, ... per branch without gaps: a save adds
--    the next number, and two saves from the same revision collide on the
--    unique key, so the later one is refused instead of overwriting.
CREATE OR REPLACE FUNCTION branch_setting_next_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  latest integer;
BEGIN
  SELECT max(s.revision) INTO latest FROM branch_setting s WHERE s.branch_id = NEW.branch_id;
  IF NEW.revision <> coalesce(latest, 0) + 1 THEN
    RAISE EXCEPTION 'branch % is at settings revision %, so the next one is %, not %',
      NEW.branch_id, coalesce(latest, 0), coalesce(latest, 0) + 1, NEW.revision
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS branch_setting_next_revision ON branch_setting;--> statement-breakpoint
CREATE TRIGGER branch_setting_next_revision
  BEFORE INSERT ON branch_setting
  FOR EACH ROW EXECUTE FUNCTION branch_setting_next_revision();--> statement-breakpoint

-- 5. A revision never changes: the settings a booking decision used stay
--    readable. A branch's revisions go only with the branch (cascade).
CREATE OR REPLACE FUNCTION branch_setting_fixed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM branch b WHERE b.id = OLD.branch_id) THEN
      RAISE EXCEPTION 'settings revision % of branch % can''t be deleted', OLD.revision, OLD.branch_id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'settings revision % of branch % can''t change; save a new revision',
    OLD.revision, OLD.branch_id
    USING ERRCODE = 'check_violation';
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS branch_setting_fixed ON branch_setting;--> statement-breakpoint
CREATE TRIGGER branch_setting_fixed
  BEFORE UPDATE OR DELETE ON branch_setting
  FOR EACH ROW EXECUTE FUNCTION branch_setting_fixed();--> statement-breakpoint

-- 6. The shared rows are now each branch's revision 1; nothing reads them.
DELETE FROM system_setting WHERE key IN ('business_hours', 'booking_rules');
