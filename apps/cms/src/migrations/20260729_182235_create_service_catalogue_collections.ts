import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Migration B of a two-part drop-then-create pair — MUST run after
 * `20260729_182023_drop_legacy_service_collection` (Migration A), which drops
 * the legacy marketing-shape `cms.service` table. See A's header for the full
 * rationale (TTY-free generation + no valid `numeric`→enum / `int4`→`varchar`
 * casts).
 *
 * This is a PURE CREATE diff — no drops — which is what keeps drizzle-kit's
 * interactive rename resolver out of the generation path.
 *
 * Creates the booking-accurate catalogue shape:
 * - `cms.service_category` with a `varchar` nanoid primary key
 * - `cms.service` with a `varchar` nanoid primary key (NOT Payload's default
 *   integer/serial) so ids share an ID-space with Drizzle's `text`
 *   `public.service.id`, which is referenced by `booking_service.service_id`,
 *   `staff_service.service_id`, `offer_service.service_id` and
 *   `waitlist.service_id`
 * - `cms.enum_service_duration_minutes` with the eight values derived from
 *   `SERVICE_DURATION_MINUTES` in `packages/types/src/service.ts`
 *
 * Note: Payload names the relationship column `category_id_id` — the
 * `categoryId` field name plus the adapter's `_id` relationship suffix. That is
 * expected, and it is mapped to Drizzle's `public.service.category_id` by
 * `mapPayloadToPublicService()`, not matched by name.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_service_category_service_type" AS ENUM('salon', 'spa');
  CREATE TYPE "cms"."enum_service_duration_minutes" AS ENUM('15', '30', '45', '60', '90', '120', '150', '180');
  CREATE TABLE "cms"."service_category" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"service_type" "cms"."enum_service_category_service_type" NOT NULL,
  	"display_order" numeric DEFAULT 0,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."service" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"category_id_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"duration_minutes" "cms"."enum_service_duration_minutes" NOT NULL,
  	"buffer_minutes" numeric DEFAULT 0,
  	"price_paise" numeric NOT NULL,
  	"is_active" boolean DEFAULT true,
  	"image_url" varchar,
  	"display_order" numeric DEFAULT 0,
  	"gems_redeemable" boolean DEFAULT false,
  	"gems_required" numeric,
  	"gems_catalogue_order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "service_category_id" varchar;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "service_id" varchar;
  ALTER TABLE "cms"."service" ADD CONSTRAINT "service_category_id_id_service_category_id_fk" FOREIGN KEY ("category_id_id") REFERENCES "cms"."service_category"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "service_category_slug_idx" ON "cms"."service_category" USING btree ("slug");
  CREATE INDEX "service_category_updated_at_idx" ON "cms"."service_category" USING btree ("updated_at");
  CREATE INDEX "service_category_created_at_idx" ON "cms"."service_category" USING btree ("created_at");
  CREATE INDEX "service_category_id_idx" ON "cms"."service" USING btree ("category_id_id");
  CREATE UNIQUE INDEX "service_slug_idx" ON "cms"."service" USING btree ("slug");
  CREATE INDEX "service_updated_at_idx" ON "cms"."service" USING btree ("updated_at");
  CREATE INDEX "service_created_at_idx" ON "cms"."service" USING btree ("created_at");
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_service_category_fk" FOREIGN KEY ("service_category_id") REFERENCES "cms"."service_category"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_service_fk" FOREIGN KEY ("service_id") REFERENCES "cms"."service"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_service_category_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("service_category_id");
  CREATE INDEX "payload_locked_documents_rels_service_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("service_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."service_category" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."service" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."service_category" CASCADE;
  DROP TABLE "cms"."service" CASCADE;
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_service_category_fk";
  
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_service_fk";
  
  DROP INDEX "cms"."payload_locked_documents_rels_service_category_id_idx";
  DROP INDEX "cms"."payload_locked_documents_rels_service_id_idx";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "service_category_id";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "service_id";
  DROP TYPE "cms"."enum_service_category_service_type";
  DROP TYPE "cms"."enum_service_duration_minutes";`)
}
