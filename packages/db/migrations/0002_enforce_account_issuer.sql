-- Better Auth 1.7 account identity — CONTRACT step (2 of 2).
--
-- PREREQUISITE: migration 0001 has been applied AND Better Auth 1.7.x is already
-- deployed and verified on this environment. 1.7.x writes `issuer` on every
-- account it creates or updates, which is what makes the NOT NULL constraint
-- below safe. Applying this while 1.6.26 is still serving traffic would break
-- new sign-ups, because 1.6.26 inserts account rows without an issuer.
--
-- See knowledge-base/better-auth-upgrade.md §5 (expand/migrate/contract) and
-- §5.1.1 (why this ships in a separate PR from 0001).

-- Defensive re-backfill. 0001 already backfilled every existing row, but during
-- the rolling deploy an in-flight 1.6.26 invocation could still have inserted a
-- row with a NULL issuer. Such a row is invisible to 1.7.x's
-- `WHERE issuer = ? AND account_id = ?` lookup and would otherwise fail the
-- NOT NULL constraint below. Re-running the backfill is idempotent and cheap.
UPDATE "account"
SET "issuer" = 'https://accounts.google.com'
WHERE "provider_id" = 'google'
  AND "issuer" IS NULL;--> statement-breakpoint

UPDATE "account"
SET "issuer" = 'local:credential'
WHERE "password" IS NOT NULL
  AND "issuer" IS NULL;--> statement-breakpoint

-- Fails loudly if any row still has a NULL issuer (e.g. an unknown provider that
-- neither backfill covered). Stopping here is correct: a silent partial migration
-- would leave identities that 1.7.x cannot resolve.
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint

-- The uniqueness guarantee behind Better Auth's identity lookup: one provider
-- identity maps to exactly one account row. Fails loudly on a pre-existing
-- collision, which the pre-flight audit (plan §6.1) must rule out first.
CREATE UNIQUE INDEX "account_issuer_account_id_uidx" ON "account" USING btree ("issuer","account_id");
