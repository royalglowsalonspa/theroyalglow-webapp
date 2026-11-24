import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

// Offers in Payload (multi-branch offers.md): the "Show on website" tick, the
// checkout rule group with its linked services (`offer_rels`), editor
// attribution and version history. Reviewed 21/11/2026: additive only. The
// card image stops being required (a counter-only rule needs none); every
// existing offer keeps its image, is shown on the website and has no rule, so
// nothing reaches checkout until an editor adds one. The application's mirror
// columns come from app migrations 0035–0036, which go in first.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_offer_rule_type" AS ENUM('none', 'percentage', 'flat', 'combo_price');
  CREATE TYPE "cms"."enum__offer_v_version_category" AS ENUM('all', 'salon', 'spa', 'bridal', 'nails', 'skincare');
  CREATE TYPE "cms"."enum__offer_v_version_rule_type" AS ENUM('none', 'percentage', 'flat', 'combo_price');
  CREATE TABLE "cms"."offer_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"service_id" varchar
  );
  
  CREATE TABLE "cms"."_offer_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar NOT NULL,
  	"version_description" varchar,
  	"version_discount_label" varchar,
  	"version_image_id" integer,
  	"version_cta_label" varchar DEFAULT 'Book Now',
  	"version_cta_href" varchar DEFAULT '/?book=1',
  	"version_category" "cms"."enum__offer_v_version_category" DEFAULT 'all',
  	"version_active" boolean DEFAULT true NOT NULL,
  	"version_show_on_website" boolean DEFAULT true NOT NULL,
  	"version_valid_from" timestamp(3) with time zone,
  	"version_valid_until" timestamp(3) with time zone,
  	"version_rule_type" "cms"."enum__offer_v_version_rule_type" DEFAULT 'none' NOT NULL,
  	"version_rule_percentage" numeric,
  	"version_rule_amount_paise" numeric,
  	"version_rule_combo_price_paise" numeric,
  	"version_rule_terms" varchar,
  	"version_order" numeric,
  	"version_edited_by" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."_offer_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"service_id" varchar
  );
  
  ALTER TABLE "cms"."offer" ALTER COLUMN "image_id" DROP NOT NULL;
  ALTER TABLE "cms"."offer" ADD COLUMN "show_on_website" boolean DEFAULT true NOT NULL;
  ALTER TABLE "cms"."offer" ADD COLUMN "rule_type" "cms"."enum_offer_rule_type" DEFAULT 'none' NOT NULL;
  ALTER TABLE "cms"."offer" ADD COLUMN "rule_percentage" numeric;
  ALTER TABLE "cms"."offer" ADD COLUMN "rule_amount_paise" numeric;
  ALTER TABLE "cms"."offer" ADD COLUMN "rule_combo_price_paise" numeric;
  ALTER TABLE "cms"."offer" ADD COLUMN "rule_terms" varchar;
  ALTER TABLE "cms"."offer" ADD COLUMN "edited_by" varchar;
  ALTER TABLE "cms"."offer_rels" ADD CONSTRAINT "offer_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."offer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."offer_rels" ADD CONSTRAINT "offer_rels_service_fk" FOREIGN KEY ("service_id") REFERENCES "cms"."service"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_offer_v" ADD CONSTRAINT "_offer_v_parent_id_offer_id_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."offer"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_offer_v" ADD CONSTRAINT "_offer_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_offer_v_rels" ADD CONSTRAINT "_offer_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."_offer_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_offer_v_rels" ADD CONSTRAINT "_offer_v_rels_service_fk" FOREIGN KEY ("service_id") REFERENCES "cms"."service"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "offer_rels_order_idx" ON "cms"."offer_rels" USING btree ("order");
  CREATE INDEX "offer_rels_parent_idx" ON "cms"."offer_rels" USING btree ("parent_id");
  CREATE INDEX "offer_rels_path_idx" ON "cms"."offer_rels" USING btree ("path");
  CREATE INDEX "offer_rels_service_id_idx" ON "cms"."offer_rels" USING btree ("service_id");
  CREATE INDEX "_offer_v_parent_idx" ON "cms"."_offer_v" USING btree ("parent_id");
  CREATE INDEX "_offer_v_version_version_image_idx" ON "cms"."_offer_v" USING btree ("version_image_id");
  CREATE INDEX "_offer_v_version_version_updated_at_idx" ON "cms"."_offer_v" USING btree ("version_updated_at");
  CREATE INDEX "_offer_v_version_version_created_at_idx" ON "cms"."_offer_v" USING btree ("version_created_at");
  CREATE INDEX "_offer_v_created_at_idx" ON "cms"."_offer_v" USING btree ("created_at");
  CREATE INDEX "_offer_v_updated_at_idx" ON "cms"."_offer_v" USING btree ("updated_at");
  CREATE INDEX "_offer_v_rels_order_idx" ON "cms"."_offer_v_rels" USING btree ("order");
  CREATE INDEX "_offer_v_rels_parent_idx" ON "cms"."_offer_v_rels" USING btree ("parent_id");
  CREATE INDEX "_offer_v_rels_path_idx" ON "cms"."_offer_v_rels" USING btree ("path");
  CREATE INDEX "_offer_v_rels_service_id_idx" ON "cms"."_offer_v_rels" USING btree ("service_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."offer_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_offer_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_offer_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."offer_rels" CASCADE;
  DROP TABLE "cms"."_offer_v" CASCADE;
  DROP TABLE "cms"."_offer_v_rels" CASCADE;
  ALTER TABLE "cms"."offer" ALTER COLUMN "image_id" SET NOT NULL;
  ALTER TABLE "cms"."offer" DROP COLUMN "show_on_website";
  ALTER TABLE "cms"."offer" DROP COLUMN "rule_type";
  ALTER TABLE "cms"."offer" DROP COLUMN "rule_percentage";
  ALTER TABLE "cms"."offer" DROP COLUMN "rule_amount_paise";
  ALTER TABLE "cms"."offer" DROP COLUMN "rule_combo_price_paise";
  ALTER TABLE "cms"."offer" DROP COLUMN "rule_terms";
  ALTER TABLE "cms"."offer" DROP COLUMN "edited_by";
  DROP TYPE "cms"."enum_offer_rule_type";
  DROP TYPE "cms"."enum__offer_v_version_category";
  DROP TYPE "cms"."enum__offer_v_version_rule_type";`)
}
