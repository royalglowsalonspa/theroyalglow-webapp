-- 0028: staff occupancy and actual work (membership-scheduling.md slice 2,
-- MS-07, MS-08, MS-10). Hand-written; reviewed before use. Rerunnable: the
-- triggers are dropped first and created last, the constraints are replaced,
-- and the backfill recomputes every row.
--
-- The database derives both projections from bookings, whatever wrote them:
--   staff_occupancy: one row per confirmed or in-progress booking whose
--     service lines name one assignee, over its planned IST start to end;
--   staff_work: one row per booking that started (started_at) with one
--     assignee, from the start to completion, with no end while it runs.
-- For one person, at any branch, an interval of a SPA booking overlaps no
-- other interval of theirs, SPA or salon; two salon intervals may overlap.
-- Intervals are half-open, so back-to-back bookings don't overlap. A running
-- SPA therefore blocks the person's next start, and a running salon service
-- blocks a SPA start (MS-08), whatever an alert did.
--
-- Once confirmed, every service line of a booking names the same assignee
-- (checked at commit). Pending bookings keep their tentative per-line staff
-- until approval assigns one person.

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

DROP TRIGGER IF EXISTS booking_staff_occupancy_sync ON booking;--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_service_staff_occupancy_sync ON booking_service;--> statement-breakpoint
DROP TRIGGER IF EXISTS staff_occupancy_guard ON staff_occupancy;--> statement-breakpoint
DROP TRIGGER IF EXISTS staff_work_guard ON staff_work;--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_service_one_assignee ON booking_service;--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_one_assignee ON booking;--> statement-breakpoint

-- 1. A booking's planned interval: its IST date from the start to the end. An
--    end before the start is on the next day (a session recorded late at
--    night); an end equal to the start is an empty interval.
CREATE OR REPLACE FUNCTION booking_planned_during(day date, starts time, ends time)
RETURNS tstzrange
LANGUAGE sql
STABLE
AS $$
  SELECT tstzrange(
    (day + starts) AT TIME ZONE 'Asia/Kolkata',
    (day + ends + CASE WHEN ends < starts THEN interval '1 day' ELSE interval '0' END)
      AT TIME ZONE 'Asia/Kolkata',
    '[)')
$$;--> statement-breakpoint

