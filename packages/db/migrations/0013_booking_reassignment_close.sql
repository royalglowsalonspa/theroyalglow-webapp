-- Multi-branch R1.7: reassignment work ends with its booking. When a booking
-- is cancelled, rejected, missed, rescheduled or completed, its open
-- reassignment entry closes as 'booking_ended', whichever path changed the
-- status: the web app, the admin app, a job or direct SQL. Assigning someone
-- else closes it as 'reassigned' in the assigning write itself, with the actor.
--
-- Hand-written: Drizzle can't declare triggers. Not in the drift snapshot.
CREATE FUNCTION "public"."close_booking_reassignment_on_end"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE booking_reassignment
  SET resolved_at = now(), resolution = 'booking_ended'
  WHERE booking_id = NEW.id AND resolved_at IS NULL;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "booking_reassignment_close_on_end"
AFTER UPDATE OF "status" ON "booking"
FOR EACH ROW
WHEN (
  NEW.status NOT IN ('pending', 'confirmed', 'in_progress')
  AND OLD.status IS DISTINCT FROM NEW.status
)
EXECUTE FUNCTION "public"."close_booking_reassignment_on_end"();
