# Service Catalogue Migration — Deployment Runbook

> One-time migration that makes **Payload CMS the only write path** for the service catalogue. Covers the pre-deployment backup, the per-branch deployment checklist, and the rollback procedure. For how the catalogue works *after* this migration, see [service-catalogue-management.md](./service-catalogue-management.md).

## Scope

| Item | Detail |
|------|--------|
| **What changes** | `cms.service` / `cms.service_category` become the authoring surface; an `afterChange` hook mirrors every write into `public.service` / `public.service_category` in the SAME transaction |
| **What does NOT change** | `public.service` / `public.service_category` structure, and every booking-engine read. `packages/db/migrations/` gains no migration |
| **Destructive step** | `cms.service.id` changes from Payload's default integer to `varchar` (Payload migration `20260729_182023_drop_legacy_service_collection`) |
| **Downtime** | None. The booking engine reads `public.*` throughout |
| **Spec** | `.kiro/specs/payload-service-management/` (Requirements 11, 15, 19) |

### Migration state per branch

The code is on all four git branches. **The `cms` schema change is now applied on all four branches** — this was previously the single biggest risk in this deployment, because the collections cannot write against the old shape (`push: false`, so nothing self-applies).

| Branch | Payload migrations applied | Catalogue seeded | Next action |
|--------|---------------------------|------------------|-------------|
| `dev` | ✅ all four (batches 1-3) | ✅ 57 services, 10 categories, zero drift | none |
| `test` | ✅ all four (batch 1) | n/a — `public.service` is empty | none |
| `pprd` | ✅ all four (batch 1) | n/a — `public.service` is empty | none |
| `prod` | ✅ all four (batch 1 + batch 2) | n/a — `public.service` is empty | seed when the catalogue is loaded |

The four migrations, in order (`apps/cms/src/migrations/`):

1. `20260614_185535_initial`
2. `20260729_182023_drop_legacy_service_collection`
3. `20260729_182235_create_service_catalogue_collections`
4. `20260729_201902_add_mcp_api_keys`

Forward-only, per `.kiro/steering/migration-discipline.md`: never edit, reorder, or delete them, and apply per branch in `dev` → `test` → `pprd` → `prod` order.

### How they were applied, and what was verified

Use **`.github/workflows/cms-migrate.yml`** (Actions → *Apply CMS Migrations (Payload)*) for any future branch. It exists because `migrate.yml` is **drizzle-only** (`bun run migrate` → `drizzle-kit migrate` → `public` schema); the `cms` schema has a separate ledger, `cms.payload_migrations`, which had no runner at all. That missing runner is why three branches sat behind `dev`.

State found before this was applied, and the outcome:

| Branch | Before | After |
|--------|--------|-------|
| `test` | no `cms` schema at all | 22 `cms` tables, all four migrations |
| `pprd` | no `cms` schema at all | 22 `cms` tables, all four migrations |
| `prod` | `cms` schema present (20 tables), only `…_initial` applied; `cms.service.id` still `integer`/serial | 22 tables, all four; `cms.service.id` now `character varying` |

Note the earlier version of this table recorded `prod` as un-migrated. That was misleading: `prod` already carried the `cms` schema and batch 1. Only the last three migrations were outstanding.

Verified on every branch after applying:

- `cms.service.id` is `character varying`, `cms.service_category` and `cms.payload_mcp_api_keys` exist.
- `cms.payload_mcp_api_keys` has 11 capability columns, **all `*_find`** — zero `*_create`/`*_update`/`*_delete`. Read-only MCP access is a security property of this design, so `cms-migrate.yml` **fails the run** if a write capability column ever appears.
- `public` untouched: `public.service` / `public.service_category` row counts unchanged, 38 base tables and 19 enums unchanged.
- **Requirement 19.4 pre-flight held:** `prod.cms.service` was the legacy serial-id table with **0 rows**, re-asserted immediately before the destructive drop. Nothing was lost. `cms-migrate.yml` enforces this check and refuses to run when the table is non-empty.

Steps 4-5 below (seed, compare against the 57/10 baseline) **did not apply** to `test`/`pprd`/`prod`: `public.service` is empty on all three, so there is nothing to seed from. The 57 services exist only on `dev`. Seed each branch when its catalogue is actually loaded.

---

## Step 0 — Pre-deployment backup (run this first, per branch)

Workflow: **`.github/workflows/pre-migration-backup.yml`** → Actions → *Pre-Migration Catalogue Backup* → pick the branch about to be migrated.

It reuses the `weekly-backup.yml` mechanism (`pg_dump` → gzip → Cloudflare R2 → download-and-verify), narrowed to the catalogue:

| Property | Value |
|----------|-------|
| Tables captured | `public.service_category`, `public.service`, `cms.service_category`, `cms.service` — whichever exist on the branch |
| Connection | `DATABASE_URL_UNPOOLED_{DEV,TEST,PPRD,PROD}` (direct Neon host, same as `migrate.yml`) |
| Destination | `s3://rgss-backups/pre-migration/rgss_catalogue_{env}_{timestamp}.sql.gz` |
| Verification | Re-downloads the object, `gunzip -t`, and asserts a `COPY public.service` data section exists |
| Retention | **Manual.** Nothing prunes this prefix — these must outlive the 8-week `weekly/` rotation |

