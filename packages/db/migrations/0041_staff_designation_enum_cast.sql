-- SELECT DISTINCT resolves an untyped literal to text. Cast the reassignment
-- reason explicitly before inserting it into the enum column.
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
  SELECT DISTINCT booking_id, 'designation_changed'::booking_reassignment_reason, NEW.id,
    nullif(current_setting('rgss.staff_designation_actor', true), '')
  FROM released WHERE status = 'confirmed'
  ON CONFLICT (booking_id) WHERE resolved_at IS NULL DO UPDATE
  SET reason = excluded.reason, previous_staff_id = excluded.previous_staff_id,
    created_by_id = excluded.created_by_id;
  RETURN NEW;
END;
$$;
