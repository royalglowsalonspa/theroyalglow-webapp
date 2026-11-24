CREATE TYPE "public"."settlement_entry_kind" AS ENUM('membership_session', 'gems_redemption', 'reversal');--> statement-breakpoint
ALTER TYPE "public"."loyalty_tx_type" ADD VALUE 'returned';--> statement-breakpoint
CREATE TABLE "loyalty_allocation" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"redemption_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"gems" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "loyalty_allocation_redemption_batch_unique" UNIQUE("redemption_id","batch_id"),
	CONSTRAINT "loyalty_allocation_gems_check" CHECK ("loyalty_allocation"."gems" > 0)
);
--> statement-breakpoint
CREATE TABLE "branch_settlement" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"month" date NOT NULL,
	"branch_a_id" text NOT NULL,
	"branch_b_id" text NOT NULL,
	"a_owes_b_membership_paise" bigint NOT NULL,
	"a_owes_b_membership_value_paise" bigint NOT NULL,
	"a_owes_b_membership_gst_paise" bigint NOT NULL,
	"a_owes_b_gems_paise" bigint NOT NULL,
	"b_owes_a_membership_paise" bigint NOT NULL,
	"b_owes_a_membership_value_paise" bigint NOT NULL,
	"b_owes_a_membership_gst_paise" bigint NOT NULL,
	"b_owes_a_gems_paise" bigint NOT NULL,
	"paying_branch_id" text,
	"receiving_branch_id" text,
	"net_paise" bigint NOT NULL,
	"entry_count" integer NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"paid_on" date,
	"payment_reference" text,
	"internal_transfer" boolean DEFAULT false NOT NULL,
	"paid_recorded_by" text,
	"paid_recorded_at" timestamp with time zone,
	CONSTRAINT "branch_settlement_month_pair_unique" UNIQUE("month","branch_a_id","branch_b_id"),
	CONSTRAINT "branch_settlement_pair_check" CHECK ("branch_settlement"."branch_a_id" COLLATE "C" < "branch_settlement"."branch_b_id" COLLATE "C"),
	CONSTRAINT "branch_settlement_entries_check" CHECK ("branch_settlement"."entry_count" > 0),
	CONSTRAINT "branch_settlement_net_check" CHECK ("branch_settlement"."net_paise" = abs(("branch_settlement"."a_owes_b_membership_paise" + "branch_settlement"."a_owes_b_gems_paise") - ("branch_settlement"."b_owes_a_membership_paise" + "branch_settlement"."b_owes_a_gems_paise"))
        AND CASE
          WHEN ("branch_settlement"."a_owes_b_membership_paise" + "branch_settlement"."a_owes_b_gems_paise") > ("branch_settlement"."b_owes_a_membership_paise" + "branch_settlement"."b_owes_a_gems_paise")
            THEN "branch_settlement"."paying_branch_id" IS NOT DISTINCT FROM "branch_settlement"."branch_a_id"
             AND "branch_settlement"."receiving_branch_id" IS NOT DISTINCT FROM "branch_settlement"."branch_b_id"
          WHEN ("branch_settlement"."a_owes_b_membership_paise" + "branch_settlement"."a_owes_b_gems_paise") < ("branch_settlement"."b_owes_a_membership_paise" + "branch_settlement"."b_owes_a_gems_paise")
            THEN "branch_settlement"."paying_branch_id" IS NOT DISTINCT FROM "branch_settlement"."branch_b_id"
             AND "branch_settlement"."receiving_branch_id" IS NOT DISTINCT FROM "branch_settlement"."branch_a_id"
          ELSE "branch_settlement"."paying_branch_id" IS NULL AND "branch_settlement"."receiving_branch_id" IS NULL
        END),
	CONSTRAINT "branch_settlement_paid_check" CHECK (("branch_settlement"."paid_on" IS NULL AND "branch_settlement"."payment_reference" IS NULL
           AND "branch_settlement"."paid_recorded_by" IS NULL AND "branch_settlement"."paid_recorded_at" IS NULL
           AND NOT "branch_settlement"."internal_transfer")
        OR ("branch_settlement"."paid_on" IS NOT NULL AND "branch_settlement"."payment_reference" IS NOT NULL
           AND length(btrim("branch_settlement"."payment_reference")) > 0
           AND "branch_settlement"."paid_recorded_by" IS NOT NULL AND "branch_settlement"."paid_recorded_at" IS NOT NULL
           AND "branch_settlement"."net_paise" > 0))
);
--> statement-breakpoint
CREATE TABLE "settlement_entry" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"kind" "settlement_entry_kind" NOT NULL,
	"posting_month" date DEFAULT (date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')))::date NOT NULL,
	"owing_branch_id" text NOT NULL,
	"owed_branch_id" text NOT NULL,
	"spa_membership_id" text,
	"booking_id" text,
	"loyalty_transaction_id" text,
	"reverses_entry_id" text,
	"minutes" integer,
	"gems" integer,
	"value_paise" bigint NOT NULL,
	"gst_share_paise" bigint DEFAULT 0 NOT NULL,
	"amount_owed_paise" bigint NOT NULL,
	"share_bps" integer NOT NULL,
	"gem_value_paise" integer,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_entry_share_check" CHECK ("settlement_entry"."share_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "settlement_entry_amount_check" CHECK ("settlement_entry"."amount_owed_paise" = (("settlement_entry"."value_paise" - "settlement_entry"."gst_share_paise") * "settlement_entry"."share_bps") / 10000),
	CONSTRAINT "settlement_entry_shape_check" CHECK (CASE "settlement_entry"."kind"
        WHEN 'membership_session' THEN
          "settlement_entry"."spa_membership_id" IS NOT NULL AND "settlement_entry"."booking_id" IS NOT NULL
          AND "settlement_entry"."minutes" > 0 AND "settlement_entry"."gems" IS NULL AND "settlement_entry"."gem_value_paise" IS NULL
          AND "settlement_entry"."loyalty_transaction_id" IS NULL AND "settlement_entry"."reverses_entry_id" IS NULL
          AND "settlement_entry"."value_paise" >= 0
          AND "settlement_entry"."gst_share_paise" >= 0 AND "settlement_entry"."gst_share_paise" <= "settlement_entry"."value_paise"
        WHEN 'gems_redemption' THEN
          "settlement_entry"."loyalty_transaction_id" IS NOT NULL AND "settlement_entry"."booking_id" IS NOT NULL
          AND "settlement_entry"."gems" > 0 AND "settlement_entry"."gem_value_paise" > 0 AND "settlement_entry"."minutes" IS NULL
          AND "settlement_entry"."spa_membership_id" IS NULL AND "settlement_entry"."reverses_entry_id" IS NULL
          AND "settlement_entry"."value_paise" = "settlement_entry"."gems"::bigint * "settlement_entry"."gem_value_paise"
          AND "settlement_entry"."gst_share_paise" = 0
        WHEN 'reversal' THEN
          "settlement_entry"."reverses_entry_id" IS NOT NULL AND "settlement_entry"."note" IS NOT NULL
          AND length(btrim("settlement_entry"."note")) > 0
          AND "settlement_entry"."value_paise" <= 0
          AND "settlement_entry"."gst_share_paise" <= 0 AND "settlement_entry"."gst_share_paise" >= "settlement_entry"."value_paise"
        ELSE false
      END)
);
--> statement-breakpoint
CREATE TABLE "settlement_period" (
	"month" date PRIMARY KEY NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_period_month_check" CHECK (extract(day from "settlement_period"."month") = 1)
);
--> statement-breakpoint
CREATE TABLE "settlement_position" (
	"month" date NOT NULL,
	"branch_id" text NOT NULL,
	"receivable_paise" bigint NOT NULL,
	"payable_paise" bigint NOT NULL,
	"net_paise" bigint NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "settlement_position_pkey" PRIMARY KEY("month","branch_id"),
	CONSTRAINT "settlement_position_net_check" CHECK ("settlement_position"."net_paise" = "settlement_position"."receivable_paise" - "settlement_position"."payable_paise")
);
--> statement-breakpoint
ALTER TABLE "loyalty_transaction" ADD COLUMN "branch_id" text;--> statement-breakpoint
ALTER TABLE "loyalty_transaction" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "loyalty_transaction" ADD COLUMN "redemption_id" text;--> statement-breakpoint
ALTER TABLE "loyalty_allocation" ADD CONSTRAINT "loyalty_allocation_redemption_id_loyalty_transaction_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "public"."loyalty_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_allocation" ADD CONSTRAINT "loyalty_allocation_batch_id_loyalty_transaction_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."loyalty_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_settlement" ADD CONSTRAINT "branch_settlement_month_settlement_period_month_fk" FOREIGN KEY ("month") REFERENCES "public"."settlement_period"("month") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_settlement" ADD CONSTRAINT "branch_settlement_branch_a_id_branch_id_fk" FOREIGN KEY ("branch_a_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_settlement" ADD CONSTRAINT "branch_settlement_branch_b_id_branch_id_fk" FOREIGN KEY ("branch_b_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_settlement" ADD CONSTRAINT "branch_settlement_paying_branch_id_branch_id_fk" FOREIGN KEY ("paying_branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_settlement" ADD CONSTRAINT "branch_settlement_receiving_branch_id_branch_id_fk" FOREIGN KEY ("receiving_branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_settlement" ADD CONSTRAINT "branch_settlement_paid_recorded_by_user_id_fk" FOREIGN KEY ("paid_recorded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD CONSTRAINT "settlement_entry_posting_month_settlement_period_month_fk" FOREIGN KEY ("posting_month") REFERENCES "public"."settlement_period"("month") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD CONSTRAINT "settlement_entry_owing_branch_id_branch_id_fk" FOREIGN KEY ("owing_branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD CONSTRAINT "settlement_entry_owed_branch_id_branch_id_fk" FOREIGN KEY ("owed_branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD CONSTRAINT "settlement_entry_spa_membership_id_spa_membership_id_fk" FOREIGN KEY ("spa_membership_id") REFERENCES "public"."spa_membership"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD CONSTRAINT "settlement_entry_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD CONSTRAINT "settlement_entry_loyalty_transaction_id_loyalty_transaction_id_fk" FOREIGN KEY ("loyalty_transaction_id") REFERENCES "public"."loyalty_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD CONSTRAINT "settlement_entry_reverses_entry_id_settlement_entry_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."settlement_entry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD CONSTRAINT "settlement_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_position" ADD CONSTRAINT "settlement_position_month_settlement_period_month_fk" FOREIGN KEY ("month") REFERENCES "public"."settlement_period"("month") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_position" ADD CONSTRAINT "settlement_position_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loyalty_allocation_active_batch_idx" ON "loyalty_allocation" USING btree ("batch_id") WHERE released_at IS NULL;--> statement-breakpoint
CREATE INDEX "branch_settlement_branch_a_idx" ON "branch_settlement" USING btree ("branch_a_id","month");--> statement-breakpoint
CREATE INDEX "branch_settlement_branch_b_idx" ON "branch_settlement" USING btree ("branch_b_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_entry_session_unique" ON "settlement_entry" USING btree ("booking_id") WHERE kind = 'membership_session';--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_entry_gems_unique" ON "settlement_entry" USING btree ("loyalty_transaction_id","owing_branch_id") WHERE kind = 'gems_redemption';--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_entry_reversal_unique" ON "settlement_entry" USING btree ("reverses_entry_id") WHERE reverses_entry_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "settlement_entry_month_pair_idx" ON "settlement_entry" USING btree ("posting_month","owing_branch_id","owed_branch_id");--> statement-breakpoint
CREATE INDEX "settlement_entry_owed_month_idx" ON "settlement_entry" USING btree ("owed_branch_id","posting_month");--> statement-breakpoint
CREATE INDEX "settlement_entry_membership_idx" ON "settlement_entry" USING btree ("spa_membership_id") WHERE spa_membership_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "settlement_entry_booking_idx" ON "settlement_entry" USING btree ("booking_id") WHERE booking_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "settlement_position_branch_idx" ON "settlement_position" USING btree ("branch_id","month");--> statement-breakpoint
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_batch_id_loyalty_transaction_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."loyalty_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_redemption_id_loyalty_transaction_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "public"."loyalty_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loyalty_transaction_branch_created_idx" ON "loyalty_transaction" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "loyalty_transaction_booking_idx" ON "loyalty_transaction" USING btree ("booking_id") WHERE booking_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "loyalty_transaction_batch_idx" ON "loyalty_transaction" USING btree ("batch_id") WHERE batch_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_transaction_returned_unique" ON "loyalty_transaction" USING btree ("redemption_id") WHERE redemption_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_account" ADD CONSTRAINT "loyalty_account_balance_check" CHECK ("loyalty_account"."gems_balance" >= 0 AND "loyalty_account"."total_gems_earned" >= 0 AND "loyalty_account"."total_gems_redeemed" >= 0);--> statement-breakpoint
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_amount_check" CHECK (CASE WHEN "loyalty_transaction"."type" = 'expired' THEN "loyalty_transaction"."gems_amount" < 0 WHEN "loyalty_transaction"."type" = 'adjusted' THEN "loyalty_transaction"."gems_amount" <> 0 ELSE "loyalty_transaction"."gems_amount" > 0 END);--> statement-breakpoint
ALTER TABLE "loyalty_transaction" ADD CONSTRAINT "loyalty_transaction_returned_check" CHECK (("loyalty_transaction"."type"::text = 'returned') = ("loyalty_transaction"."redemption_id" IS NOT NULL));