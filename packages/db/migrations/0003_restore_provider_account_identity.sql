-- Better Auth 1.7.3 restores provider_id + account_id as the account lookup key.
-- Apply this forward migration BEFORE deploying the 1.7.3 application.
-- Retain nullable issuer values so the running 1.7.2 code can finish its rollout.
-- No account rows, tokens, IDs, or issuer values are rewritten or deleted.
-- The replacement unique index fails atomically if duplicate provider keys exist.
DROP INDEX "account_issuer_account_id_uidx";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_id_uidx" ON "account" USING btree ("provider_id","account_id");
