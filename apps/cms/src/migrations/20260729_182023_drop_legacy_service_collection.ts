import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Migration A of a two-part drop-then-create pair (B is
 * `20260729_182235_create_service_catalogue_collections`).
 *
 * Why two migrations instead of one ALTER-based migration:
 *
 * 1. TTY-FREE GENERATION. `payload migrate:create` delegates the diff to
 *    drizzle-kit, which opens an INTERACTIVE rename resolver whenever a single
 *    diff contains BOTH a create and a drop of the same entity kind ("is
 *    `service_category` created, or renamed from `service`?"). With no TTY
 *    available that aborts with `Error: Interactive prompts require a TTY
 *    terminal`. Splitting the change into a pure-DROP diff and a pure-CREATE
 *    diff removes the ambiguity, so both generate non-interactively.
 *
 * 2. NO VALID POSTGRES CASTS. The repurposed shape changes `id` from
 *    `integer`/serial to `varchar` and `duration_minutes` from `numeric` to an
 *    enum. Neither has a valid implicit or `USING`-free cast, so an ALTER-based
 *    migration would fail on apply even against an empty table. Dropping and
 *    recreating avoids casts entirely.
 *
 * Safe because `cms.service` was VERIFIED EMPTY (`SELECT count(*)` = 0) on the
 * target branch before this was applied — nothing is lost. The only inbound FK
 * was Payload's own `payload_locked_documents_rels.service_id` (transient
 * admin-UI lock rows, no business value). `public.service` /
 * `public.service_category` are a DIFFERENT schema and are untouched.
 *
 * HAND-CORRECTED (pre-commit) — statement ORDER only, no statements added or
 * removed. drizzle-kit emitted `DROP TABLE "cms"."service" CASCADE` BEFORE the
 * explicit `DROP CONSTRAINT payload_locked_documents_rels_service_fk`, but
 * CASCADE already removes that dependent FK, so the later explicit drop failed
 * with `constraint ... does not exist` and rolled the migration back. Dependents
 * are now dropped first, so `DROP TABLE` has nothing left to cascade into.
 *
 * The `cms.media.prefix` column is PRE-EXISTING config drift folded in by the
 * generator, not part of this change: the `s3Storage({ collections: { media: {
 * prefix: 'cms' } } })` plugin option was added to `payload.config.ts` without a
 * migration, so the column has been missing since. It is additive and required
 * for schema/config parity — omitting it would only defer it to the next
 * generated migration.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_service_fk";
  
  DROP INDEX "cms"."payload_locked_documents_rels_service_id_idx";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "service_id";
  ALTER TABLE "cms"."service" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."service" CASCADE;
  ALTER TABLE "cms"."media" ADD COLUMN "prefix" varchar DEFAULT 'cms';
  DROP TYPE "cms"."enum_service_type";
  DROP TYPE "cms"."enum_service_category";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_service_type" AS ENUM('salon', 'spa');
  CREATE TYPE "cms"."enum_service_category" AS ENUM('hair', 'skin', 'nails', 'bridal', 'massage', 'facial', 'grooming', 'waxing', 'makeup', 'other');
  CREATE TABLE "cms"."service" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"type" "cms"."enum_service_type" NOT NULL,
  	"category" "cms"."enum_service_category",
  	"image_id" integer NOT NULL,
  	"description" varchar,
  	"duration_minutes" numeric NOT NULL,
  	"price_paise" numeric NOT NULL,
  	"booking_ref" varchar,
  	"active" boolean DEFAULT true,
  	"featured" boolean DEFAULT false,
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "service_id" integer;
  ALTER TABLE "cms"."service" ADD CONSTRAINT "service_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "service_image_idx" ON "cms"."service" USING btree ("image_id");
  CREATE INDEX "service_updated_at_idx" ON "cms"."service" USING btree ("updated_at");
  CREATE INDEX "service_created_at_idx" ON "cms"."service" USING btree ("created_at");
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_service_fk" FOREIGN KEY ("service_id") REFERENCES "cms"."service"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_service_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("service_id");
  ALTER TABLE "cms"."media" DROP COLUMN "prefix";`)
}