-- 2. A booking's one assignee: the staff profile every service line names, or
--    null while a line names nobody or the lines disagree.
CREATE OR REPLACE FUNCTION booking_sole_assignee(p_booking text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
           WHEN count(*) > 0 AND count(*) = count(staff_id) AND count(DISTINCT staff_id) = 1
             THEN min(staff_id)
         END
    FROM booking_service
   WHERE booking_id = p_booking
$$;--> statement-breakpoint

-- 3. Bring a booking's occupancy and work rows in line with it.
CREATE OR REPLACE FUNCTION staff_occupancy_sync(p_booking text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  b booking%ROWTYPE;
  who text;
  planned tstzrange;
  worked tstzrange;
BEGIN
  SELECT * INTO b FROM booking WHERE id = p_booking;
  IF NOT FOUND THEN
    -- Deleted: the foreign keys cascade to its rows.
    RETURN;
  END IF;
  who := booking_sole_assignee(p_booking);

  IF who IS NOT NULL AND b.status IN ('confirmed', 'in_progress') THEN
    planned := booking_planned_during(b.booking_date, b.start_time, b.end_time);
  END IF;
  IF planned IS NULL OR isempty(planned) THEN
    DELETE FROM staff_occupancy WHERE booking_id = p_booking;
  ELSE
    INSERT INTO staff_occupancy AS o (booking_id, staff_id, branch_id, kind, during)
    VALUES (p_booking, who, b.branch_id, b.service_type, planned)
    ON CONFLICT (booking_id) DO UPDATE
       SET staff_id = EXCLUDED.staff_id, branch_id = EXCLUDED.branch_id,
           kind = EXCLUDED.kind, during = EXCLUDED.during
     WHERE (o.staff_id, o.branch_id, o.kind, o.during)
           IS DISTINCT FROM (EXCLUDED.staff_id, EXCLUDED.branch_id, EXCLUDED.kind, EXCLUDED.during);
  END IF;

  IF who IS NOT NULL AND b.started_at IS NOT NULL THEN
    IF b.status = 'in_progress' THEN
      worked := tstzrange(b.started_at, NULL, '[)');
    ELSIF b.status = 'completed' THEN
      worked := tstzrange(b.started_at,
                          greatest(coalesce(b.completed_at, b.updated_at), b.started_at), '[)');
    ELSE
      -- Ended some other way after it started: the work stopped then.
      worked := tstzrange(b.started_at,
                          greatest(coalesce(b.cancelled_at, b.rejected_at, b.updated_at),
                                   b.started_at), '[)');
    END IF;
  END IF;
  IF worked IS NULL OR isempty(worked) THEN
    DELETE FROM staff_work WHERE booking_id = p_booking;
  ELSE
    INSERT INTO staff_work AS w (booking_id, staff_id, branch_id, kind, during)
    VALUES (p_booking, who, b.branch_id, b.service_type, worked)
    ON CONFLICT (booking_id) DO UPDATE
       SET staff_id = EXCLUDED.staff_id, branch_id = EXCLUDED.branch_id,
           kind = EXCLUDED.kind, during = EXCLUDED.during
     WHERE (w.staff_id, w.branch_id, w.kind, w.during)
           IS DISTINCT FROM (EXCLUDED.staff_id, EXCLUDED.branch_id, EXCLUDED.kind, EXCLUDED.during);
  END IF;
END
$$;--> statement-breakpoint

-- 4. The triggers' functions.
CREATE OR REPLACE FUNCTION booking_staff_occupancy_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM staff_occupancy_sync(NEW.id);
  RETURN NULL;
END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION booking_service_staff_occupancy_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM staff_occupancy_sync(OLD.booking_id);
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.booking_id <> OLD.booking_id) THEN
    PERFORM staff_occupancy_sync(NEW.booking_id);
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint

-- 5. Only the database writes the projections: the sync above, run from the
--    booking triggers, and the foreign keys' cascades, both from inside a
--    trigger. A statement that writes them directly is refused, except by
--    test fixtures under rgss.ledger_fixture (0022).
CREATE OR REPLACE FUNCTION staff_projection_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() < 2 AND NOT ledger_fixture() THEN
    RAISE EXCEPTION '% is kept by the database from bookings; change the booking instead',
      TG_TABLE_NAME
      USING ERRCODE = 'check_violation', CONSTRAINT = 'staff_projection_derived';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

-- 6. Once confirmed, a booking's service lines name one assignee (MS-10).
--    Checked at commit, so a change may rewrite every line in one transaction.
CREATE OR REPLACE FUNCTION booking_one_assignee_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target text;
  b_status text;
BEGIN
  IF TG_TABLE_NAME = 'booking' THEN
    target := NEW.id;
  ELSE
    target := NEW.booking_id;
  END IF;
  SELECT status::text INTO b_status FROM booking WHERE id = target;
  IF b_status IN ('confirmed', 'in_progress')
     AND (SELECT count(DISTINCT staff_id) FROM booking_service WHERE booking_id = target) > 1 THEN
    RAISE EXCEPTION 'booking % names more than one assignee', target
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_one_assignee';
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint

-- 7. The exclusion constraints (btree_gist).
ALTER TABLE staff_occupancy DROP CONSTRAINT IF EXISTS staff_occupancy_spa_overlap;--> statement-breakpoint
ALTER TABLE staff_occupancy ADD CONSTRAINT staff_occupancy_spa_overlap
  EXCLUDE USING gist (staff_id WITH =, during WITH &&) WHERE (kind = 'spa');--> statement-breakpoint
ALTER TABLE staff_occupancy DROP CONSTRAINT IF EXISTS staff_occupancy_mixed_overlap;--> statement-breakpoint
ALTER TABLE staff_occupancy ADD CONSTRAINT staff_occupancy_mixed_overlap
  EXCLUDE USING gist (staff_id WITH =, during WITH &&, kind WITH <>);--> statement-breakpoint
ALTER TABLE staff_work DROP CONSTRAINT IF EXISTS staff_work_spa_overlap;--> statement-breakpoint
ALTER TABLE staff_work ADD CONSTRAINT staff_work_spa_overlap
  EXCLUDE USING gist (staff_id WITH =, during WITH &&) WHERE (kind = 'spa');--> statement-breakpoint
ALTER TABLE staff_work DROP CONSTRAINT IF EXISTS staff_work_mixed_overlap;--> statement-breakpoint
ALTER TABLE staff_work ADD CONSTRAINT staff_work_mixed_overlap
  EXCLUDE USING gist (staff_id WITH =, during WITH &&, kind WITH <>);--> statement-breakpoint

-- 8. Backfill, before the triggers exist, oldest booking first. A confirmed
--    booking that would clash with an earlier one of the same person loses
--    its assignee and is listed for reception (reason 'overrun': the person
--    is busy then), instead of failing the migration. A started booking that
--    clashes keeps its assignee and gets no row. Bookings whose lines name
--    more than one person get no rows; they are reported.
DO $$
DECLARE
  r record;
  clashed integer := 0;
  kept integer := 0;
  mixed integer := 0;
BEGIN
  FOR r IN
    SELECT b.id, b.status::text AS status, booking_sole_assignee(b.id) AS who
      FROM booking b
     WHERE b.status IN ('confirmed', 'in_progress') OR b.started_at IS NOT NULL
     ORDER BY b.created_at, b.id
  LOOP
    IF r.who IS NULL THEN
      IF r.status IN ('confirmed', 'in_progress')
         AND (SELECT count(DISTINCT staff_id) FROM booking_service WHERE booking_id = r.id) > 1 THEN
        mixed := mixed + 1;
      END IF;
      CONTINUE;
    END IF;
    BEGIN
      PERFORM staff_occupancy_sync(r.id);
    EXCEPTION WHEN exclusion_violation THEN
      IF r.status = 'confirmed' THEN
        UPDATE booking_service SET staff_id = NULL WHERE booking_id = r.id;
        INSERT INTO booking_reassignment (booking_id, reason, previous_staff_id)
        VALUES (r.id, 'overrun', r.who)
        ON CONFLICT (booking_id) WHERE resolved_at IS NULL DO NOTHING;
        clashed := clashed + 1;
      ELSE
        kept := kept + 1;
      END IF;
    END;
  END LOOP;
  RAISE NOTICE 'staff occupancy: % clashing bookings listed for reception, % started ones kept without a row, % with more than one assignee',
    clashed, kept, mixed;
END
$$;--> statement-breakpoint

-- 9. The triggers.
CREATE TRIGGER booking_staff_occupancy_sync
AFTER INSERT OR UPDATE OF status, booking_date, start_time, end_time, started_at, completed_at,
  cancelled_at, rejected_at, branch_id, service_type ON booking
FOR EACH ROW EXECUTE FUNCTION booking_staff_occupancy_sync();--> statement-breakpoint

CREATE TRIGGER booking_service_staff_occupancy_sync
AFTER INSERT OR UPDATE OF staff_id, booking_id OR DELETE ON booking_service
FOR EACH ROW EXECUTE FUNCTION booking_service_staff_occupancy_sync();--> statement-breakpoint

CREATE TRIGGER staff_occupancy_guard
BEFORE INSERT OR UPDATE OR DELETE ON staff_occupancy
FOR EACH ROW EXECUTE FUNCTION staff_projection_guard();--> statement-breakpoint

CREATE TRIGGER staff_work_guard
BEFORE INSERT OR UPDATE OR DELETE ON staff_work
FOR EACH ROW EXECUTE FUNCTION staff_projection_guard();--> statement-breakpoint

CREATE CONSTRAINT TRIGGER booking_service_one_assignee
AFTER INSERT OR UPDATE OF staff_id ON booking_service
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION booking_one_assignee_check();--> statement-breakpoint

CREATE CONSTRAINT TRIGGER booking_one_assignee
AFTER UPDATE OF status ON booking
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION booking_one_assignee_check();
