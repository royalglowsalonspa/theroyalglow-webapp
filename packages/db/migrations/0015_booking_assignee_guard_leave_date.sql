-- Fix for 0014: staff_time_off.date is text ('YYYY-MM-DD'), not date, so the
-- leave check compared text with date and every guarded assignment failed.
-- Compare it with the booking date formatted the same way: independent of the
-- session DateStyle, and no cast of stored text that could fail.
--
-- Hand-written: Drizzle can't declare triggers. Not in the drift snapshot.
CREATE OR REPLACE FUNCTION "public"."assert_booking_assignee"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  b_status text;
  b_branch text;
  b_date date;
BEGIN
  SELECT status, branch_id, booking_date INTO b_status, b_branch, b_date
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

  RETURN NEW;
END;
$$;
