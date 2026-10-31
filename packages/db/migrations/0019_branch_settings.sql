CREATE TYPE "public"."branch_setting_section" AS ENUM('business_hours', 'booking_rules');--> statement-breakpoint
CREATE TABLE "branch_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"revision" integer NOT NULL,
	"business_hours" jsonb NOT NULL,
	"booking_rules" jsonb NOT NULL,
	"changed_section" "branch_setting_section",
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_setting_branch_revision_unique" UNIQUE("branch_id","revision"),
	CONSTRAINT "branch_setting_revision_check" CHECK ("branch_setting"."revision" > 0),
	CONSTRAINT "branch_setting_document_check" CHECK (jsonb_typeof("branch_setting"."business_hours") = 'object' AND jsonb_typeof("branch_setting"."booking_rules") = 'object')
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "settings_revision" integer;--> statement-breakpoint
ALTER TABLE "booking_status_log" ADD COLUMN "settings_revision" integer;--> statement-breakpoint
ALTER TABLE "branch_setting" ADD CONSTRAINT "branch_setting_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_setting" ADD CONSTRAINT "branch_setting_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_branch_settings_revision_fk" FOREIGN KEY ("branch_id","settings_revision") REFERENCES "public"."branch_setting"("branch_id","revision") ON DELETE restrict ON UPDATE no action;