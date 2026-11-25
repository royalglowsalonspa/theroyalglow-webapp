CREATE TABLE "customer_booking_request" (
	"customer_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"booking_id" text NOT NULL,
	CONSTRAINT "customer_booking_request_customer_id_request_key_pk" PRIMARY KEY("customer_id","request_key"),
	CONSTRAINT "customer_booking_request_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
ALTER TABLE "customer_booking_request" ADD CONSTRAINT "customer_booking_request_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_booking_request" ADD CONSTRAINT "customer_booking_request_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;