Two things it gives you beyond the dump:

- A **baseline row-count table** in the run summary (`public.*` counts to compare after seeding, plus `cms.service`).
- The **Requirement 19.4 pre-flight**: `cms.service`'s real row count on that branch. The legacy collection is believed dead and empty, but the `id` type change is destructive, so this is verified, not assumed. If it reports rows, the dump already contains them — record an explicit discard-or-recreate decision before applying the migration.

Why not rely on the weekly backup: it runs Sunday 02:00 UTC against `prod` only. A weekday migration on `test`/`pprd`/`prod` could otherwise sit six days behind, and restoring a whole database to recover 67 catalogue rows is the wrong tool.

### Restoring from a pre-migration backup

Only needed if the catalogue data itself is damaged — the rollback procedure below does **not** require it (Req 15.4).

```bash
aws s3 cp s3://rgss-backups/pre-migration/rgss_catalogue_prod_<timestamp>.sql.gz . \
  --endpoint-url "https://<r2-account-id>.r2.cloudflarestorage.com"
gunzip rgss_catalogue_prod_<timestamp>.sql.gz
psql "$DATABASE_URL_UNPOOLED" < rgss_catalogue_prod_<timestamp>.sql
```

The dump was taken with `--clean --if-exists`, so it drops and recreates those tables. `booking_service.service_id` has an `ON DELETE RESTRICT` foreign key to `public.service`, so a restore over live booking data fails loudly rather than orphaning bookings — restore into a Neon branch first and diff if you are not certain.

---

## Deployment checklist (per branch, in `dev` → `test` → `pprd` → `prod` order)

Neon PITR (7 days) plus Step 0 cover you throughout. Do not start a branch you cannot finish: between step 2 and step 6 the CMS can read the catalogue but does not mirror edits.

- [ ] **1. Verify `cms.service` is empty before the destructive `id` change** (Req 19.4)

  ```sql
  SELECT count(*) FROM cms.service;
  ```

  Step 0's summary already reports this. Zero → proceed. Non-zero → the rows are in the Step 0 dump; record the discard-or-recreate decision, then proceed.

- [ ] **2. Apply the Payload migration**

  ```bash
  cd apps/cms
  bun payload migrate
  ```

  Generated and reviewed under Task 3.0, committed with the collection change. `DATABASE_URL` must point at the branch being migrated. Never `push`, never hand-edit. Confirm afterwards that `cms.service_category` exists and `cms.service` has the new columns.

- [ ] **3. Deploy the CMS with the sync disabled by flag**

  Set `SERVICE_SYNC_ENABLED=false` on the CMS service (Render env var) and deploy. This is a flag, not a code edit — the hooks stay registered and short-circuit on the first line. Without it, step 4 fails.

- [ ] **4. Seed Payload from the live catalogue**

  ```bash
  cd apps/cms
  SERVICE_SYNC_ENABLED=false bun run --env-file=.env.local scripts/seed-services.ts
  ```

  PowerShell: `$env:SERVICE_SYNC_ENABLED='false'` on its own line first (semicolon chaining is unreliable), then the `bun run` call.

  The script reads FROM `public.*` and calls `payload.create()` with the same ids and timestamps, so it must not fire the sync hook back onto the rows it just read. It **refuses to start** when the flag is enabled. It is idempotent via a `cms.*` id skip-set, so a re-run after a partial failure resumes rather than duplicating. It also pre-validates every row (durations must be members of `SERVICE_DURATION_MINUTES`) before writing anything.

- [ ] **5. Verify the seed in the Payload admin**

  `https://cms.theroyalglow.in/admin/collections/service` and `.../service_category`. Compare against the Step 0 baseline counts — on `dev` that is 57 services and 10 categories. Spot-check a service's price, duration and category relationship.

- [ ] **6. Re-enable the sync and restart the CMS**

  Remove the `SERVICE_SYNC_ENABLED=false` override (or set `true`) and restart. Only the literal string `false` disables the sync, so an unset variable is the enabled state.

