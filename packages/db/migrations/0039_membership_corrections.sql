ALTER TYPE "public"."settlement_entry_kind" ADD VALUE 'membership_correction';--> statement-breakpoint
CREATE TABLE "membership_correction" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"membership_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"original_invoice_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"available_minutes_delta" integer NOT NULL,
	"reason" text NOT NULL,
	"evidence_reference" text,
	"performed_by" text NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_correction_branch_key" UNIQUE("branch_id","idempotency_key"),
	CONSTRAINT "membership_correction_delta_check" CHECK (abs("membership_correction"."available_minutes_delta"::bigint) BETWEEN 1 AND 480),
	CONSTRAINT "membership_correction_reason_check" CHECK (length(btrim("membership_correction"."reason")) BETWEEN 10 AND 500),
	CONSTRAINT "membership_correction_evidence_check" CHECK (length("membership_correction"."evidence_reference") <= 500)
);
--> statement-breakpoint
ALTER TABLE "settlement_entry" DROP CONSTRAINT "settlement_entry_shape_check";--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD COLUMN "membership_correction_id" text;--> statement-breakpoint
ALTER TABLE "membership_correction" ADD CONSTRAINT "membership_correction_membership_id_spa_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."spa_membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_correction" ADD CONSTRAINT "membership_correction_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_correction" ADD CONSTRAINT "membership_correction_original_invoice_id_invoice_id_fk" FOREIGN KEY ("original_invoice_id") REFERENCES "public"."invoice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_correction" ADD CONSTRAINT "membership_correction_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_correction" ADD CONSTRAINT "membership_correction_performed_by_user_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_correction_membership_idx" ON "membership_correction" USING btree ("membership_id","branch_id","performed_at");--> statement-breakpoint
CREATE INDEX "membership_correction_invoice_idx" ON "membership_correction" USING btree ("original_invoice_id","branch_id","performed_at");--> statement-breakpoint
CREATE INDEX "membership_correction_booking_idx" ON "membership_correction" USING btree ("booking_id");--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD CONSTRAINT "settlement_entry_membership_correction_id_membership_correction_id_fk" FOREIGN KEY ("membership_correction_id") REFERENCES "public"."membership_correction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_entry_membership_correction_unique" ON "settlement_entry" USING btree ("membership_correction_id") WHERE membership_correction_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD CONSTRAINT "settlement_entry_shape_check" CHECK (CASE "settlement_entry"."kind"::text
        WHEN 'membership_session' THEN
          "settlement_entry"."spa_membership_id" IS NOT NULL AND "settlement_entry"."booking_id" IS NOT NULL
          AND "settlement_entry"."minutes" > 0 AND "settlement_entry"."gems" IS NULL AND "settlement_entry"."gem_value_paise" IS NULL
          AND "settlement_entry"."loyalty_transaction_id" IS NULL AND "settlement_entry"."reverses_entry_id" IS NULL
          AND "settlement_entry"."membership_correction_id" IS NULL
          AND "settlement_entry"."value_paise" >= 0 AND "settlement_entry"."gst_share_paise" >= 0
        WHEN 'gems_redemption' THEN
          "settlement_entry"."loyalty_transaction_id" IS NOT NULL AND "settlement_entry"."booking_id" IS NOT NULL
          AND "settlement_entry"."gems" > 0 AND "settlement_entry"."gem_value_paise" > 0 AND "settlement_entry"."minutes" IS NULL
          AND "settlement_entry"."spa_membership_id" IS NULL AND "settlement_entry"."reverses_entry_id" IS NULL
          AND "settlement_entry"."membership_correction_id" IS NULL
          AND "settlement_entry"."value_paise" = "settlement_entry"."gems"::bigint * "settlement_entry"."gem_value_paise"
          AND "settlement_entry"."gst_share_paise" = 0
        WHEN 'reversal' THEN
          "settlement_entry"."reverses_entry_id" IS NOT NULL AND "settlement_entry"."note" IS NOT NULL
          AND "settlement_entry"."membership_correction_id" IS NULL
          AND length(btrim("settlement_entry"."note")) > 0
          AND "settlement_entry"."value_paise" <= 0 AND "settlement_entry"."gst_share_paise" <= 0
        WHEN 'membership_correction' THEN
          "settlement_entry"."spa_membership_id" IS NOT NULL AND "settlement_entry"."booking_id" IS NOT NULL
          AND "settlement_entry"."membership_correction_id" IS NOT NULL
          AND "settlement_entry"."owing_branch_id" <> "settlement_entry"."owed_branch_id"
          AND "settlement_entry"."minutes" IS NOT NULL AND "settlement_entry"."minutes" <> 0
          AND "settlement_entry"."gems" IS NULL AND "settlement_entry"."gem_value_paise" IS NULL
          AND "settlement_entry"."loyalty_transaction_id" IS NULL AND "settlement_entry"."reverses_entry_id" IS NULL
          AND "settlement_entry"."note" IS NOT NULL AND length(btrim("settlement_entry"."note")) > 0
        ELSE false
      END);