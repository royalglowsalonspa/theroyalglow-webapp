ALTER TABLE "settlement_entry" DROP CONSTRAINT "settlement_entry_shape_check";--> statement-breakpoint
ALTER TABLE "settlement_entry" ADD CONSTRAINT "settlement_entry_shape_check" CHECK (CASE "settlement_entry"."kind"
        WHEN 'membership_session' THEN
          "settlement_entry"."spa_membership_id" IS NOT NULL AND "settlement_entry"."booking_id" IS NOT NULL
          AND "settlement_entry"."minutes" > 0 AND "settlement_entry"."gems" IS NULL AND "settlement_entry"."gem_value_paise" IS NULL
          AND "settlement_entry"."loyalty_transaction_id" IS NULL AND "settlement_entry"."reverses_entry_id" IS NULL
          AND "settlement_entry"."value_paise" >= 0 AND "settlement_entry"."gst_share_paise" >= 0
        WHEN 'gems_redemption' THEN
          "settlement_entry"."loyalty_transaction_id" IS NOT NULL AND "settlement_entry"."booking_id" IS NOT NULL
          AND "settlement_entry"."gems" > 0 AND "settlement_entry"."gem_value_paise" > 0 AND "settlement_entry"."minutes" IS NULL
          AND "settlement_entry"."spa_membership_id" IS NULL AND "settlement_entry"."reverses_entry_id" IS NULL
          AND "settlement_entry"."value_paise" = "settlement_entry"."gems"::bigint * "settlement_entry"."gem_value_paise"
          AND "settlement_entry"."gst_share_paise" = 0
        WHEN 'reversal' THEN
          "settlement_entry"."reverses_entry_id" IS NOT NULL AND "settlement_entry"."note" IS NOT NULL
          AND length(btrim("settlement_entry"."note")) > 0
          AND "settlement_entry"."value_paise" <= 0 AND "settlement_entry"."gst_share_paise" <= 0
        ELSE false
      END);