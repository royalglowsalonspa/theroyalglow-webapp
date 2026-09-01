# Better Auth Upgrade — 1.6.26 → 1.7.2 and the Standing Upgrade Discipline

**Status:** PLANNED — production currently pinned to 1.6.26 after the PR #174 emergency rollback.
**Target:** `better-auth@1.7.2`, `@better-auth/core@1.7.2`, `@better-auth/infra@0.4.5`.
**Scope:** `apps/web`, `apps/admin`, `packages/db` schema, drift tooling, CI gates.

This document is the authoritative plan. It replaces the scratch notes that were written
under `.sst/auth-hotfix/` during the outage, which contained two incorrect claims (see
[Corrections](#corrections-to-earlier-notes)).

---

## 1. Decision summary

| Question | Answer |
|---|---|
| Upgrade to 1.7.x? | **Yes.** The blocker is one additive column plus a backfill, not an architectural change. |
| Which version? | `1.7.2` — the newest published release, and the one that fixed the adapter defect that broke us. |
| How much app code changes? | **None.** No account-selector call sites and no renamed options are used. |
| How much schema changes? | **One column + one unique index** on `account`. No other table changes. |
| Downtime required? | **No** — using an expand / migrate / contract sequence (§5). |
| Biggest risk? | Migration **ordering** relative to deploy. §5 removes it by design. |

---

## 2. Verified facts

Everything here was verified against the installed package `dist` output, the npm registry,
the official upgrade guide, and a live read-only audit of the database. Evidence paths are
given so any claim can be re-checked.

### 2.1 Versions

| Package | Current | Target | Notes |
|---|---|---|---|
| `better-auth` | 1.6.26 | **1.7.2** | `dist-tags.latest = 1.7.2`; nothing newer exists |
| `@better-auth/core` | 1.6.26 (root `overrides`) | **1.7.2** | Must move in lockstep with `better-auth` |
| `@better-auth/infra` | 0.3.7 | **0.4.5** | Peers `better-auth >=1.4.0`, `@better-auth/core >=1.4.0` → 1.7-compatible |
| `auth` (CLI) | — | 1.7.2 | The CLI is the npm package **`auth`**, versioned in lockstep. `engines.node >= 22.12.0` |

### 2.2 What 1.7 actually changed for us

Better Auth 1.7 scopes account identity by an **issuer**. The `account` model gained a
required `issuer` field and a **unique compound index on `(issuer, accountId)`**
(`@better-auth/core/dist/db/get-tables.mjs:201`). The physical column name is
`options.account?.fields?.issuer || "issuer"`.

Every OAuth callback resolves the account through
`internalAdapter.findAccountOwnerByKey({ issuer, accountId })`
(`better-auth/dist/oauth2/link-account.mjs`), which issues a two-condition `WHERE`.
Our `account` table has no `issuer` column, so that lookup cannot be satisfied — this is
the single root cause of the outage.

### 2.3 The issuer value for this project

This is the detail that must be exactly right, because the backfill depends on it.

| Sign-in path | `providerId` | `issuer` written by 1.7.2 | Evidence |
|---|---|---|---|
| Google redirect flow | `google` | `https://accounts.google.com` | `@better-auth/core/dist/social-providers/google.mjs:57` (`accountIssuer`) |
| Google One Tap | `google` | `https://accounts.google.com` | `better-auth/dist/plugins/one-tap` — hardcodes both values |
| Email/password credential | `credential` | `local:credential` | `createLocalAccountIssuer("credential")` |

Two consequences worth stating plainly:

- **One Tap and the redirect flow resolve to the same identity.** Both write
  `providerId: "google"` and `issuer: "https://accounts.google.com"`, so a user who signs
  in via One Tap and later via the redirect flow keeps one `account` row. There is no
  identity split to reconcile.
- `createOAuthAccountIssuer()` — which produces `local:oauth:<encoded providerId>` — is only
  the **fallback** used when a provider declares no `accountIssuer` of its own. Google
  declares one, so **`local:oauth:google` is not our value.**

### 2.4 `account.identityStrategy` is not available yet

The official guide presents `account: { identityStrategy: "provider-id" }` as the supported
path for a populated 1.6 database. **That option does not exist in any published release.**
It is absent from `@better-auth/core@1.7.2`'s `dist/types/init-options.d.mts`, where the
`account` option surface is only `updateAccountOnSignIn` and `accountLinking`. The
documentation is ahead of the release.

So on 1.7.2 there is exactly one behaviour — issuer identity — and our backfill must use the
real Google issuer (§2.3). The guide's warning about adopting issuer identity applies to
multi-provider and provider-alias deployments where the trusted authority cannot be inferred
from a 1.6 row. **It does not bite here:** we have exactly one provider, no aliases, and its
authority is unambiguous. Revisit `identityStrategy` only if a future release ships it and we
add a second provider.

### 2.5 Live data audit (read-only)

Run against the `DATABASE_URL` in `packages/db/.env` (database `neondb`):

| Check | Result |
|---|---|
| `account` rows | 6 |
| Distinct `provider_id` | `google` only (6 rows, 6 distinct users, 1:1) |
| Rows with non-null `password` (credential accounts) | **0** |
| Duplicate `(provider_id, account_id)` groups | **0** — no collisions |
| Null/blank `account_id` | 0 |
| `user` rows | 6 |
| Live sessions | 1 |
| `account` indexes | `account_pkey`, `account_user_id_idx` only |

This is the best possible case: a single provider, no collisions, no credential accounts, and
six rows. **This audit must be re-run against `prod` before cutover** — the numbers above are
from the branch this workstation points at, not necessarily production. The audit query is in §6.1.

### 2.6 Things that do *not* change (verified, not assumed)

Each of these was a candidate risk that investigation cleared:

| Area | Finding |
|---|---|
| **Account-selector APIs** | 1.7 reshaped `listAccounts` / `unlinkAccount` / `getAccessToken` / `accountInfo` selectors. **Zero call sites exist** in this repo. No app code to migrate. |
| **Renamed options** | No use of `experimental.joins`, `getIp`, `trustedProxyHeaders`, `allowedHosts`, `validAudiences`, `oidcProvider`, `genericOAuth`, `verifyIdToken`, `generateState`. |
| **Cookie names** | Unchanged: prefix `better-auth`, names `session_token` / `session_data`, `__Secure-` when secure. `apps/admin/src/middleware.ts`'s hardcoded names stay correct. |
| **Cookie-cache signature** | The `compact` strategy HMAC basis is byte-identical between 1.6.26 and 1.7.2 (both sign `JSON.stringify({...session, expiresAt})`). Existing cache cookies keep verifying; the admin middleware's Stage 1 fast path keeps working; **no forced re-login.** |
| **`dash()` schema** | `@better-auth/infra@0.4.5`'s `dash()` contributes tables (`directorySyncConnection`, `directorySyncMembershipProvenance`) and `user.lastActiveAt` **only** behind `opts.managedDirectorySync?.enabled` / `opts.activityTracking?.enabled`. We call `dash()` with no options → **zero new tables.** Keep it that way. |
| **`account` table consumers** | No application code reads or writes `account`. Only the schema definition, relations, migration `0000`, the snapshot, and the drift fingerprint reference reference it. |
| **Drizzle `joins`** | Not needed. When `advanced.database.joins` is off, the adapter factory strips `join` before calling the adapter and resolves it with a separate query (`handleFallbackJoin`, `@better-auth/core/dist/db/adapter/factory.mjs:193`). Our schemaless `drizzle(sql)` client therefore works correctly. |

### 2.7 Constraint: no `transaction: true`

The guide suggests setting the Drizzle adapter's `transaction: true`. **We cannot.**
`packages/db/src/index.ts` uses `drizzle-orm/neon-http`, an HTTP driver with no transaction
support. Leave `transaction` unset.

Consequence: new-user provisioning (`createUser` + `createAccount`) is not atomic. This is
already true on 1.6.26, so the upgrade introduces no regression. Accepted.

---

## 3. Why 1.7.1 broke and 1.7.2 is the right target

Both versions require `account.issuer`, which we lack. They differ in *how they fail*:

- **1.7.1** — the Drizzle adapter's multi-condition `WHERE` branch had no column guard. A
  missing column produced `eq(undefined, value)`, which Drizzle rendered as SQL with the
  column name omitted:
  ```
  from "account" where ( = $1 and "account"."account_id" = $2)
  ```
  A silent, malformed query.
- **1.7.2** — added a shared `resolveFieldName()` used by *both* the single- and
  multi-condition branches, guarded by `is(schemaModel[field], Column)`. A missing column now
  throws a clear `BetterAuthError` naming the field and model.

1.7.2 is therefore the correct target: it fails loudly and diagnosably if the schema is ever
wrong again. It does not, by itself, fix our schema — §5 does that.

---

## 4. Required changes

| # | File | Change |
|---|---|---|
| 1 | `packages/db/src/schema/auth.ts` | Add `issuer` to `account`; add unique index on `(issuer, accountId)` |
| 2 | `packages/db/migrations/0001_*.sql` | Expand: add nullable column + backfill |
| 3 | `packages/db/migrations/0002_*.sql` | Contract: defensive re-backfill, `SET NOT NULL`, unique index |
| 4 | `apps/web/package.json` | `better-auth` → `1.7.2`, `@better-auth/infra` → `0.4.5` |
| 5 | `apps/admin/package.json` | Same |
| 6 | `package.json` (root) | `overrides["@better-auth/core"]` → `1.7.2` |
| 7 | `bun.lock` | Regenerate with the deployment Bun (1.3.13) |
| 8 | `packages/db/scripts/drift/snapshot-fingerprint.ts` | Resolve the **latest** snapshot from the journal, not hardcoded `0000_snapshot.json` (§7.1) |
| 9 | `packages/db/scripts/drift/canonical-fingerprint.reference.json` | Regenerate via `bun run drift:reference` |
| 10 | `packages/db/src/schema/__tests__/better-auth-contract.test.ts` | **New** standing contract test (§7.2) |

Deliberately **not** changed: `dash()` options, `advanced` / `buildCrossSubdomainAdvanced`,
cookie config, `drizzleAdapter` options, middleware, RBAC, env vars.

### 4.1 Schema edit

```ts
// packages/db/src/schema/auth.ts
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const account = pgTable(
  'account',
  {
    // ...existing columns unchanged...
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    // Better Auth 1.7+ scopes account identity by issuer. For Google (both the
    // redirect flow and One Tap) this is the literal
    // 'https://accounts.google.com'; credential accounts use 'local:credential'.
    issuer: text('issuer').notNull(),
    // ...
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    // Better Auth declares this as a required unique compound index.
    uniqueIndex('account_issuer_account_id_uidx').on(table.issuer, table.accountId),
  ],
)
```

Index naming: the upstream guide uses `account_issuer_accountId_uidx`. We use
`account_issuer_account_id_uidx` to match this project's snake_case convention. The runtime
does not depend on the index *name* — only on the columns and the uniqueness guarantee — so
the convention wins. Note the deviation if `auth generate` is ever used for comparison.

---

## 5. The migration: expand / migrate / contract

The ordering hazard is the thing to get right, so it is worth stating why a single migration
is not used.

If the database is migrated to `issuer NOT NULL` **before** 1.7.2 is deployed, any new user
signing up against the still-running 1.6.26 code inserts an `account` row with no `issuer`
and the insert fails — sign-up breaks. If 1.7.2 is deployed **before** the column exists,
every sign-in fails — the outage we just recovered from. Neither order is safe.

The expand / migrate / contract sequence removes the hazard: each step is independently safe
against *both* the old and new code.

### Step 1 — Expand (safe while 1.6.26 is running)

Migration `0001`. Adds the column as **nullable** and backfills. 1.6.26 ignores a column it
does not know about, so this is a no-op for the running application.

```sql
ALTER TABLE "account" ADD COLUMN "issuer" text;
--> statement-breakpoint
-- Google: both the redirect flow and One Tap write this exact issuer.
UPDATE "account" SET "issuer" = 'https://accounts.google.com'
  WHERE "provider_id" = 'google' AND "issuer" IS NULL;
--> statement-breakpoint
-- Defensive: no credential accounts exist today (audit: 0 rows), but if email/password
-- is ever enabled before this migration runs, these are the correct values.
UPDATE "account" SET "issuer" = 'local:credential'
  WHERE "password" IS NOT NULL AND "issuer" IS NULL;
```

Schema state after step 1: `issuer: text('issuer')` — nullable, no unique index yet.

### Step 2 — Deploy 1.7.2

Deploy the dependency bump. From this moment 1.7.2 writes `issuer` on every account it
creates or updates, and reads `(issuer, accountId)`. All pre-existing rows are already
backfilled, so returning sign-ins resolve immediately.

During a rolling deploy, an in-flight 1.6.26 invocation could still insert a row with a NULL
`issuer`. That row would be invisible to 1.7.2's lookup and could produce a duplicate account
on the next sign-in. With six users and one live session the exposure is negligible, but step
3 re-backfills defensively rather than assuming.

### Step 3 — Contract

Migration `0002`, applied after 1.7.2 is confirmed healthy.

```sql
-- Re-backfill anything a straggler 1.6.26 instance inserted during the deploy.
UPDATE "account" SET "issuer" = 'https://accounts.google.com'
  WHERE "provider_id" = 'google' AND "issuer" IS NULL;
--> statement-breakpoint
UPDATE "account" SET "issuer" = 'local:credential'
  WHERE "password" IS NOT NULL AND "issuer" IS NULL;
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_uidx" ON "account" ("issuer","account_id");
```

`SET NOT NULL` fails loudly if any row is still NULL, and the unique index fails loudly on a
collision. Both are the desired behaviour: stop rather than corrupt.

### 5.1 Producing these migrations under the project's migration discipline

The discipline is generate → review → commit → migrate, forward-only. `drizzle-kit generate`
cannot know about the backfill, and left alone would emit an unsafe
`ADD COLUMN "issuer" text NOT NULL` against a populated table. The review step exists exactly
for this — correct the generated SQL *before* committing. Editing a freshly generated,
uncommitted migration is normal; editing a **committed** migration is what forward-only
forbids.

Two migrations come out naturally by generating twice against two schema states:

```powershell
# Step 1: schema has `issuer: text('issuer')` (nullable), no unique index
bun run generate                 # emits 0001
# review 0001, then hand-add the two backfill UPDATE statements

# Step 2: schema has `.notNull()` + uniqueIndex(...)
bun run generate                 # emits 0002 (SET NOT NULL + CREATE UNIQUE INDEX)
# review 0002, then hand-add the two defensive re-backfill UPDATEs above it

# Refresh the DB-free drift artefacts after EACH generate
bun run --filter=@rgss/db drift:reference
```

Postgres DDL is transactional and Drizzle wraps each migration, so each step is atomic on its own.

### 5.1.1 The two migrations must ship in SEPARATE pull requests

This is a hard constraint, not a preference. `bun run migrate` applies **every** committed
migration that a branch has not yet seen. If `0001` and `0002` are committed together, the
first `migrate` run applies both — `issuer` becomes `NOT NULL` in the same breath as it is
created, which collapses the expand/contract split and reinstates exactly the ordering hazard
it exists to remove.

So the rollout is two PRs with the deploy between them:

| | PR 1 — *expand* | PR 2 — *upgrade + contract* |
|---|---|---|
| Dependencies | unchanged (1.6.26) | `better-auth` 1.7.2, `@better-auth/infra` 0.4.5, core override, `bun.lock` |
| Schema | `issuer` nullable | `issuer` `.notNull()` + `uniqueIndex` |
| Migration | `0001` — add column + backfill | `0002` — re-backfill + `SET NOT NULL` + unique index |
| Also includes | drift-gate latest-snapshot fix, schema contract test | — |
| After merge | apply `0001` to every branch | deploy, **verify sign-in**, *then* apply `0002` |
| Safe because | nullable column is inert to 1.6.26 | 1.7.2 always writes `issuer`, so the constraint can be enforced |

Migrations are not run by the deploy pipeline — `deploy-aws.yml` and `migrate.yml` are separate
workflows — so this ordering is under manual control and does not require pipeline changes.

PR 1 carries the drift fix and the contract test deliberately: both must be in place *before*
the dependency bump, so that PR 2's CI has a gate capable of catching a schema mismatch.

### 5.2 Per-branch rollout

Migrations apply in `dev → test → pprd → prod` order over `DATABASE_URL_UNPOOLED`.
Because the sequence is split around a deploy, each branch runs:

1. `bun run migrate` (applies `0001`)
2. deploy 1.7.2 to that environment
3. verify sign-in (§6.2)
4. `bun run migrate` (applies `0002`)
5. re-verify

`test` and `pprd` may instead be converged by `reset_from_parent` off canonical `prod` once
`prod` is canonical — the ratified data-loss tradeoff in the migration-discipline steering
doc. `prod` and `dev` are always forward-migrated with data preserved.

> **Production cutover.** Take a restorable backup immediately before applying `0001` to
> `prod` (`pre-migration-backup` workflow) and keep it for the rollback window. Do not run
> step 1 and step 3 in the same maintenance action — step 3 is gated on step 2 being verified
> healthy.

---

## 6. Verification

### 6.1 Pre-flight audit (must pass on the target branch before `0001`)

```sql
-- 1. Provider inventory — expect only 'google'
SELECT provider_id, COUNT(*) AS n, COUNT(DISTINCT user_id) AS users
FROM account GROUP BY provider_id ORDER BY n DESC;

-- 2. Credential accounts — expect 0, else they need 'local:credential'
SELECT COUNT(*) FROM account WHERE password IS NOT NULL;

-- 3. Collisions — MUST return zero rows before the unique index is created
SELECT provider_id, account_id, COUNT(*) AS n, COUNT(DISTINCT user_id) AS users
FROM account GROUP BY provider_id, account_id HAVING COUNT(*) > 1;

-- 4. Degenerate subjects — expect 0
SELECT COUNT(*) FROM account WHERE account_id IS NULL OR btrim(account_id) = '';
```

If (3) returns rows, **stop**. Duplicates belonging to one user need a chosen survivor and
reconciled tokens/scopes/timestamps; a key spanning two users needs ownership established
from Google, never by matching email.

### 6.2 Post-deploy functional gates

| Gate | Expected |
|---|---|
| Returning user, Google redirect flow | Signs in; no new `account` row created |
| Returning user, Google One Tap | Signs in; resolves to the **same** `account` row |
| Brand-new user | `user` + `account` created; `issuer = 'https://accounts.google.com'`; lands on `/onboarding` |
| Cross-subdomain session | Staff session on `theroyalglow.in` is accepted on `admin.theroyalglow.in` with no re-auth |
| Admin middleware fast path | Stage 1 `getCookieCache` resolves the role (no fallback fetch storm) |
| Lambda logs | No `BetterAuthError`, and **no** `from "account" where ( = $1` |
| `account` row count | Unchanged for returning users (proves no duplicate identities) |

Post-migration integrity check:

```sql
SELECT COUNT(*) AS total,
       COUNT(issuer) AS with_issuer,
       COUNT(DISTINCT issuer) AS distinct_issuers
FROM account;
-- expect total = with_issuer, distinct_issuers = 1 ('https://accounts.google.com')
```

### 6.3 Test-suite items to expect

- `apps/admin/src/lib/session-sharing.test.ts` asserts against the **source text** of both
  `auth-server.ts` files. Adding options is fine; reformatting the
  `buildCrossSubdomainAdvanced(...)` call is not.
- `apps/admin/e2e/**` RBAC specs use `storageState` fixtures holding real session cookies.
  The cookie format is unchanged (§2.6), so existing states should remain valid — confirm
  rather than assume, and re-capture if `auth-redirect.spec.ts` starts failing.
- `apps/admin/src/lib/dev-auth.ts`'s `DevSession` hand-mirrors the session shape; typecheck it
  against 1.7.2's inferred `Session`.

### 6.4 Rollback

Before step 3 (`0002`), rollback is a dependency revert only — `issuer` is nullable and
1.6.26 ignores it, so the PR #174 pattern (revert the four dependency files, redeploy)
restores service with no schema change.

After step 3, `issuer` is `NOT NULL` and 1.6.26 can no longer insert accounts, so new
sign-ups would fail. Rolling back then requires either restoring the pre-migration backup or
a forward migration dropping the constraint and index:

```sql
DROP INDEX IF EXISTS "account_issuer_account_id_uidx";
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;
```

This is why step 3 is deliberately separated and gated on a verified-healthy step 2.

---

## 7. Staying upgrade-ready (the durable part)

The outage happened because a dependency bump could change a runtime data contract with
nothing in CI to notice. Version pinning alone would not have prevented it — it would only
have delayed it. The fix is to make the contract **executable**.

### 7.1 Fix the drift fingerprint to track the latest snapshot

`packages/db/scripts/drift/snapshot-fingerprint.ts` hardcodes
`DEFAULT_SNAPSHOT_PATH = .../migrations/meta/0000_snapshot.json`. That was correct while
`0000` was the only migration. `drizzle-kit generate` writes a **new** `NNNN_snapshot.json`
per migration, so the moment `0001` lands, the fingerprint reference stops reflecting the real
schema and the drift gate silently degrades to a false pass.

Change `DEFAULT_SNAPSHOT_PATH` to resolve the highest-`idx` entry in
`migrations/meta/_journal.json` and derive `meta/<tag-index>_snapshot.json` from it, keeping
the explicit-path override for tests. This must land **with** migration `0001`, not after.

### 7.2 Add a Better Auth schema contract test (highest-value item)

This is the test that would have caught 1.7.1 in CI, before deploy. It asks Better Auth
itself what schema it requires, and asserts our Drizzle tables satisfy it — so the *library*
tells us when its contract moves.

The approach is **verified**, not theoretical. `getAuthTables()` is a public export
(`@better-auth/core` exports `./db`), needs no database, and accepts a plain options object.
Called against 1.7.2 it returns:

```
models: user, session, account, verification
account.indexes: [{"fields":["issuer","accountId"],"unique":true}]
account REQUIRED fields: issuer, accountId, providerId, userId, createdAt, updatedAt
issuer field: {"type":"string","required":true,"fieldName":"issuer"}
```

Both halves of what we were missing — the required `issuer` field *and* the unique
`(issuer, accountId)` index — are machine-readable, so the test can assert both.

```ts
// packages/db/src/schema/__tests__/better-auth-contract.test.ts
import { getAuthTables } from '@better-auth/core/db'
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../index'

// Mirror the PRODUCTION option set: same plugins, same additionalFields.
const options = {
  user: { additionalFields: { role: { type: 'string', required: false } } },
  socialProviders: { google: { clientId: 'x', clientSecret: 'y' } },
  plugins: [/* dash(), oneTap() — with the same options as production */],
} as const

describe('Better Auth schema contract', () => {
  const tables = getAuthTables(options as never)

  for (const [model, def] of Object.entries(tables)) {
    it(`drizzle schema satisfies every required field of "${model}"`, () => {
      const table = (schema as Record<string, unknown>)[model]
      expect(table, `no Drizzle table exported for model "${model}"`).toBeDefined()

      const columnKeys = new Set(Object.keys(getTableColumns(table as never)))
      const required = Object.entries(def.fields)
        .filter(([, f]) => (f as { required?: boolean }).required)
        .map(([key]) => key)

      const missing = required.filter((k) => !columnKeys.has(k))
      expect(missing, `missing required column(s) on "${model}"`).toEqual([])
    })
  }
})
```

Why the key comparison is correct: Better Auth reports `fieldName: "accountId"` (camelCase),
but our physical column is `account_id`. That mismatch is harmless because the Drizzle adapter
resolves columns by the table object's **JS property key**, not the physical name — which is
also why the current snake_case schema works at all. So compare Better Auth's field *keys*
against `getTableColumns()` keys, never against `fieldName`.

On 1.6.26 this test passes. On 1.7.2 against the unmigrated schema it fails with
`missing required column(s) on "account": ["issuer"]` — precisely the outage, caught in CI.

Also assert the declared indexes, since `def.indexes` is machine-readable:

```ts
it('declares the required unique compound indexes', () => {
  // account.indexes → [{ fields: ['issuer', 'accountId'], unique: true }]
  const required = tables.account.indexes ?? []
  expect(required).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ fields: ['issuer', 'accountId'], unique: true }),
    ]),
  )
})
```

Pair that with an assertion that the migration history actually creates it (grep the committed
SQL for a `CREATE UNIQUE INDEX` over `("issuer","account_id")`), since Drizzle's index
metadata is not as directly introspectable as its columns.

Wire the whole file into the existing `drift-gate` CI job so a Better Auth bump cannot merge
without a matching schema.

### 7.3 Dependency-update policy

- **Group** `better-auth`, `@better-auth/*`, and the `auth` CLI into a single Dependabot/
  Renovate PR. They must never move independently — the root `overrides` pin on
  `@better-auth/core` makes a split bump resolve to a mismatched pair.
- **Never auto-merge** a `better-auth` minor or major. Patch-only auto-merge is acceptable
  once §7.2 is in place.
- Keep the version **exact** (no `^`) in both app manifests, as today.

### 7.4 Pre-upgrade checklist (use for every future Better Auth bump)

1. Read the upstream upgrade guide for the target line; note anything touching `account`,
   `session`, cookies, or the adapter contract.
2. Run the §7.2 contract test against the target version **before** changing app code. It
   answers "does our schema still satisfy the library?" in seconds.
3. Diff the adapter's `convertWhereClause` / field-resolution for new guard behaviour, and
   grep the new `dist` for newly required columns.
4. Audit production data for the new constraint (§6.1) before writing any migration.
5. Rehearse on `test` with a `prod`-derived dataset; verify, then run the plan again and
   confirm it reports no remaining work.
6. Roll out via expand / migrate / contract whenever a new required column is involved.

### 7.5 Revisit list

- `account.identityStrategy` — adopt an explicit value once it ships, to silence the
  compatibility-mode warning and pin the semantics (§2.4).
- `transaction: true` — becomes possible only if `packages/db` moves off `neon-http` to a
  driver with transaction support (§2.7).
- `advanced.database.joins` — currently unnecessary; enabling it would require registering
  Drizzle relations on the `drizzle()` call and re-checking the relation-key naming.

---

## Corrections to earlier notes

The scratch files written under `.sst/auth-hotfix/` during the incident are superseded by this
document. Two claims in them were wrong:

1. They implied the 1.7 path required mapping Google to a provider-scoped namespace via
   `identityStrategy`. **That option does not exist in any published release** (§2.4).
2. They proposed keeping `issuer` nullable indefinitely as a compatibility mode. Better Auth
   declares the field **required** with a unique compound index; nullable is only a transient
   state inside the expand/contract sequence (§5).

The Google issuer value they gave — `https://accounts.google.com` — is correct, and is
confirmed here from the provider source.

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-09-01 | Target 1.7.2, not a later 1.7.x | 1.7.2 is the newest published release; it also added the adapter guard that turns a schema mismatch into a clear error |
| 2026-09-01 | Use issuer identity with `https://accounts.google.com` | Only behaviour available on 1.7.2; single provider with an unambiguous authority makes the mapping deterministic |
| 2026-09-01 | Hand-correct generated migration SQL | `drizzle-kit` cannot emit the backfill and would emit an unsafe `NOT NULL` add; the review step exists for this |
| 2026-09-01 | Split into expand / migrate / contract | Both single-migration orderings break either sign-up or sign-in; splitting makes every step safe against old and new code simultaneously |
| 2026-09-01 | Keep `dash()` option-free | Its schema contributions are gated; passing no options keeps the upgrade to zero new tables |
| 2026-09-01 | Add a library-derived schema contract test | Version pinning delays breakage; an executable contract detects it in CI |

## Reference

- [authentication.md](./authentication.md) — auth design and RBAC
- [database.md](./database.md) — schema conventions
- [`.kiro/steering/migration-discipline.md`](../.kiro/steering/migration-discipline.md) — generate → review → commit → migrate
- [Better Auth 1.7 upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide) — upstream source (note §2.4: documents an unreleased option)
- PR [#174](https://github.com/royalglowsalonspa/theroyalglow-webapp/pull/174) — the 1.6.26 emergency rollback and its revert pattern
