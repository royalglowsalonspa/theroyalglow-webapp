-- Multi-branch R1.10: a shut-down branch takes no new bookings or invoices, and
-- a branch can be shut down only once nothing is left to resolve there.
--
-- Both checks lock the branch row. A booking or invoice written while the
-- branch is being shut down therefore either commits first, and then blocks
-- the shutdown, or waits and sees the shutdown. (Under READ COMMITTED a
-- FOR SHARE lock follows the row to its newest version, and each statement in
-- the shutdown check takes a fresh snapshot after the row lock is held.)
--
-- Hand-written: Drizzle can't declare triggers. Not in the drift snapshot.
CREATE FUNCTION "public"."assert_branch_open_for_activity"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  branch_status text;
BEGIN
  SELECT status INTO branch_status FROM branch WHERE id = NEW.branch_id FOR SHARE;
  IF branch_status = 'shutdown' THEN
    RAISE EXCEPTION 'Branch % is shut down', NEW.branch_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'branch_shut_down';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "booking_branch_open"
BEFORE INSERT OR UPDATE OF "branch_id" ON "booking"
FOR EACH ROW EXECUTE FUNCTION "public"."assert_branch_open_for_activity"();--> statement-breakpoint
CREATE TRIGGER "invoice_branch_open"
BEFORE INSERT OR UPDATE OF "branch_id" ON "invoice"
FOR EACH ROW EXECUTE FUNCTION "public"."assert_branch_open_for_activity"();--> statement-breakpoint
-- What must be resolved first: the Manager, everyone working there, bookings
-- still to happen, unpaid invoices and open waitlist entries. The app lists
-- them (getBranchShutdownBlockers); this refuses. Schedule days left at the
-- branch belong to people who no longer work there; the shutdown write clears
-- them in the same transaction (shutDownBranch).
CREATE FUNCTION "public"."branch_shutdown_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.manager_user_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM staff_profile WHERE branch_id = NEW.id AND is_active)
    OR EXISTS (
      SELECT 1 FROM booking
      WHERE branch_id = NEW.id AND status IN ('pending', 'confirmed', 'in_progress')
    )
    OR EXISTS (SELECT 1 FROM invoice WHERE branch_id = NEW.id AND payment_status = 'pending')
    OR EXISTS (
      SELECT 1 FROM waitlist WHERE branch_id = NEW.id AND status IN ('waiting', 'notified')
    )
  THEN
    RAISE EXCEPTION 'Branch % still has people, bookings or payments to resolve', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'branch_shutdown_unresolved';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "branch_shutdown_resolved"
BEFORE UPDATE OF "status" ON "branch"
FOR EACH ROW
WHEN (NEW.status = 'shutdown' AND OLD.status IS DISTINCT FROM 'shutdown')
EXECUTE FUNCTION "public"."branch_shutdown_check"();
