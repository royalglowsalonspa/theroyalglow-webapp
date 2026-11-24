CREATE TABLE "membership_session_completion" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"remaining_minutes" integer NOT NULL,
	CONSTRAINT "membership_session_completion_actor_key" UNIQUE("actor_id","idempotency_key"),
	CONSTRAINT "membership_session_completion_minutes_check" CHECK ("membership_session_completion"."remaining_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "membership_session_completion" ADD CONSTRAINT "membership_session_completion_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_session_completion" ADD CONSTRAINT "membership_session_completion_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;