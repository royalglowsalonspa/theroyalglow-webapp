-- Multi-branch R1.7, R5.2, R5.8 (MS-09): a booking still to happen can only be
-- assigned to someone who works at its branch, and a confirmed or running one
-- not to someone on approved leave that day. Checked on every path that writes
-- booking_service.staff_id: the web app, the admin app, jobs and direct SQL.
-- Pending bookings carry a tentative assignee that approval replaces, so leave
-- is checked from confirmation on. Finished bookings keep their history.
--
-- Locks: the branch row FOR SHARE, as role changes lock every branch row FOR
-- NO KEY UPDATE first, and the staff profile FOR SHARE, as a leave decision
-- locks it first. Either the other change commits first and this check sees
-- it, or it waits for this write and then releases what it assigned
-- (releaseAssignments*, packages/db/src/queries/reassignments.ts). Each query
-- in this volatile function takes a fresh snapshot after the locks are held.
--
-- Hand-written: Drizzle can't declare triggers. Not in the drift snapshot.
CREATE FUNCTION "public"."assert_booking_assignee"() RETURNS trigger
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
    WHERE t.staff_id = NEW.staff_id AND t.date = b_date AND t.approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Staff % is on approved leave on %', NEW.staff_id, b_date
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_assignee_on_leave';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "booking_assignee_guard"
BEFORE INSERT OR UPDATE OF "staff_id" ON "booking_service"
FOR EACH ROW
WHEN (NEW.staff_id IS NOT NULL)
EXECUTE FUNCTION "public"."assert_booking_assignee"();
