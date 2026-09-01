-- Better Auth 1.7 account identity — EXPAND step (1 of 2).
--
-- Better Auth 1.7+ resolves an OAuth account with `WHERE issuer = ? AND
-- account_id = ?`. Our 1.6 rows have no issuer, which is why the 1.7.1 deploy
-- broke every Google sign-in.
--
-- This migration is deliberately SAFE TO APPLY WHILE 1.6.26 IS STILL RUNNING:
-- the column is nullable and unknown to 1.6.26, so it is inert until 1.7.x is
-- deployed. The NOT NULL constraint and the unique (issuer, account_id) index
-- are applied by a LATER migration, after 1.7.x is live and writing the column.
--
-- Do NOT add NOT NULL here: 1.6.26 inserts account rows without an issuer, so
-- constraining the column before the upgrade would break new sign-UPS.
--
-- See knowledge-base/better-auth-upgrade.md §5.
ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint

-- Backfill Google accounts. This exact literal is what Better Auth 1.7 writes:
-- the Google social provider declares `accountIssuer: "https://accounts.google.com"`
-- and the One Tap plugin hardcodes the same value, so both sign-in paths resolve
-- to one identity. It is NOT the synthetic `local:oauth:google` namespace, which
-- Better Auth only uses for providers that declare no issuer of their own.
UPDATE "account"
SET "issuer" = 'https://accounts.google.com'
WHERE "provider_id" = 'google'
  AND "issuer" IS NULL;--> statement-breakpoint

-- Backfill email/password accounts as `local:credential`
-- (Better Auth: createLocalAccountIssuer('credential')).
-- Defensive only: this project configures Google OAuth exclusively and the
-- pre-migration audit found zero rows with a non-null password. Included so the
-- migration stays correct if email/password is ever enabled before it runs.
UPDATE "account"
SET "issuer" = 'local:credential'
WHERE "password" IS NOT NULL
  AND "issuer" IS NULL;
