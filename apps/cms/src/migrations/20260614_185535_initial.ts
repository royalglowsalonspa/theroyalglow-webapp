import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE SCHEMA IF NOT EXISTS "cms";
  CREATE TYPE "cms"."enum_blog_category" AS ENUM('skincare', 'hair', 'spa', 'bridal', 'tips');
  CREATE TYPE "cms"."enum_blog_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum_gallery_category" AS ENUM('salon', 'spa', 'interior', 'team', 'work');
  CREATE TYPE "cms"."enum_faq_category" AS ENUM('booking', 'pricing', 'services', 'policies');
  CREATE TYPE "cms"."enum_offer_category" AS ENUM('all', 'salon', 'spa', 'bridal', 'nails', 'skincare');
  CREATE TYPE "cms"."enum_service_type" AS ENUM('salon', 'spa');
  CREATE TYPE "cms"."enum_service_category" AS ENUM('hair', 'skin', 'nails', 'bridal', 'massage', 'facial', 'grooming', 'waxing', 'makeup', 'other');
  CREATE TABLE "cms"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "cms"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "cms"."media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_hero_url" varchar,
  	"sizes_hero_width" numeric,
  	"sizes_hero_height" numeric,
  	"sizes_hero_mime_type" varchar,
  	"sizes_hero_filesize" numeric,
  	"sizes_hero_filename" varchar
  );
  
  CREATE TABLE "cms"."blog" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"excerpt" varchar NOT NULL,
  	"cover_image_id" integer,
  	"body" jsonb NOT NULL,
  	"author_id" integer,
  	"category" "cms"."enum_blog_category",
  	"seo_meta_title" varchar,
  	"seo_meta_description" varchar,
  	"seo_og_image_id" integer,
  	"published_at" timestamp(3) with time zone,
  	"status" "cms"."enum_blog_status" DEFAULT 'draft' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."blog_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "cms"."gallery" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"alt" varchar NOT NULL,
  	"caption" varchar,
  	"category" "cms"."enum_gallery_category",
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."team_specializations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "cms"."team" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"role" varchar NOT NULL,
  	"bio" varchar,
  	"photo_id" integer,
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."banner" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"headline" varchar NOT NULL,
  	"image_id" integer NOT NULL,
  	"cta_label" varchar,
  	"cta_href" varchar,
  	"active" boolean DEFAULT false NOT NULL,
  	"start_at" timestamp(3) with time zone,
  	"end_at" timestamp(3) with time zone,
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."faq" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL,
  	"category" "cms"."enum_faq_category",
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."testimonial" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"reviewer_name" varchar NOT NULL,
  	"rating" numeric DEFAULT 5 NOT NULL,
  	"review_text" varchar NOT NULL,
  	"time_label" varchar DEFAULT '1 week ago',
  	"active" boolean DEFAULT true,
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."offer" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"discount_label" varchar,
  	"image_id" integer NOT NULL,
  	"cta_label" varchar DEFAULT 'Book Now',
  	"cta_href" varchar DEFAULT '/?book=1',
  	"category" "cms"."enum_offer_category" DEFAULT 'all',
  	"active" boolean DEFAULT true NOT NULL,
  	"valid_from" timestamp(3) with time zone,
  	"valid_until" timestamp(3) with time zone,
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."service_card" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"from_price" varchar NOT NULL,
  	"image_id" integer NOT NULL,
  	"image_alt" varchar,
  	"booking_href" varchar DEFAULT '/?book=1' NOT NULL,
  	"active" boolean DEFAULT true,
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
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
  
  CREATE TABLE "cms"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "cms"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"blog_id" integer,
  	"gallery_id" integer,
  	"team_id" integer,
  	"banner_id" integer,
  	"faq_id" integer,
  	"testimonial_id" integer,
  	"offer_id" integer,
  	"service_card_id" integer,
  	"service_id" integer
  );
  
  CREATE TABLE "cms"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "cms"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "cms"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."blog" ADD CONSTRAINT "blog_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."blog" ADD CONSTRAINT "blog_author_id_team_id_fk" FOREIGN KEY ("author_id") REFERENCES "cms"."team"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."blog" ADD CONSTRAINT "blog_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."blog_texts" ADD CONSTRAINT "blog_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."blog"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."gallery" ADD CONSTRAINT "gallery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."team_specializations" ADD CONSTRAINT "team_specializations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."team"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."team" ADD CONSTRAINT "team_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."banner" ADD CONSTRAINT "banner_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."offer" ADD CONSTRAINT "offer_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."service_card" ADD CONSTRAINT "service_card_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."service" ADD CONSTRAINT "service_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "cms"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "cms"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_blog_fk" FOREIGN KEY ("blog_id") REFERENCES "cms"."blog"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_gallery_fk" FOREIGN KEY ("gallery_id") REFERENCES "cms"."gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_team_fk" FOREIGN KEY ("team_id") REFERENCES "cms"."team"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_banner_fk" FOREIGN KEY ("banner_id") REFERENCES "cms"."banner"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_faq_fk" FOREIGN KEY ("faq_id") REFERENCES "cms"."faq"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_testimonial_fk" FOREIGN KEY ("testimonial_id") REFERENCES "cms"."testimonial"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_offer_fk" FOREIGN KEY ("offer_id") REFERENCES "cms"."offer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_service_card_fk" FOREIGN KEY ("service_card_id") REFERENCES "cms"."service_card"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_service_fk" FOREIGN KEY ("service_id") REFERENCES "cms"."service"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "cms"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "cms"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "cms"."users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "cms"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "cms"."users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "cms"."users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "cms"."media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "cms"."media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "cms"."media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "cms"."media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "cms"."media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_hero_sizes_hero_filename_idx" ON "cms"."media" USING btree ("sizes_hero_filename");
  CREATE UNIQUE INDEX "blog_slug_idx" ON "cms"."blog" USING btree ("slug");
  CREATE INDEX "blog_cover_image_idx" ON "cms"."blog" USING btree ("cover_image_id");
  CREATE INDEX "blog_author_idx" ON "cms"."blog" USING btree ("author_id");
  CREATE INDEX "blog_seo_seo_og_image_idx" ON "cms"."blog" USING btree ("seo_og_image_id");
  CREATE INDEX "blog_updated_at_idx" ON "cms"."blog" USING btree ("updated_at");
  CREATE INDEX "blog_created_at_idx" ON "cms"."blog" USING btree ("created_at");
  CREATE INDEX "blog_texts_order_parent" ON "cms"."blog_texts" USING btree ("order","parent_id");
  CREATE INDEX "gallery_image_idx" ON "cms"."gallery" USING btree ("image_id");
  CREATE INDEX "gallery_updated_at_idx" ON "cms"."gallery" USING btree ("updated_at");
  CREATE INDEX "gallery_created_at_idx" ON "cms"."gallery" USING btree ("created_at");
  CREATE INDEX "team_specializations_order_idx" ON "cms"."team_specializations" USING btree ("_order");
  CREATE INDEX "team_specializations_parent_id_idx" ON "cms"."team_specializations" USING btree ("_parent_id");
  CREATE INDEX "team_photo_idx" ON "cms"."team" USING btree ("photo_id");
  CREATE INDEX "team_updated_at_idx" ON "cms"."team" USING btree ("updated_at");
  CREATE INDEX "team_created_at_idx" ON "cms"."team" USING btree ("created_at");
  CREATE INDEX "banner_image_idx" ON "cms"."banner" USING btree ("image_id");
  CREATE INDEX "banner_updated_at_idx" ON "cms"."banner" USING btree ("updated_at");
  CREATE INDEX "banner_created_at_idx" ON "cms"."banner" USING btree ("created_at");
  CREATE INDEX "faq_updated_at_idx" ON "cms"."faq" USING btree ("updated_at");
  CREATE INDEX "faq_created_at_idx" ON "cms"."faq" USING btree ("created_at");
  CREATE INDEX "testimonial_updated_at_idx" ON "cms"."testimonial" USING btree ("updated_at");
  CREATE INDEX "testimonial_created_at_idx" ON "cms"."testimonial" USING btree ("created_at");
  CREATE INDEX "offer_image_idx" ON "cms"."offer" USING btree ("image_id");
  CREATE INDEX "offer_updated_at_idx" ON "cms"."offer" USING btree ("updated_at");
  CREATE INDEX "offer_created_at_idx" ON "cms"."offer" USING btree ("created_at");
  CREATE INDEX "service_card_image_idx" ON "cms"."service_card" USING btree ("image_id");
  CREATE INDEX "service_card_updated_at_idx" ON "cms"."service_card" USING btree ("updated_at");
  CREATE INDEX "service_card_created_at_idx" ON "cms"."service_card" USING btree ("created_at");
  CREATE INDEX "service_image_idx" ON "cms"."service" USING btree ("image_id");
  CREATE INDEX "service_updated_at_idx" ON "cms"."service" USING btree ("updated_at");
  CREATE INDEX "service_created_at_idx" ON "cms"."service" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "cms"."payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "cms"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "cms"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "cms"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "cms"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "cms"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "cms"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_blog_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("blog_id");
  CREATE INDEX "payload_locked_documents_rels_gallery_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("gallery_id");
  CREATE INDEX "payload_locked_documents_rels_team_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("team_id");
  CREATE INDEX "payload_locked_documents_rels_banner_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("banner_id");
  CREATE INDEX "payload_locked_documents_rels_faq_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("faq_id");
  CREATE INDEX "payload_locked_documents_rels_testimonial_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("testimonial_id");
  CREATE INDEX "payload_locked_documents_rels_offer_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("offer_id");
  CREATE INDEX "payload_locked_documents_rels_service_card_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("service_card_id");
  CREATE INDEX "payload_locked_documents_rels_service_id_idx" ON "cms"."payload_locked_documents_rels" USING btree ("service_id");
  CREATE INDEX "payload_preferences_key_idx" ON "cms"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "cms"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "cms"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "cms"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "cms"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "cms"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "cms"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "cms"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "cms"."payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."users_sessions" CASCADE;
  DROP TABLE "cms"."users" CASCADE;
  DROP TABLE "cms"."media" CASCADE;
  DROP TABLE "cms"."blog" CASCADE;
  DROP TABLE "cms"."blog_texts" CASCADE;
  DROP TABLE "cms"."gallery" CASCADE;
  DROP TABLE "cms"."team_specializations" CASCADE;
  DROP TABLE "cms"."team" CASCADE;
  DROP TABLE "cms"."banner" CASCADE;
  DROP TABLE "cms"."faq" CASCADE;
  DROP TABLE "cms"."testimonial" CASCADE;
  DROP TABLE "cms"."offer" CASCADE;
  DROP TABLE "cms"."service_card" CASCADE;
  DROP TABLE "cms"."service" CASCADE;
  DROP TABLE "cms"."payload_kv" CASCADE;
  DROP TABLE "cms"."payload_locked_documents" CASCADE;
  DROP TABLE "cms"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "cms"."payload_preferences" CASCADE;
  DROP TABLE "cms"."payload_preferences_rels" CASCADE;
  DROP TABLE "cms"."payload_migrations" CASCADE;
  DROP TYPE "cms"."enum_blog_category";
  DROP TYPE "cms"."enum_blog_status";
  DROP TYPE "cms"."enum_gallery_category";
  DROP TYPE "cms"."enum_faq_category";
  DROP TYPE "cms"."enum_offer_category";
  DROP TYPE "cms"."enum_service_type";
  DROP TYPE "cms"."enum_service_category";`)
}
