-- 0030: an overrun flag ends when its booking starts (membership-scheduling.md
-- slice 2b, MS-08). Hand-written; reviewed before use. Rerunnable.
--
-- A booking whose assignee is still with another customer when it is due
-- gets open reassignment work with reason 'overrun' and keeps its assignee:
-- reception waits for them or assigns someone else. Assigning someone closes
-- it as 'reassigned' (in the assigning write, with the actor); ending the
-- booking closes it as 'booking_ended' (0013). This closes it as 'started'
-- once the booking goes ahead, whichever path started it.
--
-- 'started' is added by 0029 in the same migration run, so it appears only
-- inside the function body, which runs after the run commits (enum trap).

DROP TRIGGER IF EXISTS booking_reassignment_close_on_start ON booking;--> statement-breakpoint

CREATE OR REPLACE FUNCTION close_booking_reassignment_on_start()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE booking_reassignment
     SET resolved_at = now(), resolution = 'started'
   WHERE booking_id = NEW.id AND resolved_at IS NULL;
  RETURN NULL;
END
$$;--> statement-breakpoint

CREATE TRIGGER booking_reassignment_close_on_start
AFTER UPDATE OF status ON booking
FOR EACH ROW
WHEN (NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION close_booking_reassignment_on_start();
