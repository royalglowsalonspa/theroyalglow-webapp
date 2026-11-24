ALTER TABLE "invoice" ADD COLUMN "offer_id" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "offer_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "offer_type_snapshot" "discount_type";--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "offer_value_snapshot" integer;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "cms_id" integer;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "show_on_website" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_offer_id_idx" ON "invoice" USING btree ("offer_id") WHERE offer_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_cms_id_unique" UNIQUE("cms_id");--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_offer_snapshot_check" CHECK (("invoice"."offer_id" IS NULL) = ("invoice"."offer_name_snapshot" IS NULL)
        AND ("invoice"."offer_id" IS NULL) = ("invoice"."offer_type_snapshot" IS NULL)
        AND ("invoice"."offer_id" IS NULL) = ("invoice"."offer_value_snapshot" IS NULL)
        AND coalesce("invoice"."offer_value_snapshot", 1) > 0);--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_cms_rule_check" CHECK ("offer"."cms_id" IS NULL OR (
        "offer"."id" = 'cms_offer_' || "offer"."cms_id"::text
        AND "offer"."end_date" >= "offer"."start_date"
        AND (
          ("offer"."offer_type" = 'percentage'
            AND coalesce("offer"."discount_percentage", 0) BETWEEN 1 AND 100
            AND "offer"."discount_amount_paise" IS NULL AND "offer"."combo_price_paise" IS NULL)
          OR ("offer"."offer_type" = 'flat'
            AND coalesce("offer"."discount_amount_paise", 0) > 0
            AND "offer"."discount_percentage" IS NULL AND "offer"."combo_price_paise" IS NULL)
          OR ("offer"."offer_type" = 'combo_price'
            AND coalesce("offer"."combo_price_paise", 0) > 0
            AND "offer"."discount_percentage" IS NULL AND "offer"."discount_amount_paise" IS NULL)
        )
      ));