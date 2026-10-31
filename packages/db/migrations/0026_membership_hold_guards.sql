-- 0026: SPA membership minute holds (membership-scheduling.md "Implementation
-- design", MS-01 to MS-06, MS-12, MS-13). Hand-written; reviewed before use.
-- Rerunnable: the triggers are dropped first and created last, the backfill
-- inserts only missing holds, and the totals are recomputed.
--
-- The database derives a session booking's hold from the booking. Confirmed
-- or in progress holds its service minutes; completed consumes them;
-- cancelled, rejected, no-show or rescheduled releases them. A membership's
-- reserved and used totals are the sums of its held and consumed holds: the
-- hold triggers keep them, the CHECK from 0025 refuses an overcommit at once,
-- and a deferred check refuses any other change to them at commit.
--
-- 0025 creates the membership_hold_state type in the same migration
-- transaction. A new type's values can be used straight away (unlike a value
-- added to an existing type), so its literals appear below.

DROP TRIGGER IF EXISTS booking_membership_hold_sync ON booking;--> statement-breakpoint
DROP TRIGGER IF EXISTS membership_hold_guard ON membership_hold;--> statement-breakpoint
DROP TRIGGER IF EXISTS membership_hold_totals ON membership_hold;--> statement-breakpoint
DROP TRIGGER IF EXISTS membership_minutes_balanced_hold ON membership_hold;--> statement-breakpoint
DROP TRIGGER IF EXISTS membership_minutes_balanced_membership ON spa_membership;--> statement-breakpoint
DROP TRIGGER IF EXISTS spa_membership_cancel_guard ON spa_membership;--> statement-breakpoint

