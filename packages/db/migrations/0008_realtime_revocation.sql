CREATE TYPE "public"."realtime_revocation_outcome" AS ENUM('revoked', 'expired', 'not_configured');--> statement-breakpoint
CREATE TABLE "realtime_revocation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"outcome" realtime_revocation_outcome,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "realtime_revocation_resolved_check" CHECK ((outcome IS NULL) = (resolved_at IS NULL))
);
--> statement-breakpoint
ALTER TABLE "realtime_revocation" ADD CONSTRAINT "realtime_revocation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "realtime_revocation_pending_idx" ON "realtime_revocation" USING btree ("requested_at") WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE INDEX "realtime_revocation_user_id_idx" ON "realtime_revocation" USING btree ("user_id");