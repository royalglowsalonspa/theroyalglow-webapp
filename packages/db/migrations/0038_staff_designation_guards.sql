-- Protect new work allocations while keeping completed and running history.
CREATE OR REPLACE FUNCTION staff_designation_matches(p_designation text, p_kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT p_designation IN ('manager', 'receptionist')
    OR (p_designation = 'therapist' AND p_kind = 'spa')
    OR (p_designation = 'stylist' AND p_kind = 'salon');
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION assert_booking_line_designation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target booking%ROWTYPE;
  title text;
BEGIN
  SELECT * INTO target FROM booking WHERE id = NEW.booking_id;
  IF target.status NOT IN ('pending', 'confirmed', 'in_progress') THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM branch WHERE id = target.branch_id FOR SHARE;
  SELECT designation INTO title FROM staff_profile WHERE id = NEW.staff_id FOR SHARE;
  IF NOT coalesce(staff_designation_matches(title, target.service_type::text), false) THEN
    RAISE EXCEPTION 'Staff designation does not match the booking type'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_assignee_designation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER booking_line_designation_guard
BEFORE INSERT OR UPDATE OF staff_id, booking_id ON booking_service
FOR EACH ROW WHEN (NEW.staff_id IS NOT NULL)
EXECUTE FUNCTION assert_booking_line_designation();--> statement-breakpoint

-- A designation update and a competing assignment both lock the profile.
-- Confirmed bookings released by the change are visible on the dashboard.
CREATE OR REPLACE FUNCTION release_ineligible_staff_designation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  WITH released AS (
    UPDATE booking_service bs SET staff_id = NULL
    FROM booking b
    WHERE bs.booking_id = b.id AND bs.staff_id = NEW.id
      AND b.status IN ('pending', 'confirmed')
      AND ((b.booking_date + b.start_time) AT TIME ZONE 'Asia/Kolkata') >= now()
      AND NOT staff_designation_matches(NEW.designation::text, b.service_type::text)
    RETURNING bs.booking_id, b.status
  )
  INSERT INTO booking_reassignment (booking_id, reason, previous_staff_id, created_by_id)
  SELECT DISTINCT booking_id, 'designation_changed', NEW.id,
    nullif(current_setting('rgss.staff_designation_actor', true), '')
  FROM released WHERE status = 'confirmed'
  ON CONFLICT (booking_id) WHERE resolved_at IS NULL DO UPDATE
  SET reason = excluded.reason, previous_staff_id = excluded.previous_staff_id,
    created_by_id = excluded.created_by_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER staff_designation_release_future
AFTER UPDATE OF designation ON staff_profile
FOR EACH ROW WHEN (NEW.designation IS DISTINCT FROM OLD.designation)
EXECUTE FUNCTION release_ineligible_staff_designation();--> statement-breakpoint

-- Refuse a start with an incompatible legacy assignment. Leave approval
-- and ordinary reschedules free to move or clear the allocation first.
CREATE OR REPLACE FUNCTION assert_booking_designation_at_start() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM staff_profile sp
  WHERE sp.id IN (SELECT staff_id FROM booking_service WHERE booking_id = NEW.id)
  ORDER BY sp.id FOR SHARE;
  IF EXISTS (
    SELECT 1 FROM booking_service bs JOIN staff_profile sp ON sp.id = bs.staff_id
    WHERE bs.booking_id = NEW.id
      AND NOT staff_designation_matches(sp.designation::text, NEW.service_type::text)
  ) OR EXISTS (
    SELECT 1 FROM booking_reassignment
    WHERE booking_id = NEW.id AND resolved_at IS NULL AND reason = 'designation_changed'
  ) THEN
    RAISE EXCEPTION 'Staff designation does not match the booking type'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_assignee_designation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER booking_start_designation_guard
BEFORE UPDATE OF status, service_type ON booking
FOR EACH ROW WHEN ((NEW.status = 'in_progress' AND OLD.status <> 'in_progress')
  OR (NEW.service_type IS DISTINCT FROM OLD.service_type
      AND NEW.status IN ('pending', 'confirmed', 'in_progress')))
EXECUTE FUNCTION assert_booking_designation_at_start();
