import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_service_category_sac_code" AS ENUM('999721', '999722', '999723', '999729');
  CREATE TYPE "cms"."enum_service_category_availability" AS ENUM('all', 'selected');
  CREATE TYPE "cms"."enum__service_category_v_version_service_type" AS ENUM('salon', 'spa');
  CREATE TYPE "cms"."enum__service_category_v_version_sac_code" AS ENUM('999721', '999722', '999723', '999729');
  CREATE TYPE "cms"."enum__service_category_v_version_availability" AS ENUM('all', 'selected');
  CREATE TYPE "cms"."enum_service_sac_code" AS ENUM('999721', '999722', '999723', '999729');
  CREATE TYPE "cms"."enum_service_availability" AS ENUM('all', 'selected');
  CREATE TYPE "cms"."enum__service_v_version_duration_minutes" AS ENUM('15', '30', '45', '60', '90', '120', '150', '180');
  CREATE TYPE "cms"."enum__service_v_version_sac_code" AS ENUM('999721', '999722', '999723', '999729');
  CREATE TYPE "cms"."enum__service_v_version_availability" AS ENUM('all', 'selected');
  CREATE TABLE "cms"."service_category_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "cms"."_service_category_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" varchar,
  	"version_name" varchar NOT NULL,
  	"version_slug" varchar NOT NULL,
  	"version_description" varchar,
  	"version_service_type" "cms"."enum__service_category_v_version_service_type" NOT NULL,
  	"version_display_order" numeric DEFAULT 0,
  	"version_is_active" boolean DEFAULT true,
  	"version_sac_code" "cms"."enum__service_category_v_version_sac_code" NOT NULL,
  	"version_availability" "cms"."enum__service_category_v_version_availability" DEFAULT 'all' NOT NULL,
  	"version_edited_by" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."_service_category_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "cms"."service_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "cms"."_service_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" varchar,
  	"version_category_id_id" varchar NOT NULL,
  	"version_name" varchar NOT NULL,
  	"version_slug" varchar NOT NULL,
  	"version_description" varchar,
  	"version_duration_minutes" "cms"."enum__service_v_version_duration_minutes" NOT NULL,
  	"version_buffer_minutes" numeric DEFAULT 0,
  	"version_price_paise" numeric NOT NULL,
  	"version_is_active" boolean DEFAULT true,
  	"version_image_url" varchar,
  	"version_display_order" numeric DEFAULT 0,
  	"version_gems_redeemable" boolean DEFAULT false,
  	"version_gems_required" numeric,
  	"version_gems_catalogue_order" numeric,
  	"version_sac_code" "cms"."enum__service_v_version_sac_code",
  	"version_availability" "cms"."enum__service_v_version_availability" DEFAULT 'all' NOT NULL,
  	"version_edited_by" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."_service_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "cms"."service_category" ADD COLUMN "sac_code" "cms"."enum_service_category_sac_code";
  ALTER TABLE "cms"."service_category" ADD COLUMN "availability" "cms"."enum_service_category_availability" DEFAULT 'all' NOT NULL;
  ALTER TABLE "cms"."service_category" ADD COLUMN "edited_by" varchar;
  ALTER TABLE "cms"."service" ADD COLUMN "sac_code" "cms"."enum_service_sac_code";
  ALTER TABLE "cms"."service" ADD COLUMN "availability" "cms"."enum_service_availability" DEFAULT 'all' NOT NULL;
  ALTER TABLE "cms"."service" ADD COLUMN "edited_by" varchar;

  -- Hand-added (reviewed): carry over what the application already holds
  -- (multi-branch catalogue-availability.md), so the first CMS save after this
  -- migration doesn't overwrite it: the SAC codes app migration 0018 seeded,
  -- and any branch availability app migration 0033 stores. Skipped where the
  -- app migrations haven't run (the rollout applies them first).
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'service_category'
                  AND column_name = 'sac_code') THEN
      UPDATE "cms"."service_category" c
         SET "sac_code" = p.sac_code::"cms"."enum_service_category_sac_code"
        FROM public.service_category p
       WHERE p.id = c.id AND p.sac_code IN ('999721', '999722', '999723', '999729');
      UPDATE "cms"."service" c
         SET "sac_code" = p.sac_code::"cms"."enum_service_sac_code"
        FROM public.service p
       WHERE p.id = c.id AND p.sac_code IN ('999721', '999722', '999723', '999729');
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'service_branch') THEN
      UPDATE "cms"."service_category" c SET "availability" = 'selected'
        FROM public.service_category p
       WHERE p.id = c.id AND NOT p.all_branches;
      INSERT INTO "cms"."service_category_texts" ("order", "parent_id", "path", "text")
      SELECT row_number() OVER (PARTITION BY cb.category_id ORDER BY cb.branch_id),
             cb.category_id, 'availableBranches', cb.branch_id
        FROM public.service_category_branch cb
        JOIN public.service_category p ON p.id = cb.category_id AND NOT p.all_branches
        JOIN "cms"."service_category" c ON c.id = cb.category_id;
      UPDATE "cms"."service" c SET "availability" = 'selected'
        FROM public.service p
       WHERE p.id = c.id AND NOT p.all_branches;
      INSERT INTO "cms"."service_texts" ("order", "parent_id", "path", "text")
      SELECT row_number() OVER (PARTITION BY sb.service_id ORDER BY sb.branch_id),
             sb.service_id, 'availableBranches', sb.branch_id
        FROM public.service_branch sb
        JOIN public.service p ON p.id = sb.service_id AND NOT p.all_branches
        JOIN "cms"."service" c ON c.id = sb.service_id;
    END IF;
  END $$;

  -- A category still without a code takes 0018's slug table, then a
  -- provisional code for its type (salon 999721, spa 999723), for the launch
  -- review (TX-10) to confirm. The field is required from here on.
  UPDATE "cms"."service_category"
     SET "sac_code" = (CASE "slug"
       WHEN 'haircut-styling' THEN '999721'
       WHEN 'hair-colouring-treatment' THEN '999721'
       WHEN 'hair-spa-head-therapies' THEN '999721'
       WHEN 'facial-skincare' THEN '999722'
       WHEN 'manicure-pedicure' THEN '999722'
       WHEN 'makeup-services' THEN '999722'
       WHEN 'waxing' THEN '999729'
       WHEN 'standard-spa' THEN '999723'
       WHEN 'premium-spa' THEN '999723'
       WHEN 'vvip-spa' THEN '999723'
     END)::"cms"."enum_service_category_sac_code"
   WHERE "sac_code" IS NULL
     AND "slug" IN ('haircut-styling', 'hair-colouring-treatment', 'hair-spa-head-therapies',
                    'facial-skincare', 'manicure-pedicure', 'makeup-services', 'waxing',
                    'standard-spa', 'premium-spa', 'vvip-spa');
  UPDATE "cms"."service_category"
     SET "sac_code" = (CASE "service_type"::text WHEN 'spa' THEN '999723' ELSE '999721' END)
                      ::"cms"."enum_service_category_sac_code"
   WHERE "sac_code" IS NULL;
  ALTER TABLE "cms"."service_category" ALTER COLUMN "sac_code" SET NOT NULL;
  ALTER TABLE "cms"."service_category_texts" ADD CONSTRAINT "service_category_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."service_category"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_service_category_v" ADD CONSTRAINT "_service_category_v_parent_id_service_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."service_category"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_service_category_v_texts" ADD CONSTRAINT "_service_category_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."_service_category_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."service_texts" ADD CONSTRAINT "service_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."service"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_service_v" ADD CONSTRAINT "_service_v_parent_id_service_id_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."service"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_service_v" ADD CONSTRAINT "_service_v_version_category_id_id_service_category_id_fk" FOREIGN KEY ("version_category_id_id") REFERENCES "cms"."service_category"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_service_v_texts" ADD CONSTRAINT "_service_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."_service_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "service_category_texts_order_parent" ON "cms"."service_category_texts" USING btree ("order","parent_id");
  CREATE INDEX "_service_category_v_parent_idx" ON "cms"."_service_category_v" USING btree ("parent_id");
  CREATE INDEX "_service_category_v_version_version_slug_idx" ON "cms"."_service_category_v" USING btree ("version_slug");
  CREATE INDEX "_service_category_v_version_version_updated_at_idx" ON "cms"."_service_category_v" USING btree ("version_updated_at");
  CREATE INDEX "_service_category_v_version_version_created_at_idx" ON "cms"."_service_category_v" USING btree ("version_created_at");
  CREATE INDEX "_service_category_v_created_at_idx" ON "cms"."_service_category_v" USING btree ("created_at");
  CREATE INDEX "_service_category_v_updated_at_idx" ON "cms"."_service_category_v" USING btree ("updated_at");
  CREATE INDEX "_service_category_v_texts_order_parent" ON "cms"."_service_category_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "service_texts_order_parent" ON "cms"."service_texts" USING btree ("order","parent_id");
  CREATE INDEX "_service_v_parent_idx" ON "cms"."_service_v" USING btree ("parent_id");
  CREATE INDEX "_service_v_version_version_category_id_idx" ON "cms"."_service_v" USING btree ("version_category_id_id");
  CREATE INDEX "_service_v_version_version_slug_idx" ON "cms"."_service_v" USING btree ("version_slug");
  CREATE INDEX "_service_v_version_version_updated_at_idx" ON "cms"."_service_v" USING btree ("version_updated_at");
  CREATE INDEX "_service_v_version_version_created_at_idx" ON "cms"."_service_v" USING btree ("version_created_at");
  CREATE INDEX "_service_v_created_at_idx" ON "cms"."_service_v" USING btree ("created_at");
  CREATE INDEX "_service_v_updated_at_idx" ON "cms"."_service_v" USING btree ("updated_at");
  CREATE INDEX "_service_v_texts_order_parent" ON "cms"."_service_v_texts" USING btree ("order","parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."service_category_texts" CASCADE;
  DROP TABLE "cms"."_service_category_v" CASCADE;
  DROP TABLE "cms"."_service_category_v_texts" CASCADE;
  DROP TABLE "cms"."service_texts" CASCADE;
  DROP TABLE "cms"."_service_v" CASCADE;
  DROP TABLE "cms"."_service_v_texts" CASCADE;
  ALTER TABLE "cms"."service_category" DROP COLUMN "sac_code";
  ALTER TABLE "cms"."service_category" DROP COLUMN "availability";
  ALTER TABLE "cms"."service_category" DROP COLUMN "edited_by";
  ALTER TABLE "cms"."service" DROP COLUMN "sac_code";
  ALTER TABLE "cms"."service" DROP COLUMN "availability";
  ALTER TABLE "cms"."service" DROP COLUMN "edited_by";
  DROP TYPE "cms"."enum_service_category_sac_code";
  DROP TYPE "cms"."enum_service_category_availability";
  DROP TYPE "cms"."enum__service_category_v_version_service_type";
  DROP TYPE "cms"."enum__service_category_v_version_sac_code";
  DROP TYPE "cms"."enum__service_category_v_version_availability";
  DROP TYPE "cms"."enum_service_sac_code";
  DROP TYPE "cms"."enum_service_availability";
  DROP TYPE "cms"."enum__service_v_version_duration_minutes";
  DROP TYPE "cms"."enum__service_v_version_sac_code";
  DROP TYPE "cms"."enum__service_v_version_availability";`)
}
