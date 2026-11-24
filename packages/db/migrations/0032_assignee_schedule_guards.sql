-- 0032: the weekly schedule limits planned work (membership-scheduling.md
-- slice 3, MS-09). Hand-written; reviewed before use. Rerunnable.
--
-- A person's weekly row for a weekday, when they have one, says whether and
-- where they work that day: a confirmed booking of theirs must fall on a
-- working day, at that day's branch, within its hours. Without a row they
-- work the branch's opening hours (no one has rows yet). Work starting or
-- running now (Start, Record now, reassigning a running booking) is never
-- refused for the schedule: the person is there, and the schedule plans.
--
-- Checked when a confirmed booking's line names someone (the 0014 trigger
-- booking_assignee_guard, whose function this replaces), and at commit when
-- a booking becomes confirmed or a confirmed booking moves (new deferred
-- trigger booking_assignee_recheck). The recheck also covers the branch and
-- approved leave, so moving a booking onto its person's leave or day off is
-- refused unless they are taken off it in the same transaction, as a
-- reschedule does. Existing bookings aren't revalidated here: saving the
-- person's schedule does that (queries/schedule.ts). 0031's new reason value
-- isn't used here (the enum trap).

DROP TRIGGER IF EXISTS booking_assignee_recheck ON booking;--> statement-breakpoint

-- 1. Whether the person's weekly row for the date's weekday rules out the
--    planned time at the branch: a day off, a day at another branch, or time
--    outside its hours (a time past midnight is outside any hours). False
--    without a row.
CREATE OR REPLACE FUNCTION staff_off_schedule(
  p_staff text, p_branch text, p_date date, p_start time, p_end time)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_schedule s
     WHERE s.staff_id = p_staff
       AND s.day_of_week = extract(dow FROM p_date)::int
       AND (NOT s.is_working
            OR (s.branch_id IS NOT NULL AND s.branch_id <> p_branch)
            OR (s.start_time IS NOT NULL AND p_start < s.start_time)
            OR (s.end_time IS NOT NULL AND (p_end > s.end_time OR p_end < p_start)))
  )
$$;--> statement-breakpoint

-- 2. The assignee of a line (0014, 0015), now also within their schedule on
--    a confirmed booking.
CREATE OR REPLACE FUNCTION "public"."assert_booking_assignee"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  b_status text;
  b_branch text;
  b_date date;
  b_start time;
  b_end time;
BEGIN
  SELECT status, branch_id, booking_date, start_time, end_time
    INTO b_status, b_branch, b_date, b_start, b_end
  FROM booking WHERE id = NEW.booking_id;
  IF b_status IS NULL OR b_status NOT IN ('pending', 'confirmed', 'in_progress') THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM branch WHERE id = b_branch FOR SHARE;
  PERFORM 1 FROM staff_profile WHERE id = NEW.staff_id FOR SHARE;
  IF NOT EXISTS (
    SELECT 1 FROM staff_profile sp
    WHERE sp.id = NEW.staff_id AND sp.is_active AND sp.role_witness IS NOT NULL
      AND (sp.branch_id = b_branch
        OR EXISTS (SELECT 1 FROM branch br WHERE br.id = b_branch AND br.manager_user_id = sp.user_id))
  ) THEN
    RAISE EXCEPTION 'Staff % does not work at branch %', NEW.staff_id, b_branch
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_assignee_works_at_branch';
  END IF;
  IF b_status IN ('confirmed', 'in_progress') AND EXISTS (
    SELECT 1 FROM staff_time_off t
    WHERE t.staff_id = NEW.staff_id
      AND t.date = to_char(b_date, 'YYYY-MM-DD')
      AND t.approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Staff % is on approved leave on %', NEW.staff_id, b_date
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_assignee_on_leave';
  END IF;
  IF b_status = 'confirmed' AND staff_off_schedule(NEW.staff_id, b_branch, b_date, b_start, b_end) THEN
    RAISE EXCEPTION 'Staff % is not scheduled to work at branch % on % from % to %',
      NEW.staff_id, b_branch, b_date, b_start, b_end
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_assignee_off_schedule';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- 3. A booking that becomes confirmed, or a confirmed booking that moves:
--    every person it names works at its branch, isn't on approved leave that
--    day and is scheduled then. Checked at commit, against the booking as it
--    stands, so a move may take its person off it in the same transaction.
CREATE OR REPLACE FUNCTION booking_assignee_recheck()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  b booking%ROWTYPE;
  who text;
BEGIN
  IF NEW.status <> 'confirmed'
     OR (OLD.status = 'confirmed'
         AND (NEW.booking_date, NEW.start_time, NEW.end_time, NEW.branch_id)
             IS NOT DISTINCT FROM (OLD.booking_date, OLD.start_time, OLD.end_time, OLD.branch_id)) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO b FROM booking WHERE id = NEW.id;
  IF NOT FOUND OR b.status <> 'confirmed' THEN
    RETURN NULL;
  END IF;
  FOR who IN
    SELECT DISTINCT staff_id FROM booking_service WHERE booking_id = b.id AND staff_id IS NOT NULL
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM staff_profile sp
      WHERE sp.id = who AND sp.is_active AND sp.role_witness IS NOT NULL
        AND (sp.branch_id = b.branch_id
          OR EXISTS (SELECT 1 FROM branch br WHERE br.id = b.branch_id AND br.manager_user_id = sp.user_id))
    ) THEN
      RAISE EXCEPTION 'Staff % does not work at branch %', who, b.branch_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_assignee_works_at_branch';
    END IF;
    IF EXISTS (
      SELECT 1 FROM staff_time_off t
      WHERE t.staff_id = who
        AND t.date = to_char(b.booking_date, 'YYYY-MM-DD')
        AND t.approval_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Staff % is on approved leave on %', who, b.booking_date
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_assignee_on_leave';
    END IF;
    IF staff_off_schedule(who, b.branch_id, b.booking_date, b.start_time, b.end_time) THEN
      RAISE EXCEPTION 'Staff % is not scheduled to work at branch % on % from % to %',
        who, b.branch_id, b.booking_date, b.start_time, b.end_time
        USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_assignee_off_schedule';
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER booking_assignee_recheck
AFTER UPDATE OF status, booking_date, start_time, end_time, branch_id ON booking
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION booking_assignee_recheck();
