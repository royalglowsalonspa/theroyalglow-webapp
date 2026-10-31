-- Custom SQL migration file, put your code below! --
-- Branch availability of the service catalogue (multi-branch tasks §6,
-- catalogue-availability.md). 0033 added `all_branches` and the join tables
-- `service_branch` and `service_category_branch`; Payload's sync writes them.

-- 1. Whether a service is offered at a branch: its own availability and its
--    category's both include the branch (R4.2). "All branches" includes
--    branches added later. False for an unknown service.
CREATE OR REPLACE FUNCTION "public"."service_available_at"(p_service_id text, p_branch_id text)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM service s
      JOIN service_category c ON c.id = s.category_id
     WHERE s.id = p_service_id
       AND (s.all_branches OR EXISTS (
             SELECT 1 FROM service_branch sb
              WHERE sb.service_id = s.id AND sb.branch_id = p_branch_id))
       AND (c.all_branches OR EXISTS (
             SELECT 1 FROM service_category_branch cb
              WHERE cb.category_id = c.id AND cb.branch_id = p_branch_id))
  )
$$;--> statement-breakpoint

-- 2. A booking line is only added for a service its booking's branch offers
--    (R4.3), whatever writes it: customer bookings, walk-ins, membership
--    sessions and gems redemptions. Existing lines keep their service when the
--    catalogue changes later (R4.4): only an insert, or a change of service,
--    is checked. A missing booking or service is left to the foreign keys.
CREATE OR REPLACE FUNCTION "public"."booking_service_availability_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  b_branch text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.service_id IS NOT DISTINCT FROM OLD.service_id THEN
    RETURN NEW;
  END IF;
  SELECT branch_id INTO b_branch FROM booking WHERE id = NEW.booking_id;
  IF b_branch IS NULL OR NOT EXISTS (SELECT 1 FROM service WHERE id = NEW.service_id) THEN
    RETURN NEW;
  END IF;
  IF NOT service_available_at(NEW.service_id, b_branch) THEN
    RAISE EXCEPTION 'Service % is not offered at branch %', NEW.service_id, b_branch
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_service_branch_availability';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS booking_service_availability_guard ON booking_service;--> statement-breakpoint
CREATE TRIGGER booking_service_availability_guard
  BEFORE INSERT OR UPDATE OF service_id ON booking_service
  FOR EACH ROW EXECUTE FUNCTION booking_service_availability_guard();
