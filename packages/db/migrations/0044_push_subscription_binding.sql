ALTER TABLE "push_subscription" ADD COLUMN "binding_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- The table lock from ALTER TABLE lasts through this migration. Preserve old
-- duplicate rows as inactive history, with the latest registration kept live.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY endpoint ORDER BY updated_at DESC, created_at DESC, id DESC
  ) AS position
  FROM push_subscription
  WHERE is_active
)
UPDATE push_subscription AS subscription
   SET is_active = false
  FROM ranked
 WHERE subscription.id = ranked.id AND ranked.position > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_active_endpoint_uidx" ON "push_subscription" USING btree ("endpoint") WHERE is_active = true;--> statement-breakpoint
-- Advance the generation even for a retry with identical keys, including
-- during rolling deployments when a previous app version still writes.
CREATE FUNCTION public.advance_push_subscription_binding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.binding_version := OLD.binding_version + 1;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER push_subscription_binding_advance
BEFORE UPDATE OF user_id, p256dh_key, auth_key, is_active ON push_subscription
FOR EACH ROW EXECUTE FUNCTION public.advance_push_subscription_binding();
