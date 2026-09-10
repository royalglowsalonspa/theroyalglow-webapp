# Better Auth 1.7.3 cleanup

This is the current upgrade procedure. Version 1.7.3 restores account identity to
`providerId` and `accountId`, as in 1.6. It no longer writes `issuer`. The historical
[1.7.2 rollout](./better-auth-upgrade.md) remains a record, not the current migration plan.

## What changed before this cleanup

| Commit | Change |
| --- | --- |
| `deaf446` / PR #174 | Restored Better Auth 1.6.26 after the unsuccessful 1.7 upgrade. |
| `da6fef9` / PR #182 | Added nullable `account.issuer` and backfilled existing accounts in migration 0001. |
| `c74844d` / PR #185 | Upgraded to 1.7.2, required issuer, and added its compound unique index in migration 0002. |
| `bd077e1` | Kept the database client lazy during adapter construction; this independent build fix remains necessary. |

Updating only `better-auth` to 1.7.3 first failed because the root core override
remained at 1.7.2. After aligning core, Lighthouse caught a second failure:
`unexpected-required-column: account.issuer`, returning HTTP 500 on the homepage.
The earlier schema test checked fields the library required but did not detect
required application columns the library had stopped writing.

## Forward migration and application changes

- Pin `better-auth` in web/admin and the `@better-auth/core` override to 1.7.3.
- Keep the compatible `@better-auth/infra` 0.4.5 plugin version in both apps.
- Apply generated migration `0003_restore_provider_account_identity.sql`.
- Remove `NOT NULL` from issuer and drop `account_issuer_account_id_uidx`.
- Enforce uniqueness on `(provider_id, account_id)` with
  `account_provider_account_id_uidx`, matching the restored lookup key.
- Keep issuer as nullable legacy storage. Existing values and account rows are
  preserved; no backfill is needed. This lets the migration run while 1.7.2 still
  serves requests. Dropping the column is optional later cleanup, after every
  old application instance has retired.
- Keep historical migrations 0000–0002 unchanged. Update the new snapshot,
  journal, and canonical fingerprint with migration 0003.
- Check the schema contract in both directions so removed required fields are
  caught before deployment. Keep the existing version-lockstep checks.

No account-selector call sites (`getAccessToken`, `refreshToken`, `accountInfo`,
`unlinkAccount`) or custom OAuth subject mappings were found in either app.
Google OAuth, One Tap, RBAC, shared cookies, and the lazy client remain configured.

## Database preflight

The read-only audit on 2026-09-10 found:

| Database branch | Accounts | Duplicate provider/account keys | Issuer nullable | Applied migrations |
| --- | ---: | ---: | --- | ---: |
| dev | 8 | 0 | no | 3 |
| test | 0 | 0 | no | 3 |
| pprd | 0 | 0 | no | 3 |
| prod | 10 | 0 | no | 3 |

Repeat this collision check immediately before applying migration 0003:

```sql
SELECT count(*) AS duplicate_provider_keys
FROM (
  SELECT provider_id, account_id
  FROM public.account
  GROUP BY provider_id, account_id
  HAVING count(*) > 1
) duplicates;
```

Stop if it is nonzero. Resolve ownership deliberately; never merge accounts or
rewrite provider identities automatically. The new unique index also rejects
collisions atomically if data changes after the preflight.

The migration was then applied to an isolated production branch on 2026-09-10.
All 10 existing accounts and their issuer values remained. Two synthetic accounts
with the same subject at different providers were inserted without issuer, and a
duplicate subject at the same provider was rejected by the replacement index.
These database checks do not exercise Google's interactive OAuth flow.

## Rollout order

1. Validate the generated migration on an isolated branch of production and
   confirm that accounts without issuer can be inserted, provider identities
   remain unique, and existing accounts remain readable.
2. Commit the schema, migration, journal, snapshot, and fingerprint together.
3. Run **Apply DB Migrations** from that reviewed commit, using direct/unpooled
   connections, in `dev → test → pprd → prod` order. This is a separate operation
   from branch promotion and AWS deployment.
4. Confirm issuer is nullable and the replacement index exists in each database.
5. Merge and fast-forward the checked application commit through the environment
   branches, then verify AWS deployment, both health endpoints, and anonymous
   `/api/auth/get-session` responses. Complete a real returning-user Google login,
   new-user signup, and One Tap check before declaring authentication verified.

Do not deploy 1.7.3 against the old required issuer column. Do not remove the
column before old 1.7.2 instances have retired. Once 1.7.3 creates issuer-less
accounts, reverting the application to 1.7.2 is not a safe rollback: use a
compatible 1.7.3 fix or a deliberately reviewed database/application recovery.

Sources: [Better Auth's account identity cleanup guide](https://better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-keeps-the-provider-key),
[1.7.3 release notes](https://github.com/better-auth/better-auth/releases/tag/v1.7.3).
