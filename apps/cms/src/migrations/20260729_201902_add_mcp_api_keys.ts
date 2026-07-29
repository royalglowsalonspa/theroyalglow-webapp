import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "cms"."payload_mcp_api_keys" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"label" varchar,
  	"description" varchar,
  	"service_find" boolean DEFAULT false,
  	"service_category_find" boolean DEFAULT false,
  	"service_card_find" boolean DEFAULT false,
  	"blog_find" boolean DEFAULT false,
  	"gallery_find" boolean DEFAULT false,
  	"team_find" boolean DEFAULT false,
  	"banner_find" boolean DEFAULT false,
  	"faq_find" boolean DEFAULT false,
  	"testimonial_find" boolean DEFAULT false,
  	"offer_find" boolean DEFAULT false,
  	"media_find" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar
  );
  
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD COLUMN "payload_mcp_api_keys_id" integer;
  ALTER TABLE "cms"."payload_preferences_rels" ADD COLUMN "payload_mcp_api_keys_id" integer;
  ALTER TABLE "cms"."payload_mcp_api_keys" ADD CONSTRAINT "payload_mcp_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cms"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "payload_mcp_api_keys_user_idx" ON "cms"."payload_mcp_api_keys" USING btree ("user_id");
  CREATE INDEX "payload_mcp_api_keys_updated_at_idx" ON "cms"."payload_mcp_api_keys" USING btree ("updated_at");
  CREATE INDEX "payload_mcp_api_keys_created_at_idx" ON "cms"."payload_mcp_api_keys" USING btree ("created_at");
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payload_mcp_api_keys_fk" FOREIGN KEY ("payload_mcp_api_keys_id") REFERENCES "cms"."payload_mcp_api_keys"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_payload_mcp_api_keys_fk" FOREIGN KEY ("payload_mcp_api_keys_id") REFERENCES "cms"."payload_mcp_api_keys"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_payload_mcp_api_keys_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("payload_mcp_api_keys_id");
  CREATE INDEX "payload_preferences_rels_payload_mcp_api_keys_id_idx" ON "cms"."payload_preferences_rels" USING btree ("payload_mcp_api_keys_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."payload_mcp_api_keys" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."payload_mcp_api_keys" CASCADE;
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payload_mcp_api_keys_fk";
  
  ALTER TABLE "cms"."payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_payload_mcp_api_keys_fk";
  
  DROP INDEX "cms"."payload_locked_documents_rels_payload_mcp_api_keys_id_idx";
  DROP INDEX "cms"."payload_preferences_rels_payload_mcp_api_keys_id_idx";
  ALTER TABLE "cms"."payload_locked_documents_rels" DROP COLUMN "payload_mcp_api_keys_id";
  ALTER TABLE "cms"."payload_preferences_rels" DROP COLUMN "payload_mcp_api_keys_id";`)
}
