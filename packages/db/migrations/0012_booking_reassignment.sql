CREATE TYPE "public"."booking_reassignment_reason" AS ENUM('left_branch', 'unavailable', 'overrun');--> statement-breakpoint
CREATE TYPE "public"."booking_reassignment_resolution" AS ENUM('reassigned', 'booking_ended');--> statement-breakpoint
CREATE TABLE "booking_reassignment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"booking_id" text NOT NULL,
	"reason" "booking_reassignment_reason" NOT NULL,
	"previous_staff_id" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" "booking_reassignment_resolution",
	"resolved_by_id" text,
	CONSTRAINT "booking_reassignment_resolution_check" CHECK ((resolved_at IS NULL AND resolution IS NULL AND resolved_by_id IS NULL)
        OR (resolved_at IS NOT NULL AND resolution IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "booking_reassignment" ADD CONSTRAINT "booking_reassignment_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reassignment" ADD CONSTRAINT "booking_reassignment_previous_staff_id_staff_profile_id_fk" FOREIGN KEY ("previous_staff_id") REFERENCES "public"."staff_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reassignment" ADD CONSTRAINT "booking_reassignment_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reassignment" ADD CONSTRAINT "booking_reassignment_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_reassignment_open_uidx" ON "booking_reassignment" USING btree ("booking_id") WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE INDEX "booking_reassignment_booking_id_idx" ON "booking_reassignment" USING btree ("booking_id");