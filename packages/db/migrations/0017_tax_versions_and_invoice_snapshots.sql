CREATE TYPE "public"."tax_review_status" AS ENUM('provisional', 'reviewed');--> statement-breakpoint
CREATE TABLE "branch_tax_version" (
	"id" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"sac_code" text NOT NULL,
	"rate_bps" integer NOT NULL,
	"prices_include_tax" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"review_status" "tax_review_status" DEFAULT 'provisional' NOT NULL,
	"reason" text NOT NULL,
	"created_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_tax_version_rate_check" CHECK ("branch_tax_version"."rate_bps" BETWEEN 0 AND 2800),
	CONSTRAINT "branch_tax_version_sac_code_check" CHECK ("branch_tax_version"."sac_code" ~ '^[0-9]{6}$'),
	CONSTRAINT "branch_tax_version_inclusive_check" CHECK ("branch_tax_version"."prices_include_tax"),
	CONSTRAINT "branch_tax_version_review_check" CHECK (("branch_tax_version"."review_status" = 'reviewed') = ("branch_tax_version"."reviewed_at" IS NOT NULL)),
	CONSTRAINT "branch_tax_version_reason_check" CHECK (char_length(btrim("branch_tax_version"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_sequence" (
	"branch_id" text NOT NULL,
	"financial_year" text NOT NULL,
	"last_number" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_sequence_branch_id_financial_year_pk" PRIMARY KEY("branch_id","financial_year"),
	CONSTRAINT "invoice_sequence_financial_year_check" CHECK ("invoice_sequence"."financial_year" ~ '^[0-9]{4}$'),
	CONSTRAINT "invoice_sequence_last_number_check" CHECK ("invoice_sequence"."last_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "monthly_gst_summary" DROP CONSTRAINT "monthly_gst_summary_month_unique";--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "invoice_prefix" text;--> statement-breakpoint
-- Hand-edited (reviewed before applying): the prefix is backfilled before it
-- becomes NOT NULL. A branch whose code is already 1–4 characters keeps it as
-- its prefix (RS, MH); any other gets "B" + its number in base 36, which is at
-- most 4 characters up to branch 46655 and can't clash with another number.
CREATE OR REPLACE FUNCTION branch_default_invoice_prefix(branch_number integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  n integer := branch_number;
  encoded text := '';
BEGIN
  IF n IS NULL OR n < 0 THEN
    RAISE EXCEPTION 'branch number % has no default invoice prefix', branch_number
      USING ERRCODE = 'check_violation';
  END IF;
  LOOP
    encoded := substr(digits, (n % 36) + 1, 1) || encoded;
    n := n / 36;
    EXIT WHEN n = 0;
  END LOOP;
  IF length(encoded) > 3 THEN
    RAISE EXCEPTION 'branch number % is too large for a default invoice prefix', branch_number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN 'B' || encoded;
END
$$;--> statement-breakpoint
UPDATE "branch"
   SET "invoice_prefix" = CASE
     WHEN "code" ~ '^[A-Z][A-Z0-9]{0,3}$' THEN "code"
     ELSE branch_default_invoice_prefix("number")
   END;--> statement-breakpoint
ALTER TABLE "branch" ALTER COLUMN "invoice_prefix" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "cgst_paise" integer;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "sgst_paise" integer;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "tax_point_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "financial_year" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "sequence_number" integer;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "tax_review_status" "tax_review_status";--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "issuer_name" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "issuer_legal_name" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "issuer_gstin" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "issuer_address" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "issuer_state" text;--> statement-breakpoint
ALTER TABLE "invoice_item" ADD COLUMN "sac_code" text;--> statement-breakpoint
ALTER TABLE "invoice_item" ADD COLUMN "tax_version_id" text;--> statement-breakpoint
ALTER TABLE "invoice_item" ADD COLUMN "rate_bps" integer;--> statement-breakpoint
ALTER TABLE "invoice_item" ADD COLUMN "discount_paise" integer;--> statement-breakpoint
ALTER TABLE "invoice_item" ADD COLUMN "taxable_value_paise" integer;--> statement-breakpoint
ALTER TABLE "invoice_item" ADD COLUMN "tax_paise" integer;--> statement-breakpoint
ALTER TABLE "invoice_item" ADD COLUMN "cgst_paise" integer;--> statement-breakpoint
ALTER TABLE "invoice_item" ADD COLUMN "sgst_paise" integer;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "sac_code" text;--> statement-breakpoint
ALTER TABLE "service_category" ADD COLUMN "sac_code" text;--> statement-breakpoint
ALTER TABLE "monthly_gst_summary" ADD COLUMN "branch_id" text;--> statement-breakpoint
ALTER TABLE "monthly_gst_summary" ADD COLUMN "issuer_gstin" text;--> statement-breakpoint
ALTER TABLE "monthly_gst_summary" ADD COLUMN "cgst_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_gst_summary" ADD COLUMN "sgst_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "branch_tax_version" ADD CONSTRAINT "branch_tax_version_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_tax_version" ADD CONSTRAINT "branch_tax_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_tax_version" ADD CONSTRAINT "branch_tax_version_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequence" ADD CONSTRAINT "invoice_sequence_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_tax_version_start_uidx" ON "branch_tax_version" USING btree ("branch_id","sac_code","effective_from");--> statement-breakpoint
CREATE INDEX "branch_tax_version_branch_id_idx" ON "branch_tax_version" USING btree ("branch_id");--> statement-breakpoint
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_tax_version_id_branch_tax_version_id_fk" FOREIGN KEY ("tax_version_id") REFERENCES "public"."branch_tax_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_gst_summary" ADD CONSTRAINT "monthly_gst_summary_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_booking_id_uidx" ON "invoice" USING btree ("booking_id") WHERE booking_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_branch_sequence_uidx" ON "invoice" USING btree ("branch_id","financial_year","sequence_number") WHERE sequence_number IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invoice_item_invoice_id_idx" ON "invoice_item" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_item_tax_version_id_idx" ON "invoice_item" USING btree ("tax_version_id");--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_invoice_prefix_unique" UNIQUE("invoice_prefix");--> statement-breakpoint
ALTER TABLE "monthly_gst_summary" ADD CONSTRAINT "monthly_gst_summary_month_branch_issuer_sac_unique" UNIQUE NULLS NOT DISTINCT("month","branch_id","issuer_gstin","sac_code");--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_gstin_check" CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_invoice_prefix_check" CHECK (invoice_prefix ~ '^[A-Z][A-Z0-9]{0,3}$');--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_snapshot_check" CHECK ("invoice"."tax_point_at" IS NULL OR (
        "invoice"."financial_year" ~ '^[0-9]{4}$'
        AND "invoice"."sequence_number" > 0
        AND "invoice"."tax_review_status" IS NOT NULL
        AND "invoice"."issuer_name" IS NOT NULL
        AND "invoice"."issuer_address" IS NOT NULL
        AND "invoice"."cgst_paise" >= 0
        AND "invoice"."sgst_paise" >= 0
        AND "invoice"."cgst_paise" + "invoice"."sgst_paise" = "invoice"."gst_amount_paise"
        AND "invoice"."taxable_value_paise" + "invoice"."gst_amount_paise" = "invoice"."total_amount_paise"
        AND char_length("invoice"."invoice_number") <= 16
      ));--> statement-breakpoint
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_tax_check" CHECK ("invoice_item"."tax_version_id" IS NULL OR (
        "invoice_item"."sac_code" ~ '^[0-9]{6}$'
        AND "invoice_item"."rate_bps" BETWEEN 0 AND 2800
        AND "invoice_item"."discount_paise" BETWEEN 0 AND "invoice_item"."total_price_paise"
        AND "invoice_item"."taxable_value_paise" >= 0
        AND "invoice_item"."tax_paise" >= 0
        AND "invoice_item"."taxable_value_paise" + "invoice_item"."tax_paise" = "invoice_item"."total_price_paise" - "invoice_item"."discount_paise"
        AND "invoice_item"."cgst_paise" >= 0
        AND "invoice_item"."sgst_paise" >= 0
        AND "invoice_item"."cgst_paise" + "invoice_item"."sgst_paise" = "invoice_item"."tax_paise"
      ));--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_sac_code_check" CHECK ("service"."sac_code" IS NULL OR "service"."sac_code" ~ '^[0-9]{6}$');--> statement-breakpoint
ALTER TABLE "service_category" ADD CONSTRAINT "service_category_sac_code_check" CHECK ("service_category"."sac_code" IS NULL OR "service_category"."sac_code" ~ '^[0-9]{6}$');