-- 1. A session's start: when it actually started, else its planned start
--    (the booking's IST date and time).
CREATE OR REPLACE FUNCTION session_start_instant(started_at timestamptz, day date, at_time time)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(started_at, (day + at_time) AT TIME ZONE 'Asia/Kolkata')
$$;--> statement-breakpoint

-- 2. A hold matches its session booking, follows its status and, when new,
--    needs a membership usable at the session's start. Holds are never
--    deleted, except by test fixtures (rgss.ledger_fixture, 0022).
CREATE OR REPLACE FUNCTION membership_hold_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  b booking%ROWTYPE;
  m spa_membership%ROWTYPE;
  started timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF ledger_fixture() THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'membership holds are never deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT * INTO b FROM booking WHERE id = NEW.booking_id;
  IF NOT FOUND OR NOT b.is_membership_session
     OR b.spa_membership_id IS DISTINCT FROM NEW.spa_membership_id
     OR b.branch_id <> NEW.branch_id
     OR b.total_duration_minutes <> NEW.minutes THEN
    RAISE EXCEPTION 'a membership hold must match its session booking %', NEW.booking_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_booking_match';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.state <> 'held' THEN
      RAISE EXCEPTION 'the hold of booking % is already %', OLD.booking_id, OLD.state
        USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_final';
    END IF;
    IF NEW.spa_membership_id <> OLD.spa_membership_id OR NEW.booking_id <> OLD.booking_id
       OR NEW.branch_id <> OLD.branch_id OR NEW.held_at <> OLD.held_at THEN
      RAISE EXCEPTION 'a hold keeps its membership, booking, branch and time'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_fixed';
    END IF;
    IF NEW.minutes <> OLD.minutes AND (NEW.state <> 'held' OR b.status <> 'confirmed') THEN
      RAISE EXCEPTION 'a hold changes size only before its session starts'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_fixed';
    END IF;
  END IF;

  IF (NEW.state = 'held' AND b.status NOT IN ('confirmed', 'in_progress'))
     OR (NEW.state = 'consumed' AND b.status <> 'completed')
     OR (NEW.state = 'released'
         AND (TG_OP = 'INSERT' OR b.status NOT IN ('cancelled', 'rejected', 'no_show', 'rescheduled'))) THEN
    RAISE EXCEPTION 'a % hold doesn''t fit a % booking', NEW.state, b.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_booking_match';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO m FROM spa_membership WHERE id = NEW.spa_membership_id;
    started := session_start_instant(b.started_at, b.booking_date, b.start_time);
    IF (NEW.state = 'held' AND m.status <> 'active')
       OR (NEW.state = 'consumed' AND m.status = 'cancelled')
       OR started < m.starts_at OR started > m.expires_at THEN
      RAISE EXCEPTION 'membership % can''t be used for a session starting at %',
        m.membership_number, started
        USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_validity';
    END IF;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

-- 3. The membership's totals follow its holds. The membership row's update
--    lock serializes concurrent holds, and spa_membership_reserved_check
--    refuses an overcommit (MS-01).
CREATE OR REPLACE FUNCTION membership_hold_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target text;
  held_delta integer := 0;
  used_delta integer := 0;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    target := OLD.spa_membership_id;
    IF OLD.state = 'held' THEN
      held_delta := held_delta - OLD.minutes;
    ELSIF OLD.state = 'consumed' THEN
      used_delta := used_delta - OLD.minutes;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    target := NEW.spa_membership_id;
    IF NEW.state = 'held' THEN
      held_delta := held_delta + NEW.minutes;
    ELSIF NEW.state = 'consumed' THEN
      used_delta := used_delta + NEW.minutes;
    END IF;
  END IF;
  IF held_delta <> 0 OR used_delta <> 0 THEN
    UPDATE spa_membership
       SET reserved_minutes = reserved_minutes + held_delta,
           used_hours_minutes = used_hours_minutes + used_delta,
           updated_at = now()
     WHERE id = target;
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint

-- 4. At commit, a membership's totals equal its holds, whatever wrote them.
--    Test fixtures may set totals directly under rgss.ledger_fixture.
CREATE OR REPLACE FUNCTION membership_minutes_balanced_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target text;
  m spa_membership%ROWTYPE;
  held_sum bigint;
  used_sum bigint;
BEGIN
  IF ledger_fixture() THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'spa_membership' THEN
    target := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD.spa_membership_id;
  ELSE
    target := NEW.spa_membership_id;
  END IF;

  SELECT * INTO m FROM spa_membership WHERE id = target;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(sum(h.minutes) FILTER (WHERE h.state = 'held'), 0),
         coalesce(sum(h.minutes) FILTER (WHERE h.state = 'consumed'), 0)
    INTO held_sum, used_sum
    FROM membership_hold h
   WHERE h.spa_membership_id = target;
  IF m.reserved_minutes <> held_sum OR m.used_hours_minutes <> used_sum THEN
    RAISE EXCEPTION 'membership % shows % held and % used minutes; its sessions hold % and used %',
      m.membership_number, m.reserved_minutes, m.used_hours_minutes, held_sum, used_sum
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_minutes_balanced';
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint

-- 5. A membership session booking's hold follows its status. Normal bookings
--    pass straight through.
CREATE OR REPLACE FUNCTION booking_membership_hold_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  h membership_hold%ROWTYPE;
  m spa_membership%ROWTYPE;
  was text;
  started timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    was := OLD.status::text;
    IF OLD.is_membership_session <> NEW.is_membership_session
       OR OLD.spa_membership_id IS DISTINCT FROM NEW.spa_membership_id
       OR (OLD.is_membership_session AND OLD.branch_id <> NEW.branch_id) THEN
      RAISE EXCEPTION 'a membership session keeps its membership and branch'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_fixed';
    END IF;
  END IF;
  IF NOT NEW.is_membership_session THEN
    RETURN NULL;
  END IF;

  SELECT * INTO h FROM membership_hold WHERE booking_id = NEW.id;

  IF NEW.status IN ('confirmed', 'in_progress') THEN
    IF NOT FOUND THEN
      INSERT INTO membership_hold (spa_membership_id, booking_id, branch_id, minutes)
      VALUES (NEW.spa_membership_id, NEW.id, NEW.branch_id, NEW.total_duration_minutes);
      RETURN NULL;
    END IF;
    IF h.state <> 'held' THEN
      RAISE EXCEPTION 'the minutes of booking % were already %', NEW.id, h.state
        USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_final';
    END IF;
    IF h.minutes <> NEW.total_duration_minutes THEN
      UPDATE membership_hold SET minutes = NEW.total_duration_minutes WHERE id = h.id;
    END IF;
    -- Starting, or moving the appointment, rechecks validity at the new start.
    IF TG_OP = 'UPDATE'
       AND (NEW.started_at IS DISTINCT FROM OLD.started_at
            OR NEW.booking_date <> OLD.booking_date
            OR NEW.start_time <> OLD.start_time) THEN
      SELECT * INTO m FROM spa_membership WHERE id = NEW.spa_membership_id;
      started := session_start_instant(NEW.started_at, NEW.booking_date, NEW.start_time);
      IF started < m.starts_at OR started > m.expires_at THEN
        RAISE EXCEPTION 'membership % can''t be used for a session starting at %',
          m.membership_number, started
          USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_validity';
      END IF;
    END IF;
  ELSIF NEW.status = 'completed' THEN
    IF NOT FOUND THEN
      -- Recorded once it was over: its minutes are consumed straight away.
      IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'a membership session completes after it starts'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_session_started';
      END IF;
      INSERT INTO membership_hold
        (spa_membership_id, booking_id, branch_id, minutes, state, consumed_at)
      VALUES (NEW.spa_membership_id, NEW.id, NEW.branch_id, NEW.total_duration_minutes,
              'consumed', now());
    ELSIF h.state = 'held' THEN
      IF was IS DISTINCT FROM 'in_progress' THEN
        RAISE EXCEPTION 'a membership session completes after it starts'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_session_started';
      END IF;
      UPDATE membership_hold SET state = 'consumed', consumed_at = now() WHERE id = h.id;
    ELSIF h.state = 'released' THEN
      RAISE EXCEPTION 'the minutes of booking % were already released', NEW.id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_final';
    END IF;
  ELSIF NEW.status IN ('cancelled', 'rejected', 'no_show', 'rescheduled') THEN
    IF FOUND AND h.state = 'held' THEN
      IF was = 'in_progress' THEN
        RAISE EXCEPTION 'a membership session in progress can''t be %', NEW.status
          USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_session_started';
      END IF;
      UPDATE membership_hold SET state = 'released', released_at = now() WHERE id = h.id;
    ELSIF FOUND AND h.state = 'consumed' THEN
      RAISE EXCEPTION 'the minutes of booking % were already consumed', NEW.id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_final';
    END IF;
  ELSIF FOUND THEN
    RAISE EXCEPTION 'a pending membership session holds no minutes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'membership_hold_booking_match';
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint

-- 6. A membership is cancelled only once no session holds its minutes; the
--    caller cancels the unstarted sessions in the same transaction (MS-13).
CREATE OR REPLACE FUNCTION spa_membership_cancel_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled'
     AND EXISTS (SELECT 1 FROM membership_hold h
                  WHERE h.spa_membership_id = NEW.id AND h.state = 'held') THEN
    RAISE EXCEPTION 'membership % still holds minutes for sessions', NEW.membership_number
      USING ERRCODE = 'check_violation', CONSTRAINT = 'spa_membership_cancel_holds';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

-- 7. Backfill, before the triggers exist. Sessions recorded before holds were
--    completed at once and already counted in used_hours_minutes; each gets a
--    consumed hold. Any other session booking gets the hold its status implies.
INSERT INTO membership_hold
  (spa_membership_id, booking_id, branch_id, minutes, state, held_at, consumed_at, released_at)
SELECT b.spa_membership_id, b.id, b.branch_id, b.total_duration_minutes,
       CASE
         WHEN b.status = 'completed' THEN 'consumed'
         WHEN b.status IN ('confirmed', 'in_progress') THEN 'held'
         ELSE 'released'
       END::membership_hold_state,
       coalesce(b.confirmed_at, b.created_at),
       CASE WHEN b.status = 'completed' THEN coalesce(b.completed_at, b.updated_at) END,
       CASE
         WHEN b.status IN ('cancelled', 'rejected', 'no_show', 'rescheduled')
           THEN coalesce(b.cancelled_at, b.rejected_at, b.updated_at)
       END
  FROM booking b
 WHERE b.is_membership_session
   AND b.spa_membership_id IS NOT NULL
   AND b.status <> 'pending'
   AND b.total_duration_minutes > 0
ON CONFLICT (booking_id) DO NOTHING;--> statement-breakpoint

UPDATE spa_membership m
   SET reserved_minutes = s.held
  FROM (SELECT mm.id,
               coalesce((SELECT sum(h.minutes) FROM membership_hold h
                          WHERE h.spa_membership_id = mm.id AND h.state = 'held'), 0)::integer AS held
          FROM spa_membership mm) s
 WHERE s.id = m.id
   AND m.reserved_minutes <> s.held;--> statement-breakpoint

-- Every membership's used minutes must equal its completed sessions before
-- the balance check starts. Refuse to finish otherwise, naming them.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(format('%s: %s used, sessions %s', m.membership_number,
                           m.used_hours_minutes, coalesce(s.used, 0)), '; ')
    INTO bad
    FROM spa_membership m
    LEFT JOIN (SELECT h.spa_membership_id, sum(h.minutes) AS used
                 FROM membership_hold h
                WHERE h.state = 'consumed'
                GROUP BY h.spa_membership_id) s ON s.spa_membership_id = m.id
   WHERE m.used_hours_minutes <> coalesce(s.used, 0);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'used minutes disagree with completed sessions: %', bad;
  END IF;
END
$$;--> statement-breakpoint

-- 8. The triggers.
CREATE TRIGGER membership_hold_guard
BEFORE INSERT OR UPDATE OR DELETE ON membership_hold
FOR EACH ROW EXECUTE FUNCTION membership_hold_guard();--> statement-breakpoint

CREATE TRIGGER membership_hold_totals
AFTER INSERT OR UPDATE OR DELETE ON membership_hold
FOR EACH ROW EXECUTE FUNCTION membership_hold_totals();--> statement-breakpoint

CREATE CONSTRAINT TRIGGER membership_minutes_balanced_hold
AFTER INSERT OR UPDATE OR DELETE ON membership_hold
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION membership_minutes_balanced_check();--> statement-breakpoint

CREATE CONSTRAINT TRIGGER membership_minutes_balanced_membership
AFTER INSERT OR UPDATE OF used_hours_minutes, reserved_minutes ON spa_membership
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION membership_minutes_balanced_check();--> statement-breakpoint

CREATE TRIGGER spa_membership_cancel_guard
BEFORE UPDATE OF status ON spa_membership
FOR EACH ROW EXECUTE FUNCTION spa_membership_cancel_guard();--> statement-breakpoint

CREATE TRIGGER booking_membership_hold_sync
AFTER INSERT OR UPDATE OF status, total_duration_minutes, booking_date, start_time, started_at,
  branch_id, spa_membership_id, is_membership_session ON booking
FOR EACH ROW EXECUTE FUNCTION booking_membership_hold_sync();
