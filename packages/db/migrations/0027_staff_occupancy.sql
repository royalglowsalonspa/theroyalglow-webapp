CREATE TABLE "staff_occupancy" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"kind" "service_type" NOT NULL,
	"during" "tstzrange" NOT NULL,
	CONSTRAINT "staff_occupancy_during_check" CHECK (NOT isempty("staff_occupancy"."during") AND NOT lower_inf("staff_occupancy"."during")
        AND NOT upper_inf("staff_occupancy"."during") AND lower_inc("staff_occupancy"."during")
        AND NOT upper_inc("staff_occupancy"."during"))
);
--> statement-breakpoint
CREATE TABLE "staff_work" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"kind" "service_type" NOT NULL,
	"during" "tstzrange" NOT NULL,
	CONSTRAINT "staff_work_during_check" CHECK (NOT isempty("staff_work"."during") AND NOT lower_inf("staff_work"."during")
        AND lower_inc("staff_work"."during") AND NOT upper_inc("staff_work"."during"))
);
--> statement-breakpoint
ALTER TABLE "staff_occupancy" ADD CONSTRAINT "staff_occupancy_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_occupancy" ADD CONSTRAINT "staff_occupancy_staff_id_staff_profile_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_occupancy" ADD CONSTRAINT "staff_occupancy_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_work" ADD CONSTRAINT "staff_work_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_work" ADD CONSTRAINT "staff_work_staff_id_staff_profile_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_work" ADD CONSTRAINT "staff_work_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_service_booking_id_idx" ON "booking_service" USING btree ("booking_id");