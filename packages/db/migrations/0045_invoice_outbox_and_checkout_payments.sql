CREATE TABLE "customer_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"amount_paise" integer NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"payment_reference" text,
	"recorded_by" text NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_payment_amount_check" CHECK ("customer_payment"."amount_paise" > 0),
	CONSTRAINT "customer_payment_source_check" CHECK ("customer_payment"."source" = 'service_checkout')
);
--> statement-breakpoint
CREATE TABLE "invoice_issue_outbox" (
	"invoice_id" text PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"event_body" text,
	"published_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_payment_allocation" (
	"payment_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_payment_allocation_payment_id_invoice_id_pk" PRIMARY KEY("payment_id","invoice_id"),
	CONSTRAINT "invoice_payment_allocation_amount_check" CHECK ("invoice_payment_allocation"."amount_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "customer_payment" ADD CONSTRAINT "customer_payment_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment" ADD CONSTRAINT "customer_payment_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_issue_outbox" ADD CONSTRAINT "invoice_issue_outbox_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_payment_id_branch_uidx" ON "customer_payment" USING btree ("id","branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_id_branch_uidx" ON "invoice" USING btree ("id","branch_id");--> statement-breakpoint
ALTER TABLE "invoice_payment_allocation" ADD CONSTRAINT "invoice_payment_allocation_payment_branch_fk" FOREIGN KEY ("payment_id","branch_id") REFERENCES "public"."customer_payment"("id","branch_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payment_allocation" ADD CONSTRAINT "invoice_payment_allocation_invoice_branch_fk" FOREIGN KEY ("invoice_id","branch_id") REFERENCES "public"."invoice"("id","branch_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_payment_source_uidx" ON "customer_payment" USING btree ("source","source_key");--> statement-breakpoint
CREATE INDEX "customer_payment_branch_received_idx" ON "customer_payment" USING btree ("branch_id","received_at");--> statement-breakpoint
CREATE INDEX "invoice_issue_outbox_pending_idx" ON "invoice_issue_outbox" USING btree ("ready_at","captured_at","invoice_id") WHERE "invoice_issue_outbox"."published_at" IS NULL AND "invoice_issue_outbox"."failed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "invoice_payment_allocation_invoice_idx" ON "invoice_payment_allocation" USING btree ("invoice_id");
