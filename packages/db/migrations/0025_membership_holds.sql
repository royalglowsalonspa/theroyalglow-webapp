CREATE TYPE "public"."membership_hold_state" AS ENUM('held', 'consumed', 'released');--> statement-breakpoint
CREATE TABLE "membership_hold" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"spa_membership_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"minutes" integer NOT NULL,
	"state" "membership_hold_state" DEFAULT 'held' NOT NULL,
	"held_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	CONSTRAINT "membership_hold_booking_unique" UNIQUE("booking_id"),
	CONSTRAINT "membership_hold_minutes_check" CHECK ("membership_hold"."minutes" > 0),
	CONSTRAINT "membership_hold_state_check" CHECK (CASE "membership_hold"."state"
        WHEN 'held' THEN "membership_hold"."consumed_at" IS NULL AND "membership_hold"."released_at" IS NULL
        WHEN 'consumed' THEN "membership_hold"."consumed_at" IS NOT NULL AND "membership_hold"."released_at" IS NULL
        WHEN 'released' THEN "membership_hold"."released_at" IS NOT NULL AND "membership_hold"."consumed_at" IS NULL
        ELSE false
      END)
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spa_membership" ADD COLUMN "reserved_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_hold" ADD CONSTRAINT "membership_hold_spa_membership_id_spa_membership_id_fk" FOREIGN KEY ("spa_membership_id") REFERENCES "public"."spa_membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_hold" ADD CONSTRAINT "membership_hold_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_hold" ADD CONSTRAINT "membership_hold_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_hold_membership_held_idx" ON "membership_hold" USING btree ("spa_membership_id") WHERE state = 'held';--> statement-breakpoint
ALTER TABLE "spa_membership" ADD CONSTRAINT "spa_membership_reserved_check" CHECK ("spa_membership"."reserved_minutes" >= 0 AND "spa_membership"."used_hours_minutes" + "spa_membership"."reserved_minutes" <= "spa_membership"."total_hours_minutes");