- [ ] **7. Test create and update, covering all 8 duration values**

  Create one throwaway service per value of `SERVICE_DURATION_MINUTES` (15, 30, 45, 60, 90, 120, 150, 180), then confirm `public.service.duration_minutes` is the matching **integer** (`pg_typeof` = integer, never `NaN` — the mapper coerces Payload's `select` string). Update one service's name and price and confirm both land in `public.service`. Retire the throwaways with `isActive = false`; delete is disabled by design.

- [ ] **8. Deploy the admin portal**

  Ships the four write endpoints returning `410 ENDPOINT_GONE`, the deleted service-management UI, the Manager-gated `/services` redirect to the CMS collection, and the nav/test updates.

- [ ] **9. Verify the booking engine**

  Place a real test booking end-to-end. Confirm `/services`, `/services/[slug]`, `GET /api/services` and the booking dialog all still read `public.*` and show the seeded catalogue. `GET /api/services` and `GET /api/services/all` (admin) must be byte-shape identical to before.

- [ ] **10. Monitor for the first hour**

  Watch CMS logs for `[sync]` error entries and Sentry for CMS 500s. A failed sync rolls the whole transaction back, so the symptom is a failed save in the admin UI, never a half-written row. Confirm nothing legitimate is hitting the `410` endpoints.

### After the last branch

- [ ] Register the drift-reconciliation schedule: Actions → *Register QStash Schedules* (`register-schedules.yml`, idempotent). Job 20 `service-drift-reconcile` runs daily at `45 18 * * *` UTC (00:15 IST).
- [ ] Confirm `BETTER_STACK_HEARTBEAT_SERVICE_DRIFT` is set and its heartbeat monitor exists. The job pings it **only on a clean run**, so drift trips the monitor by silence.
- [ ] Confirm `SERVICE_SYNC_ENABLED` is present and enabled on every CMS environment.

---

## Rollback procedure

**Budget: 15 minutes from detection** (Req 15.5). Steps are ordered by how fast they act, not by how thorough they are.

### Triggers

- Booking engine broken (catalogue reads wrong, missing, or erroring)
- Sync failure rate above 10%
- Any confirmed data inconsistency between `cms.*` and `public.*`

### Step 1 — Disable the sync by flag (seconds, no code change)

```bash
# On the CMS service (Render env var), then restart
SERVICE_SYNC_ENABLED=false
```

`isSyncEnabled()` in `apps/cms/src/lib/sync-db.ts` is read on every hook invocation. Setting the flag stops all `public.*` writes from the CMS immediately; CMS saves still succeed against `cms.*` and nothing throws. This alone contains the write path.

> **Do NOT roll back by commenting out the hook registrations.** That is the last resort, not the first: it needs a code edit, review, rebuild and redeploy, which does not fit the 15-minute window. The flag exists so an incident never needs a build.

### Step 2 — Restore the admin write APIs (within 15 minutes)

```bash
git revert <commit-that-removed-write-apis>
git push origin prod
```

Brings back `POST /api/services`, `PATCH /api/services/[id]`, `POST /api/service-categories` and `PATCH /api/service-categories/[id]` so `public.*` has a working write path again while the sync is off. Redeploy the admin app.

### Step 3 — Restore the admin UI (optional)

```bash
git revert <commit-that-removed-ui>
git push origin prod
```

Only needed if someone must edit the catalogue through the admin portal during the incident. With step 1 done and step 2 deployed, the catalogue is already safe and readable.

### What NOT to do

| Do not | Why |
|--------|-----|
| Revert the Payload migration | Migrations are forward-only (Req 19.6). With the flag off, `cms.*` in its new shape is inert and harmless. Corrections ship as a new forward migration |
| Restore `public.*` from backup | Not required (Req 15.4). The sync only inserts and updates, never deletes, so the catalogue data stays intact through an incident. Restore only if the data itself is proven damaged |
| Comment out hooks as the first move | See step 1 — a rebuild does not fit the window |
| Hard-delete anything in the CMS | Delete is disabled on both collections by design; retire with `isActive = false` |

### Re-enabling after a rollback

Fix the root cause, verify on `dev`, then repeat checklist steps 6-7 on the affected branch. Run Job 20 (`POST /api/jobs/service-drift-reconcile`) manually before re-enabling and reconcile any divergence by hand — the job detects and alerts, it never repairs.

---

## Known caveats

Two behaviours that look like bugs and are not. Both matter when verifying a migration.

### 1. A CMS-originated **create** leaves `public.*.updated_at` fresher than `cms.*`

The mapper deliberately omits `updatedAt` on the create path, so `public.*` takes the column default `now()` while `cms.*` keeps the value Payload supplied. **`created_at` IS preserved** on both. Consequences:

- Comparing `updated_at` between the two schemas after a create shows a difference. That is expected, not drift.
- The seed is unaffected: it runs with `SERVICE_SYNC_ENABLED=false` and never rewrites `public.*`, so the migrated rows keep their original timestamps.
- Job 20 does not flag it: both values are written in the same request, so the gap stays inside its 1-second timestamp tolerance (`DRIFT_TIMESTAMP_TOLERANCE_MS`).

### 2. Timestamps only match to the millisecond

Payload's `cms.*` timestamp columns are precision 3; `public.*` keeps microseconds. The same logical instant can therefore differ slightly between the two (max observed delta 0.0004 s). Any comparison — a verification query, a test, an ad-hoc check — needs a tolerance. Job 20 allows 1 second of slack; every real sync failure is far larger than that.

---

## References

- [service-catalogue-management.md](./service-catalogue-management.md) — steady-state: where services are managed, sync mechanism, failure modes
- [deployment.md](./deployment.md) — deployment pipeline, backup strategy, rollback tiers
- [background-jobs.md](./background-jobs.md) — Job 20, service catalogue drift reconciliation
- `.kiro/steering/migration-discipline.md` — generate → review → commit → migrate, and the per-branch order
- `.kiro/specs/payload-service-management/` — requirements, design, tasks
