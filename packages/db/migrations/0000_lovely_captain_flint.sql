CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'status_change');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'rejected', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."branch_status" AS ENUM('operational', 'temporarily_closed', 'opens_soon', 'shutdown');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('percentage', 'flat', 'combo_price');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('service', 'membership_purchase', 'membership_session');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'follow_up', 'booked', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."leave_approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('sick', 'casual', 'personal', 'other');--> statement-breakpoint
CREATE TYPE "public"."loyalty_tx_type" AS ENUM('earned', 'redeemed', 'expired', 'adjusted');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('reminder_24h', 'reminder_1h', 'booking_confirmed', 'booking_rescheduled', 'booking_cancelled', 'booking_rejected', 'membership_created', 'membership_session_recorded', 'membership_expiry_30d', 'membership_expiry_7d', 'membership_expiry_1d', 'membership_expired', 'membership_hours_low', 'membership_usage_nudge', 'birthday_offer', 'post_service_followup', 'leave_submitted', 'leave_approved', 'leave_rejected', 'lead_follow_up_due', 'stale_pending_booking', 'no_show_check', 'gems_expiry_7d', 'gems_expired');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'upi', 'card', 'online');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('salon', 'spa');--> statement-breakpoint
CREATE TYPE "public"."spa_membership_status" AS ENUM('active', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."staff_designation" AS ENUM('receptionist', 'stylist', 'therapist', 'manager');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('waiting', 'notified', 'booked', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'customer',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"phone" text,
	"gender" "gender",
	"date_of_birth" date,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"marketing_consent_at" timestamp with time zone,
	"appointment_reminders_enabled" boolean DEFAULT true NOT NULL,
	"membership_alerts_enabled" boolean DEFAULT true NOT NULL,
	"acquisition_source" text,
	"utm_campaign" text,
	"utm_medium" text,
	"utm_source" text,
	"first_visit_at" timestamp with time zone,
	"last_visit_at" timestamp with time zone,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"total_spent_paise" integer DEFAULT 0 NOT NULL,
	"noshow_count" integer DEFAULT 0 NOT NULL,
	"late_cancellation_count" integer DEFAULT 0 NOT NULL,
	"consecutive_completed_bookings" integer DEFAULT 0 NOT NULL,
	"booking_requires_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "staff_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"phone" text,
	"designation" "staff_designation" NOT NULL,
	"bio" text,
	"specialization" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"hire_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "branch" (
	"id" text PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text DEFAULT 'Bengaluru' NOT NULL,
	"state" text DEFAULT 'Karnataka' NOT NULL,
	"pincode" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"google_maps_url" text,
	"google_maps_place_id" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"status" "branch_status" DEFAULT 'operational' NOT NULL,
	"opening_date" date,
	"closing_date" date,
	"temporary_close_reason" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_number_unique" UNIQUE("number"),
	CONSTRAINT "branch_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"price_paise" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"image_url" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"gems_redeemable" boolean DEFAULT false NOT NULL,
	"gems_required" integer,
	"gems_catalogue_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "service_category" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"service_type" "service_type" NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "staff_service" (
	"staff_id" text NOT NULL,
	"service_id" text NOT NULL,
	CONSTRAINT "staff_service_staff_id_service_id_pk" PRIMARY KEY("staff_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "business_hour" (
	"id" text PRIMARY KEY NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_time" time,
	"close_time" time,
	"is_open" boolean DEFAULT true NOT NULL,
	CONSTRAINT "business_hour_day_of_week_unique" UNIQUE("day_of_week")
);
--> statement-breakpoint
CREATE TABLE "holiday" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holiday_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "staff_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time,
	"end_time" time,
	"is_working" boolean DEFAULT true NOT NULL,
	CONSTRAINT "staff_schedule_staff_id_day_of_week_unique" UNIQUE("staff_id","day_of_week")
);
--> statement-breakpoint
CREATE TABLE "staff_time_off" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"leave_type" "leave_type" DEFAULT 'personal' NOT NULL,
	"date" text NOT NULL,
	"reason" text,
	"approval_status" "leave_approval_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_time_off_staff_id_date_unique" UNIQUE("staff_id","date")
);
--> statement-breakpoint
CREATE TABLE "offer" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"offer_type" "discount_type" NOT NULL,
	"discount_percentage" integer,
	"discount_amount_paise" integer,
	"combo_price_paise" integer,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"terms" text,
	"image_url" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "offer_redemption" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"booking_id" text,
	"redeemed_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_redemption_customer_id_redeemed_date_unique" UNIQUE("customer_id","redeemed_date")
);
--> statement-breakpoint
CREATE TABLE "offer_service" (
	"offer_id" text NOT NULL,
	"service_id" text NOT NULL,
	CONSTRAINT "offer_service_offer_id_service_id_pk" PRIMARY KEY("offer_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "spa_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"membership_number" text NOT NULL,
	"customer_id" text NOT NULL,
	"tier_id" text NOT NULL,
	"tier_name_snapshot" text NOT NULL,
	"total_hours_minutes" integer NOT NULL,
	"used_hours_minutes" integer DEFAULT 0 NOT NULL,
	"price_paid_paise" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "spa_membership_status" DEFAULT 'active' NOT NULL,
	"created_by" text NOT NULL,
	"invoice_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spa_membership_membership_number_unique" UNIQUE("membership_number")
);
--> statement-breakpoint
CREATE TABLE "spa_membership_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"default_hours_minutes" integer NOT NULL,
	"default_price_paise" integer NOT NULL,
	"default_validity_days" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spa_membership_tier_name_unique" UNIQUE("name"),
	CONSTRAINT "spa_membership_tier_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_number" text NOT NULL,
	"branch_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"service_type" "service_type" NOT NULL,
	"booking_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"total_amount_paise" integer DEFAULT 0 NOT NULL,
	"total_duration_minutes" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"is_walkin" boolean DEFAULT false NOT NULL,
	"is_membership_session" boolean DEFAULT false NOT NULL,
	"offer_id" text,
	"spa_membership_id" text,
	"is_gems_redemption" boolean DEFAULT false NOT NULL,
	"gems_redeemed" integer,
	"redemption_key" text,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancellation_reason" text,
	"cancelled_at" timestamp with time zone,
	"rejection_reason" text,
	"rejected_at" timestamp with time zone,
	"reschedule_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_booking_number_unique" UNIQUE("booking_number")
);
--> statement-breakpoint
CREATE TABLE "booking_service" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"service_id" text NOT NULL,
	"staff_id" text,
	"service_name_snapshot" text NOT NULL,
	"price_at_booking_paise" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_status_log" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"from_status" "booking_status",
	"to_status" "booking_status" NOT NULL,
	"changed_by_id" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"service_id" text NOT NULL,
	"preferred_staff_id" text,
	"preferred_date" date NOT NULL,
	"preferred_time_start" time,
	"preferred_time_end" time,
	"status" "waitlist_status" DEFAULT 'waiting' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"branch_id" text NOT NULL,
	"booking_id" text,
	"customer_id" text NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"discount_amount_paise" integer DEFAULT 0 NOT NULL,
	"taxable_value_paise" integer DEFAULT 0 NOT NULL,
	"gst_amount_paise" integer DEFAULT 0 NOT NULL,
	"total_amount_paise" integer NOT NULL,
	"invoice_type" "invoice_type" DEFAULT 'service' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cash' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"payment_reference" text,
	"gems_earned" integer DEFAULT 0 NOT NULL,
	"gems_redeemed" integer DEFAULT 0 NOT NULL,
	"gems_redeemed_service_id" text,
	"pdf_url" text,
	"notes" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "invoice_item" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"service_id" text,
	"service_name_snapshot" text NOT NULL,
	"staff_name_snapshot" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"total_price_paise" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"service_interested_id" text,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'meta_ad' NOT NULL,
	"utm_campaign" text,
	"utm_medium" text,
	"utm_source" text,
	"utm_content" text,
	"utm_term" text,
	"assigned_to" text,
	"converted_booking_id" text,
	"last_contacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_note" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_note" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"author_id" text NOT NULL,
	"booking_id" text,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_tag_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "customer_tag_assignment" (
	"customer_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_tag_assignment_customer_id_tag_id_pk" PRIMARY KEY("customer_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "loyalty_account" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"gems_balance" integer DEFAULT 0 NOT NULL,
	"total_gems_earned" integer DEFAULT 0 NOT NULL,
	"total_gems_redeemed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_account_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "loyalty_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"loyalty_account_id" text NOT NULL,
	"type" "loyalty_tx_type" NOT NULL,
	"gems_amount" integer NOT NULL,
	"invoice_id" text,
	"booking_id" text,
	"description" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"booking_id" text,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh_key" text NOT NULL,
	"auth_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_sales_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"branch_id" text NOT NULL,
	"total_bookings" integer DEFAULT 0 NOT NULL,
	"completed_bookings" integer DEFAULT 0 NOT NULL,
	"cancelled_bookings" integer DEFAULT 0 NOT NULL,
	"no_show_bookings" integer DEFAULT 0 NOT NULL,
	"walkin_bookings" integer DEFAULT 0 NOT NULL,
	"total_revenue_paise" integer DEFAULT 0 NOT NULL,
	"salon_revenue_paise" integer,
	"spa_revenue_paise" integer,
	"membership_revenue_paise" integer,
	"cash_revenue_paise" integer DEFAULT 0 NOT NULL,
	"upi_revenue_paise" integer DEFAULT 0 NOT NULL,
	"card_revenue_paise" integer DEFAULT 0 NOT NULL,
	"online_revenue_paise" integer DEFAULT 0 NOT NULL,
	"discount_given_paise" integer DEFAULT 0 NOT NULL,
	"gems_redeemed_count" integer DEFAULT 0 NOT NULL,
	"new_customers" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_sales_summary_date_branch_id_unique" UNIQUE("date","branch_id")
);
--> statement-breakpoint
CREATE TABLE "monthly_gst_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"taxable_value_paise" integer DEFAULT 0 NOT NULL,
	"gst_amount_paise" integer DEFAULT 0 NOT NULL,
	"invoice_count" integer DEFAULT 0 NOT NULL,
	"sac_code" text DEFAULT '999721' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_gst_summary_month_unique" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE "system_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_setting_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profile" ADD CONSTRAINT "customer_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profile" ADD CONSTRAINT "staff_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_category_id_service_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_service" ADD CONSTRAINT "staff_service_staff_id_staff_profile_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_service" ADD CONSTRAINT "staff_service_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_schedule" ADD CONSTRAINT "staff_schedule_staff_id_staff_profile_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_staff_id_staff_profile_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemption" ADD CONSTRAINT "offer_redemption_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_redemption" ADD CONSTRAINT "offer_redemption_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_service" ADD CONSTRAINT "offer_service_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_service" ADD CONSTRAINT "offer_service_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spa_membership" ADD CONSTRAINT "spa_membership_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spa_membership" ADD CONSTRAINT "spa_membership_tier_id_spa_membership_tier_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."spa_membership_tier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spa_membership" ADD CONSTRAINT "spa_membership_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_spa_membership_id_spa_membership_id_fk" FOREIGN KEY ("spa_membership_id") REFERENCES "public"."spa_membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_service" ADD CONSTRAINT "booking_service_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_service" ADD CONSTRAINT "booking_service_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_service" ADD CONSTRAINT "booking_service_staff_id_staff_profile_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_log" ADD CONSTRAINT "booking_status_log_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_log" ADD CONSTRAINT "booking_status_log_changed_by_id_user_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_preferred_staff_id_staff_profile_id_fk" FOREIGN KEY ("preferred_staff_id") REFERENCES "public"."staff_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_gems_redeemed_service_id_service_id_fk" FOREIGN KEY ("gems_redeemed_service_id") REFERENCES "public"."service"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_item" ADD CONSTRAINT "invoice_item_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_service_interested_id_service_id_fk" FOREIGN KEY ("service_interested_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_converted_booking_id_booking_id_fk" FOREIGN KEY ("converted_booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_note" ADD CONSTRAINT "lead_note_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_note" ADD CONSTRAINT "lead_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_note" ADD CONSTRAINT "customer_note_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_note" ADD CONSTRAINT "customer_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_note" ADD CONSTRAINT "customer_note_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag_assignment" ADD CONSTRAINT "customer_tag_assignment_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag_assignment" ADD CONSTRAINT "customer_tag_assignment_tag_id_customer_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."customer_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tag_assignment" ADD CONSTRAINT "customer_tag_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_account" ADD CONSTRAINT "loyalty_account_customer_id_user_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_loyalty_account_id_loyalty_account_id_fk" FOREIGN KEY ("loyalty_account_id") REFERENCES "public"."loyalty_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_sales_summary" ADD CONSTRAINT "daily_sales_summary_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_setting" ADD CONSTRAINT "system_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_profile_user_id_idx" ON "customer_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_profile_user_id_idx" ON "staff_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "service_category_id_idx" ON "service" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "service_gems_redeemable_idx" ON "service" USING btree ("id") WHERE gems_redeemable = true AND is_active = true;--> statement-breakpoint
CREATE INDEX "staff_schedule_staff_id_day_of_week_idx" ON "staff_schedule" USING btree ("staff_id","day_of_week");--> statement-breakpoint
CREATE INDEX "staff_time_off_staff_id_date_idx" ON "staff_time_off" USING btree ("staff_id","date");--> statement-breakpoint
CREATE INDEX "offer_display_order_active_idx" ON "offer" USING btree ("display_order") WHERE is_active = true;--> statement-breakpoint
CREATE INDEX "offer_redemption_customer_id_redeemed_date_idx" ON "offer_redemption" USING btree ("customer_id","redeemed_date");--> statement-breakpoint
CREATE INDEX "offer_redemption_offer_id_idx" ON "offer_redemption" USING btree ("offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spa_membership_active_customer_idx" ON "spa_membership" USING btree ("customer_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "spa_membership_expires_at_idx" ON "spa_membership" USING btree ("expires_at") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "spa_membership_customer_id_idx" ON "spa_membership" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "booking_booking_date_idx" ON "booking" USING btree ("booking_date");--> statement-breakpoint
CREATE INDEX "booking_customer_id_idx" ON "booking" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "booking_branch_id_booking_date_idx" ON "booking" USING btree ("branch_id","booking_date");--> statement-breakpoint
CREATE INDEX "booking_service_type_booking_date_idx" ON "booking" USING btree ("service_type","booking_date");--> statement-breakpoint
CREATE INDEX "booking_status_idx" ON "booking" USING btree ("status") WHERE status NOT IN ('completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE INDEX "booking_offer_id_idx" ON "booking" USING btree ("offer_id") WHERE offer_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "booking_spa_membership_id_idx" ON "booking" USING btree ("spa_membership_id") WHERE spa_membership_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_redemption_key_uidx" ON "booking" USING btree ("redemption_key") WHERE redemption_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "booking_service_staff_id_idx" ON "booking_service" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "invoice_customer_id_idx" ON "invoice" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoice_branch_id_idx" ON "invoice" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "invoice_paid_at_idx" ON "invoice" USING btree ("paid_at") WHERE payment_status = 'paid';--> statement-breakpoint
CREATE INDEX "lead_status_idx" ON "lead" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lead_assigned_to_idx" ON "lead" USING btree ("assigned_to") WHERE status NOT IN ('won', 'lost');--> statement-breakpoint
CREATE INDEX "lead_utm_campaign_idx" ON "lead" USING btree ("utm_campaign") WHERE utm_campaign IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customer_note_booking_id_idx" ON "customer_note" USING btree ("booking_id") WHERE booking_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customer_tag_assignment_tag_id_idx" ON "customer_tag_assignment" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "loyalty_transaction_account_created_idx" ON "loyalty_transaction" USING btree ("loyalty_account_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_transaction_expires_at_idx" ON "loyalty_transaction" USING btree ("expires_at") WHERE type = 'earned' AND expires_at IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_status_created_at_idx" ON "notification" USING btree ("status","created_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "push_subscription_user_id_active_idx" ON "push_subscription" USING btree ("user_id") WHERE is_active = true;--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_created_at_idx" ON "audit_log" USING btree ("actor_id","created_at");