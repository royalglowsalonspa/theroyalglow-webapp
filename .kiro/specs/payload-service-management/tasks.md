# Implementation Plan: Payload Service Management

## Overview

Migrate service/category management from admin portal to Payload CMS. Establish write-in-CMS, read-from-Drizzle architecture via real-time `afterChange` hooks. Zero impact on booking engine.

## Tasks

- [x] 1. Repurpose/create Payload collections with sync hooks
  - [x] 1.1 Repurpose `apps/cms/src/collections/Service.ts` (existing file, existing dead-code collection — verified no live caller of `getServices()` in `apps/web`)
    - Replace the entire existing field set (`type`, `category`, `bookingRef`, `active`, `featured`, `order`) with the booking-accurate schema
    - Define fields: id (custom text, see 1.1a), categoryId (relationship to `service_category`), name, slug, description, durationMinutes (fixed select, see 1.1b), bufferMinutes, pricePaise, isActive, imageUrl, displayOrder, gemsRedeemable, gemsRequired, gemsCatalogueOrder
    - Keep collection slug `service` unchanged — no rename, no new collection (avoids the collision previously identified)
    - Add field-level validation: pricePaise min 0
    - Add `beforeValidate` hook for conditional gems validation (gemsRedeemable → requires gemsRequired > 0)
    - Add `beforeChange` hook for slug auto-generation using `slugify({ lower: true, strict: true })`
    - Set access control using existing `adminsWrite`/`anyoneReads` helpers from `../access/published` (Payload's own auth, not Better Auth)
    - Set `delete: () => false` — DISABLE delete entirely; services retire via isActive toggle only. Add `admin.description` text noting deletion is intentionally unavailable (deactivate instead)
    - Compose hooks: `afterChange: [syncServiceToPublic, ...revalidateHooks('service').afterChange]` and `afterDelete: revalidateHooks('service').afterDelete` — do NOT drop the existing revalidate hook (composing both keeps site cache fresh after edits)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.10, 1.11, 1.12, 14.1, 14.3, 14.4, 14.6, 14.7, 18.1_

  - [x] 1.1a Add custom `id` field override (services)
    - Declare `id` as a `text` field with `admin: { hidden: true }`
    - Add `beforeValidate` hook generating a 21-char nanoid-format string on create (matching `@rgss/db`'s `nanoid()` alphabet/length exactly)
    - This OVERRIDES Payload's Postgres-adapter default auto-increment integer id — without this, FK writes to `booking_service.service_id`, `staff_service.service_id`, `offer_service.service_id`, `waitlist.service_id` will not line up with `public.service.id`'s format
    - _Requirements: 1.8_

  - [x] 1.1b Add fixed-duration `select` field sourced from a shared constant (replaces `isValidDurationForType`)
    - FIRST add the shared constant to `packages/types/src/service.ts`: `export const SERVICE_DURATION_MINUTES = [15, 30, 45, 60, 90, 120, 150, 180] as const` plus `export type ServiceDurationMinutes = (typeof SERVICE_DURATION_MINUTES)[number]` — this is the SINGLE source of truth
    - Define `durationMinutes` as a `select` field whose options are DERIVED from that constant by mapping each value to a `{ label, value }` pair (label = the number followed by " minutes", value = `String(m)`) — do NOT hard-code the list in the collection, or the CMS UI, validation, and seed data can drift apart
    - The 8-value set is data-driven: an audit of the real 57-service catalogue (`packages/db/scripts/data/services-salon.ts` + `services-spa.ts`) found 8 services at 45min, 3 at 120min, and 1 at 180min (keratin). A 15/30/60/90-only set would fail seed validation on all 12 and would double-book a stylist by squeezing 180min into 90min. `150` is headroom
    - Add admin description noting typical mapping (beard/shave 15min, haircut 30min, advanced haircut / classic facial / spa mani-pedi 45min, most SPA 60-90min, global colour long & bridal makeup 120min, keratin 180min)
    - Do NOT port `isValidDurationForType()` or reference `SPA_DURATIONS` — `SERVICE_DURATION_MINUTES` supersedes both for the CMS write path, and the fixed option set makes the old SPA/Salon conditional rule unnecessary by construction. Leave the old exports in place (out of scope to delete)
    - Do NOT add a Drizzle migration: `public.service.duration_minutes` stays a plain `integer` with no CHECK constraint, and the booking engine is unchanged
    - Note for later: Payload backs a `select` on Postgres with a `cms`-schema enum, so ADDING a duration value later needs (a) a constant edit plus (b) one `payload migrate:create` + `migrate` — cheap, but not zero-step
    - _Requirements: 1.9, 1.13, 1.14_

  - [x] 1.2 Create `apps/cms/src/collections/ServiceCategory.ts` (new file, new collection — no existing slug conflict)
    - Define all fields matching Drizzle schema (id, name, slug, description, serviceType, displayOrder, isActive)
    - Configure Payload collection: slug `service_category`, admin title field `name`
    - Add custom `id` field override (same nanoid pattern as 1.1a)
    - Add serviceType select field with options: `salon`, `spa`
    - Add `beforeChange` hook for slug auto-generation
    - Set access control using `adminsWrite`/`anyoneReads` helpers (same as 1.1); set `delete: () => false` (disable delete)
    - Compose hooks: `afterChange: [syncServiceCategoryToPublic, ...revalidateHooks('service').afterChange]` and `afterDelete: revalidateHooks('service').afterDelete`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 14.2, 14.3, 14.4, 14.6, 18.2_

  - [ ]* 1.3 Write property test for slug generation (services)
    - **Property 1: Slug Generation Correctness (Services)**
    - **Validates: Requirements 1.7**
    - Generate arbitrary service names, verify slug is lowercase, hyphen-separated, no special chars

  - [ ]* 1.3a Write property test for duration value correctness
    - **Property 2: Duration Value Correctness**
    - **Validates: Requirements 1.9, 1.13**
    - Generate services with each allowed duration option value, verify only members of `SERVICE_DURATION_MINUTES` (`15|30|45|60|90|120|150|180`) are accepted and the mapped Drizzle value is a valid integer (never NaN)
    - Import `SERVICE_DURATION_MINUTES` and derive the expected set from it — do NOT restate the literals, so the test cannot drift from the source of truth
    - Include the real-catalogue outliers explicitly as cases: 45 (haircut-advanced), 120 (makeup-bridal), 180 (keratin)

  - [x]* 1.3b Write property test for custom ID format correctness
    - **Property 3: Custom ID Format Correctness**
    - **Validates: Requirements 1.8, 2.10**
    - Generate service and category creations, verify resulting `id` is a 21-character string from the nanoid alphabet, never an integer or UUID

  - [ ]* 1.4 Write property test for slug generation (categories)
    - **Property 5: Slug Generation Correctness (Categories)**
    - **Validates: Requirements 2.7**
    - Generate arbitrary category names, verify slug format

  - [ ]* 1.5 Write property test for gems conditional validation
    - **Property 4: Gems Conditional Validation**
    - **Validates: Requirements 1.11**
    - Generate services with gemsRedeemable=true, verify gemsRequired > 0 enforced

- [x] 2. Verify transaction model, implement sync client, hooks, and field mapping
  - [x] 2.0a Verification spike (GATE — run before 2.0/2.1/2.2): confirm atomic cross-schema transaction write on Payload's handle — PASSED
    - On the `dev` Neon branch, confirm a cross-schema write to `public.*` on Payload's request-scoped transaction handle (`req.payload.db.drizzle`) (a) commits atomically with the `cms.*` write and (b) rolls back together when the hook throws
    - Write a throwaway `afterChange` on a test doc that inserts into `public.service` via `req`'s drizzle handle, then throw; assert BOTH the cms row AND the public row are absent after rollback
    - Then repeat without throwing; assert BOTH rows exist
    - Record the exact accessor path for the transaction-bound handle (confirms the `txDb(req)` shape in `sync-db.ts`)
    - IF the spike fails → switch to the outbox fallback (Task 2.0-fallback) and notify the user before proceeding
    - _Requirements: 4.4, 4.5_

  - [x] 2.0 Create `apps/cms/src/lib/sync-db.ts` (transaction-handle resolver — NOT a separate pool)
    - Re-export `service` and `serviceCategory` table definitions from `@rgss/db/schema` (structure only; do NOT import `@rgss/db`'s `db` export, which is the edge `neon-http` client)
    - Export ASYNC `txDb(req)` returning the transaction-bound handle, using the 2.0a-VERIFIED shape: `const adapter = req.payload.db; const txID = await req.transactionID; return adapter.sessions?.[txID]?.db ?? adapter.drizzle`
    - DO NOT use `req.payload.db.drizzle` directly — the 2.0a spike confirmed that returns the base pool (commits independently → divergence). Use the session handle.
    - Do NOT instantiate a separate `pg.Pool` for the primary path
    - Also export the feature-flag gate `isSyncEnabled()` returning `process.env.SERVICE_SYNC_ENABLED !== 'false'` — default ENABLED so a missing env var can never silently stop syncing; only an explicit `'false'` disables it
    - Add `SERVICE_SYNC_ENABLED` to `apps/cms/.env.example` with a comment that it is set to `false` while seeding and is the primary rollback lever
    - _Requirements: 4.1, 4.2, 4.3, 3.12, 3.13_
    - _Note (2.0a PASSED): atomic cross-schema write verified on dev; unqualified table defs resolve to `public.*`; drizzle-orm 0.45.2 shared with `@payloadcms/drizzle` (no symbol mismatch)_

  - [x] 2.0-fallback (ONLY if 2.0a fails) Implement outbox sync
    - Payload commits `cms.service` as source of truth; `afterChange` enqueues a QStash `sync-service-to-public` job (doc id + operation)
    - QStash endpoint writes `public.*` via a dedicated `drizzle-orm/node-postgres` + bounded `pg.Pool` client; relies on QStash at-least-once retry
    - Drift job (Task 13.1) re-drives never-succeeded jobs
    - _Requirements: 4.5_

  - [x] 2.1 Create `apps/cms/src/hooks/sync-service.ts`
    - Export `syncServiceToPublic` as `CollectionAfterChangeHook`; destructure `{ doc, operation, req }`
    - FIRST line of the hook: short-circuit on the feature flag — `if (!isSyncEnabled()) { log skip; return doc }`. No `public` write, no throw, so the CMS write still succeeds. This is what lets the seed run with hooks registered and is the primary rollback lever
    - Resolve `const db = await txDb(req)` (async) — write on Payload's transaction so cms + public commit/roll back together
    - Handle operation `create`: UPSERT into `public.service` via `.insert(service).values(mapped).onConflictDoUpdate({ target: service.id, set: { ...mutableFields, updatedAt: new Date() } })` — NOT a bare `.insert()`. The seed reads rows FROM `public.service` and then calls `payload.create()` with the SAME id, so a bare insert raises a duplicate-key / unique-slug violation; the upsert makes re-seeding, retries, and pre-existing rows safe instead of fatal
    - Exclude `id` and `createdAt` from the conflict `set` clause so an existing row keeps its original creation timestamp (Property 10) while mutable fields converge
    - Handle operation `update`: UPDATE by id, set updatedAt
    - NO delete branch (delete is disabled at the access layer per Task 1.1)
    - Add structured error logging (document ID, operation, error, stack, durationMs)
    - Re-throw errors so Payload rolls back the WHOLE transaction (no divergence) and returns 500
    - _Requirements: 3.1, 3.2, 3.5, 3.9, 3.10, 3.11, 3.12, 4.1, 5.1, 5.3, 5.6, 5.7, 12.1, 12.2, 12.3, 12.7_

  - [x] 2.2 Create `apps/cms/src/hooks/sync-service-category.ts`
    - Export `syncServiceCategoryToPublic` as `CollectionAfterChangeHook`; short-circuit on `isSyncEnabled()` first, then resolve `const db = await txDb(req)` (async)
    - Handle operation `create`: UPSERT into `public.service_category` via `.onConflictDoUpdate({ target: serviceCategory.id, set: { ... } })` (same idempotency rationale as 2.1 — categories are seeded first, so they hit the collision first); `update`: UPDATE by id on the same transaction
    - Add structured error logging and re-throw on failure
    - _Requirements: 3.3, 3.4, 3.5, 3.9, 3.11, 3.12, 4.1, 5.2, 5.3, 5.6, 5.7_
  
  - [x] 2.3 Create field mapping functions
    - Implement `mapPayloadToPublicService()` in `apps/cms/src/hooks/mappers.ts`
    - Implement `mapPayloadToPublicCategory()` in same file
    - Coerce `durationMinutes` from Payload's `select`-field string value (`'15'|'30'|'45'|'60'|'90'|'120'|'150'|'180'`, per `SERVICE_DURATION_MINUTES`) to a `Number()` before mapping — Drizzle's column is integer; verify result is never `NaN`
    - Normalize `categoryId`: handle both bare-ID-string and populated-object shapes (depends on Payload request `depth`)
    - Handle nullable fields: coalesce undefined → null (description, imageUrl, gemsRequired, gemsCatalogueOrder)
    - Preserve createdAt from Payload (NEVER modify)
    - Apply default values: bufferMinutes → 0, displayOrder → 0, isActive → true, gemsRedeemable → false
    - _Requirements: 3.6, 3.7, 9.1-9.14, 10.1-10.7_
  
  - [ ]* 2.4 Write property test for service create sync
    - **Property 6: Service Create Sync Correctness**
    - **Validates: Requirements 3.1**
    - Mock Payload document creation, verify identical row exists in Drizzle with matching fields
  
  - [ ]* 2.5 Write property test for service update sync
    - **Property 7: Service Update Sync Correctness**
    - **Validates: Requirements 3.2**
    - Mock Payload document update, verify Drizzle row updated with matching id
  
  - [ ]* 2.6 Write property test for category create sync
    - **Property 8: Category Create Sync Correctness**
    - **Validates: Requirements 3.3**
    - Mock category creation, verify Drizzle row match
  
  - [ ]* 2.7 Write property test for category update sync
    - **Property 9: Category Update Sync Correctness**
    - **Validates: Requirements 3.4**
    - Mock category update, verify Drizzle update
  
  - [x]* 2.8 Write property test for timestamp preservation
    - **Property 10: CreatedAt Preservation**
    - **Validates: Requirements 3.7**
    - Verify createdAt in Drizzle equals createdAt from Payload (within 1 second)
  
  - [ ]* 2.9 Write property test for updatedAt correctness
    - **Property 11: UpdatedAt Correctness**
    - **Validates: Requirements 3.8**
    - Verify updatedAt in Drizzle set to current time (within 2 seconds of sync)

- [x] 3. Register collections in Payload config and add dependencies
  - [x] 3.0 Generate, review, and apply the Payload schema migration (BLOCKER — run before 3.1 and before any seed)
    - Context: `apps/cms` runs its postgres adapter with `push: false` and has exactly ONE existing migration (`apps/cms/src/migrations/20260614_185535_initial.*`). The repurposed collections change the `cms` schema and CANNOT apply without a generated migration
    - Generate: `bun payload migrate:create repurpose_service_collection` from `apps/cms/` — never hand-write, never `push`
    - REVIEW the emitted SQL before applying. Confirm it covers, on `cms.service`: `id` changed from Payload's default integer/serial to `text` (DESTRUCTIVE type change); DROP of `image` (a media FK relation), `type`, `category`, `bookingRef`, `active`, `featured`, `order`; ADD of `categoryId` (relationship FK), `slug`, `durationMinutes` (enum), `bufferMinutes`, `pricePaise`, `isActive`, `imageUrl`, `displayOrder`, `gemsRedeemable`, `gemsRequired`, `gemsCatalogueOrder`; and CREATE of the new `cms.service_category` table with its own `text` `id`
    - BEFORE applying, run `SELECT count(*) FROM cms.service` on the target branch. The collection is believed dead/empty, but the `id` type change is destructive so this must be VERIFIED, not assumed. If rows exist, export them and record an explicit discard-or-recreate decision before proceeding
    - Apply on `dev` first: `bun payload migrate`. Then proceed per branch in `dev` → `test` → `pprd` → `prod` order per `.kiro/steering/migration-discipline.md`
    - Forward-only: commit the migration alongside the collection change and never edit, reorder, or delete it afterwards — corrections are new forward migrations
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7_

  - [x] 3.1 Update `apps/cms/src/payload.config.ts`
    - `Service` collection is already imported/registered (existing file, repurposed in-place) — verify the field changes from Task 1.1 don't require a config change beyond what's already there
    - Import and add the new `ServiceCategory` collection to the `collections` array
    - Do NOT change Payload's own `db` block (schemaName `cms`, connection string) — that is unrelated to the new sync client
    - Registering the collection is NOT sufficient on its own: `push: false` means the schema only lands via the Task 3.0 migration, which must be generated and applied for this config to work
    - _Requirements: 1.1, 1.3, 2.1, 2.3, 19.1_
  
  - [x] 3.2 Add dependencies: `slugify`, `nanoid`, `@rgss/db`, `@rgss/types`, `drizzle-orm`
    - Run `bun add slugify nanoid` in `apps/cms/`
    - Pin exact versions per workspace convention (e.g. `slugify@1.6.6`, not `^1.6.6`)
    - Add the workspace deps the collections/hooks actually import: `@rgss/db` (`workspace:*`, for the `service`/`serviceCategory` table defs re-exported by `sync-db.ts`) and `@rgss/types` (`workspace:*`, for `SERVICE_DURATION_MINUTES` from Task 1.1b)
    - Add `drizzle-orm` — the sync hooks import `eq` from it and `sync-db.ts` imports the `NodePgDatabase` type; `@rgss/db` does NOT re-export drizzle operators, so the direct dependency is required (without it typecheck fails with `TS2307: Cannot find module 'drizzle-orm'`)
    - `drizzle-orm` MUST dedupe to the SAME version `packages/db` resolves (0.45.2 — declared `^0.45.2` there, pinned `0.45.2` in `apps/web`/`apps/admin`, and pinned `0.45.2` by `@payloadcms/db-postgres`). A second physical copy would break Drizzle table identity at RUNTIME while still typechecking, destroying the single-drizzle-instance property the Task 2.0a spike relied on. After `bun install`, verify `apps/cms`, `packages/db` and `@payloadcms/db-postgres` all resolve one store entry
    - Add `pg` + `@types/pg` ONLY if the Task 2.0a spike failed and the outbox fallback (Task 2.0-fallback) is in use — the primary atomic path uses Payload's own connection and needs no extra driver
    - Verify versions in `apps/cms/package.json`
    - _Requirements: 1.7, 2.7_
  
  - [ ]* 3.3 Write unit tests for sync hooks
    - Create `apps/cms/src/hooks/__tests__/sync-service.test.ts` (Vitest)
    - Mock `txDb`/the transaction handle from `../lib/sync-db`
    - Test: insert called on create with correct data
    - Test: update called on update with correct where clause
    - Test: createdAt preserved, updatedAt set to new Date()
    - Test: durationMinutes string → number coercion produces correct integer for every member of `SERVICE_DURATION_MINUTES`
    - Test: error logged and re-thrown on sync failure (so Payload rolls back)
    - Test: create path uses `onConflictDoUpdate` (idempotent) — calling it twice with the same doc does not throw and does not duplicate
    - Test: `SERVICE_SYNC_ENABLED=false` short-circuits — no DB call is made and the hook resolves without throwing
    - _Requirements: 3.7, 3.8, 3.11, 3.12, 5.7, 12.1, 12.7_

  - [ ]* 3.4 Write integration test for atomic sync (rollback safety)
    - Create `apps/cms/src/hooks/__tests__/sync-atomicity.test.ts` (or a script against the `dev` DB branch)
    - Execute 20+ sequential create/update operations end-to-end through Payload; assert each produces a matching `public.*` row
    - Forced-rollback case: make the sync throw mid-hook; assert BOTH `cms.*` and `public.*` are unchanged (no divergence)
    - _Requirements: 4.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create migration seed script
  - [x] 5.0 Verification spike (GATE — run before 5.1): does `payload.create()` honor explicit `id`, `createdAt`, and `updatedAt`?
    - Same spirit as the already-passed 2.0a spike. On the `dev` Neon branch, call `payload.create({ collection: 'service_category', data: { id, createdAt, updatedAt, ... } })` with known values and read the stored row back
    - Assert all three: the `id` is the supplied nanoid (not a Payload-generated one), and `createdAt`/`updatedAt` equal the supplied ISO timestamps. Payload manages its own timestamps and may silently ignore overrides, so this cannot be assumed
    - Record the outcome in this task's notes, since both Task 5.1 and Property 10 (CreatedAt Preservation) depend on it
    - IF `id` is honored but timestamps are not → EITHER insert the seed rows directly into the `cms.*` tables via SQL (bypassing Payload's create pipeline) OR accept fresh CMS timestamps and relax Property 10 to apply only to post-seed live edits. Pick one and note it before writing 5.1
    - IF `id` is not honored → escalate: the direct-SQL seed becomes mandatory, because a Payload-generated id would break the ID-space alignment the custom `id` override (Task 1.1a) exists to guarantee
    - _Requirements: 11.4, 3.7_
    - _Note (5.0 PASSED, run on `dev`): `payload.create()` honoured ALL THREE — `id`, `createdAt`, AND `updatedAt`. Verified by direct SQL against `cms.*`: `created_at = 2020-01-02 03:04:05+00`, `updated_at = 2021-02-03 04:05:06+00`, `id` = the supplied `zzspike_*` string, for BOTH `service_category` and `service`. No fallback needed: Task 5.1 works as designed (Payload Local API seed) and Property 10 stands as written._
    - _Note (end-to-end sync PROVEN in the same run): hooks fired for real. `public.service.duration_minutes = 60` as `integer` (`pg_typeof` = integer) from the Payload select string `'60'` — mapper `Number()` coercion confirmed. `public.service.category_id` = the category id, normalised from Payload's populated relationship object (`cms.service` stores it as `category_id_id`). `price_paise`, `is_active`, `slug`, `buffer_minutes`, `display_order` all correct. Update through Payload propagated (`name`, `price_paise`); `created_at` unchanged, `updated_at` moved. `cms.*` and `public.*` ids IDENTICAL. Flag gate: with `SERVICE_SYNC_ENABLED=false` the create succeeded in `cms.service` with NO `public.service` row and no throw. Idempotency: repeated updates → exactly one row, no duplicate-key error._
    - _Caveat 1 (create path sets a FRESH `public.*.updated_at`): the mapper deliberately omits `updatedAt`, so on create the `public` row takes the column default `now()` while `cms` keeps the supplied `updatedAt`. `created_at` IS preserved. Harmless for the seed (it runs with the flag off and never rewrites `public.*`), but it means `cms.updated_at` and `public.updated_at` differ after any CMS-originated create._
    - _Caveat 2 (`onConflictDoUpdate` is unreachable via `payload.create` for an id already in `cms.*`): re-creating an existing id fails EARLIER, in Payload's own validation (`The following field is invalid: id`), before the afterChange hook runs. The upsert still matters for the seed, where the id exists in `public.service` but NOT yet in `cms.service` — that is the collision it was written for. It is not a second line of defence against re-running the seed twice._

  - [x] 5.1 Create `apps/cms/scripts/seed-services.ts`
    - Run the seed with `SERVICE_SYNC_ENABLED=false` (e.g. `SERVICE_SYNC_ENABLED=false bun run apps/cms/scripts/seed-services.ts`) — the script reads rows FROM `public.service` and then calls `payload.create()`, which would fire `afterChange` and re-write `public.service` with the SAME id, causing a duplicate-key / unique-slug failure. The flag short-circuits the hook
    - The `onConflictDoUpdate` upsert from Tasks 2.1/2.2 makes this safe even if the flag is forgotten, but the flag is the intended procedure — do not rely on the upsert alone
    - Requires the Task 3.0 Payload migration to be applied first, and the Task 5.0 spike outcome to be known
    - Import Drizzle db from `@rgss/db` and schema tables
    - Import Payload via `getPayload({ config })`
    - Query all rows from Drizzle `public.service_category`
    - For each category, create Payload document via `payload.create({ collection: 'service_category', data: { ... } })`
    - Map all fields including createdAt/updatedAt as ISO strings
    - Query all rows from Drizzle `public.service`
    - For each service, create Payload document in `service` collection
    - Add console.log with seeded counts
    - _Requirements: 11.4_
  
  - [ ]* 5.2 Write integration test for seed script
    - Verify categories seeded before services
    - Verify all Drizzle rows have matching Payload documents
    - Verify timestamps preserved
    - _Requirements: 11.4_

- [x] 6. Remove admin portal write APIs
  - [x] 6.1 Update `apps/admin/src/app/api/services/route.ts`
    - Keep GET endpoint unchanged (booking engine dependency)
    - Replace POST handler with HTTP 410 Gone response: `{ success: false, error: { message: 'Service management moved to CMS' } }`
    - _Requirements: 8.3, 8.7_
  
  - [x] 6.2 Update `apps/admin/src/app/api/services/[id]/route.ts`
    - Keep GET endpoint if exists
    - Replace PATCH handler with HTTP 410 Gone response
    - _Requirements: 8.4, 8.7_
  
  - [x] 6.3 Update `apps/admin/src/app/api/service-categories/route.ts`
    - Keep GET endpoint unchanged
    - Replace POST handler with HTTP 410 Gone
    - _Requirements: 8.5, 8.7_
  
  - [x] 6.4 Update `apps/admin/src/app/api/service-categories/[id]/route.ts`
    - Keep GET if exists
    - Replace PATCH with HTTP 410 Gone
    - _Requirements: 8.6, 8.7_
  
  - [ ]* 6.5 Write integration test for API removal
    - Test POST to removed endpoints returns 410
    - Test GET endpoints still functional
    - Verify error message matches requirement
    - _Requirements: 8.7_

  - [x] 6.6 Rewrite `apps/admin/src/app/api/services/services-mgmt.test.ts` (NON-optional — a red build blocks everything)
    - The existing file imports `svcRoute.POST`, `svcIdRoute.PATCH`, and `catRoute.POST` and asserts 201/400/403/404 plus the SPA 30/60 slot-length rule. Tasks 6.1-6.4 replace those handlers with 410, so this suite fails to compile/pass and CI runs tests (`.github/workflows/ci.yml`)
    - DELETE the create/update test cases and the SPA-30/60 duration-rule cases (that rule is superseded by `SERVICE_DURATION_MINUTES`)
    - KEEP and adapt the `GET /api/services/all` test and the categories GET test — those endpoints are preserved
    - ADD assertions that `POST /api/services`, `PATCH /api/services/[id]`, `POST /api/service-categories`, and `PATCH /api/service-categories/[id]` now return HTTP 410 with the message "Service management moved to CMS"
    - Run the admin test suite to confirm green before moving on
    - _Requirements: 8.7_

- [x] 7. Remove admin portal UI for service management
  - [x] 7.1 Delete `apps/admin/src/app/services/page.tsx`
    - Remove file completely (service management UI)
    - _Requirements: 7.1_
  
  - [x] 7.2 Delete `apps/admin/src/app/services/services-manager.tsx`
    - Remove file completely (service manager component)
    - _Requirements: 7.2_
  
  - [x] 7.3 Create redirect from old admin service route
    - Create `apps/admin/src/app/services/page.tsx` with redirect to `https://cms.theroyalglow.in/admin/collections/service`
    - Use Next.js `redirect()` from `next/navigation`
    - _Requirements: 7.4_
  
  - [x] 7.4 Remove the "Services" navigation entry (three distinct places — do not stop at the icon map)
    - Locate the actual nav item list: it is in `apps/admin/src/lib/rbac.ts`, as `{ label: 'Services', href: '/services', minLevel: 3 }` inside the "Catalog" nav section. Remove that entry. (Search `apps/admin/src` for the nav config that renders sidebar entries if the file has moved.)
    - ALSO remove the `'/services': Sparkles` entry from `apps/admin/src/lib/admin/nav-icons.ts` — that file is an ICON MAP, not the nav item list, so editing it alone does nothing to the sidebar
    - ALSO check the admin middleware RBAC route table in `apps/admin/src/lib/rbac.ts` (`['/services', 3]`) — `features.md` documents `/services` as Manager+. Decide deliberately and keep it consistent with the Task 7.3 redirect: the `/services` path still exists as a redirect to the CMS, so either keep the Manager+ gate (recommended, so the redirect isn't reachable by lower roles) or remove it — do not leave the two contradicting each other
    - `apps/admin/src/lib/middleware-access-matrix.test.ts` asserts `/services` is Manager-gated (`isAllowed('/services', 'receptionist') === false`, `manager === true`). Update it in the same change to match whatever is decided above, or the build goes red
    - _Requirements: 7.3, 7.4_

  - [x] 7.5 Delete the dead `getServices()` from `apps/web/src/lib/cms/client.ts`
    - `getServices()` queries `/api/service?where[active][equals]=true&depth=1&sort=order` plus `where[type][equals]=...`. The fields `active`, `order`, and `type` are ALL removed by the repurposing (Task 1.1), so this becomes broken code
    - It has NO callers (verified dead code), so deleting the function is safe and no replacement is needed
    - IMPORTANT: KEEP the `Service` TYPE from `@/lib/cms/types` — it is still used by `apps/web/src/lib/catalogue.ts`. Delete ONLY the `getServices()` function
    - Remove any imports left unused by the deletion, then typecheck `apps/web` to confirm nothing else referenced it
    - _Requirements: 18.4_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Write integration tests for end-to-end sync
  - [ ]* 9.1 Create `apps/cms/tests/service-sync.spec.ts` (Playwright)
    - Test: Login to Payload as admin, create service, query `public.service` via API, assert row exists
    - Test: Update service name in Payload, query Drizzle, assert name updated
    - Test: Create service category, verify Drizzle row created
    - Test: Mock Drizzle connection failure, attempt create, assert 500 error in UI
    - _Requirements: 3.1, 3.2, 3.3, 3.9, 12.2_

- [x] 10. Migration deployment steps
  - [x] 10.1 Create pre-deployment backup task
    - Document: Backup `public.service` and `public.service_category` tables before migration
    - Command: `pg_dump` to R2 or local file
    - _Requirements: 11.3, 15.4_
  
  - [x] 10.2 Create deployment checklist document
    - Step 1: Verify `SELECT count(*) FROM cms.service` on the target branch before the destructive `id` type change
    - Step 2: Apply the Payload migration (`bun payload migrate`, generated + reviewed in Task 3.0), per branch `dev` → `test` → `pprd` → `prod`
    - Step 3: Deploy CMS with `SERVICE_SYNC_ENABLED=false` (flag, not commented-out hooks)
    - Step 4: Run seed script `SERVICE_SYNC_ENABLED=false bun run apps/cms/scripts/seed-services.ts`
    - Step 5: Verify all services/categories in Payload admin
    - Step 6: Restore `SERVICE_SYNC_ENABLED` to enabled and restart the CMS
    - Step 7: Test create + update on staging (cover all 8 duration values)
    - Step 8: Deploy admin portal (API removals + redirects + nav/test updates from Tasks 6.6, 7.4, 7.5)
    - Step 9: Verify booking engine functional (place test booking)
    - Step 10: Monitor logs for sync errors (first 1 hour)
    - _Requirements: 11.1, 11.2, 11.5, 11.6, 11.7, 13.1, 13.2, 19.4, 19.5, 19.7_
  
  - [x] 10.3 Document rollback procedure
    - Step 1: Set `SERVICE_SYNC_ENABLED=false` on the CMS service and restart — no code edit, no rebuild, fits the 15-minute window
    - Step 2: Restore admin write APIs from git (`git revert <commit>`)
    - Step 3: Restore admin UI if needed
    - Do NOT revert the Payload migration — migrations are forward-only; `cms.*` in its new shape is harmless once the flag is off
    - Note explicitly that commenting out hook registrations is the LAST resort, not the first: it needs a code edit, review, rebuild, and redeploy
    - Rollback triggers: booking engine broken, sync failure >10%, data inconsistency
    - _Requirements: 15.1, 15.2, 15.3, 15.5, 15.6, 15.7_

- [x] 11. Final checkpoint - Verify booking engine unchanged
  - [x] 11.1 Test booking engine read operations
    - Verify GET /api/services returns identical response format
    - Verify availability calculation uses Drizzle duration_minutes/buffer_minutes
    - Verify pricing display uses Drizzle price_paise
    - Verify service filtering uses Drizzle is_active
    - Verify category grouping uses Drizzle category_id
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 6.4_
  
  - [x] 11.2 Verify Payload as authoritative source
    - Confirm only Payload can create/update services
    - Confirm booking engine reads from Drizzle unchanged
    - Confirm admin portal has no write access
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6_

- [x] 12. Update project documentation
  - [x] 12.1 Update service management documentation
    - Document: Services now managed at `cms.theroyalglow.in/admin/collections/service`
    - Document: Sync mechanism and failure modes
    - Remove references to admin portal service CRUD
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 13. Drift reconciliation safety net
  - [x] 13.1 Create the reconciliation job (QStash scheduled, daily)
    - Add a QStash scheduled HTTP job comparing `cms.service` ↔ `public.service` and `cms.service_category` ↔ `public.service_category`
    - Compare row counts + per-row `id` + `updatedAt` to detect missing/extra/stale rows
    - On any divergence: emit error-level structured log + trigger BetterStack alert (match the existing 14-job alerting pattern)
    - Read-only by default (detect + alert, no auto-repair); if the outbox fallback is in use, MAY re-drive failed sync jobs
    - Register the heartbeat with BetterStack like the other jobs
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_
  
  - [ ]* 13.2 Write a test for the reconciliation comparison logic
    - Seed a deliberate mismatch (extra/stale row), assert the job flags it
    - Assert a matching state reports no divergence
    - _Requirements: 17.2, 17.3_

- [ ] 14. Verify cache freshness end-to-end
  - [~] 14.1 Confirm edits propagate to the customer site within seconds
    - After an edit in Payload, verify `WEB_APP_URL/api/revalidate` is pinged (composed revalidate hook fires) and `/services`, `/services/[slug]`, and the booking dialog reflect the change
    - Confirm all customer read surfaces (`getCatalogueServices`, `GET /api/services`, `getServiceBySlug`) read from Drizzle `public.*` — one consistent read source
    - If a Cloudflare KV layer exists in front of `/api/services`, document its TTL (≤5 min) as an accepted tradeoff; on-demand revalidation remains primary
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

## Notes

- Tasks marked with `*` are optional property-based and integration tests (can be skipped for faster MVP, EXCEPT 3.4 which is strongly recommended — it validates rollback atomicity, the correctness crux)
- **Task 2.0a is a hard GATE:** the atomic same-transaction sync is unproven on Payload 3.85 until the spike confirms it. Do NOT skip it. If it fails, use the outbox fallback (2.0-fallback) + the drift job (13.1) as the safety net.
- All implementation tasks reference specific requirements for traceability
- Checkpoints ensure incremental validation before proceeding
- Property tests validate universal correctness properties from design
- Unit tests validate specific examples and error cases
- Seed script must run BEFORE enabling hooks on production
- Admin portal APIs return 410 Gone (not 404) to indicate permanent removal
- Booking engine has ZERO changes - reads from Drizzle unchanged
- **Revised (post-review):** Task 1.1 REPURPOSES the existing `apps/cms/src/collections/Service.ts` (dead code, verified unused) instead of creating a new collection — no slug collision. Task 1.2 creates a genuinely new `ServiceCategory.ts`.
- **Revised (post-audit, "Option A+"):** Duration is a fixed 8-option select (15/30/45/60/90/120/150/180 min) for ALL services, not the old SPA-30/60 vs Salon-5-min-step split and not the earlier 15/30/60/90 draft. `isValidDurationForType()` is not ported to Payload and becomes unreferenced once Tasks 6-7 remove its only callers (left in `packages/types` as-is; not deleted in this migration).
- **Revised (post-verification):** Sync hooks write `public.*` on **Payload's own request-scoped transaction handle**, resolved by the async `txDb(req)` as `adapter.sessions[await req.transactionID].db ?? adapter.drizzle` — NOT `req.payload.db.drizzle` (the 2.0a spike proved that is the base pool and commits independently), NOT a separate `pg.Pool`, and NOT `@rgss/db`'s edge `neon-http` client. This makes the `cms.*` and `public.*` writes atomic (commit/roll back together), eliminating the divergence risk a separate pool would create. The separate-pool approach appears only in the outbox fallback (2.0-fallback), used solely if the Task 2.0a spike fails.
- **Delete disabled (Decision 4):** both collections set `delete: () => false`; services/categories are retired via the `isActive` toggle. This matches the never-hard-delete DB convention and sidesteps the `ON DELETE RESTRICT` FK on `booking_service`.
- **Cache freshness (Decision 2):** the sync hook is composed WITH the existing `revalidateHooks('service')` — never replacing it — so edits refresh the customer site within seconds via `revalidatePath('/','layout')`.
- **Drift safety net (Decision 3):** a daily QStash reconciliation job (Task 13.1) compares `cms.*` ↔ `public.*` and alerts on divergence via BetterStack.
- **Revised (post-review):** Payload's own auth (`users` collection, `auth: true`) gates all CMS access — there is no Better Auth integration in Payload, and none is added by this feature.
- Custom `id` field override (Tasks 1.1a, 1.2) is REQUIRED, not optional — without it, Payload's Postgres adapter defaults to auto-increment integer IDs incompatible with Drizzle's `text`/nanoid FK columns.
- **Requirement numbering (post-review):** Requirements.md runs 1-19 contiguously. An earlier revision inserted a new Requirement 4 "Dedicated Sync Database Connection", shifting the old 4-15 to 5-16; Requirements 17-18 and now 19 were APPENDED. All `_Requirements:` references in this file use the current numbering.

### Notes from the pre-execution risk audit (7 fixes applied)

- **Duration "Option A+" (BLOCKER fixed):** the allowed set is 15/30/45/60/90/120/150/180, derived from an audit of the real 57-service catalogue (`packages/db/scripts/data/services-salon.ts` + `services-spa.ts`), which has 8 services at 45min, 3 at 120min, and 1 at 180min. The earlier 15/30/60/90 set would have failed seed validation on 12 services and double-booked a stylist on the 180-minute keratin. `150` is headroom. The set lives in ONE place — `SERVICE_DURATION_MINUTES` in `packages/types/src/service.ts` — and Payload's `select` options are DERIVED from it (Task 1.1b). Drizzle `duration_minutes` stays a plain `integer`: no Drizzle migration, no booking-engine change. Because Payload backs a `select` with a `cms`-schema enum, adding a value later costs a constant edit + one `payload migrate:create`/`migrate` — cheap and documented, not a surprise.
- **Payload migration is now a task (BLOCKER fixed):** `apps/cms` runs `push: false` with exactly one existing migration (`20260614_185535_initial.*`), so the repurposed collections cannot apply without a generated migration. **Task 3.0** (new, runs before 3.1) generates it, reviews the SQL, verifies `SELECT count(*) FROM cms.service` before the DESTRUCTIVE `id` integer→`text` change, and applies on `dev` first. Forward-only, per `.kiro/steering/migration-discipline.md`. See also Requirement 19.
- **Seeding deadlock + real feature flag (BLOCKER fixed):** the seed reads FROM `public.service` and then calls `payload.create()`, which fires `afterChange` and re-writes the same `id` — a duplicate-key failure. Two complementary fixes: (1) the create path now UPSERTS via `.onConflictDoUpdate({ target: <table>.id, set: {...} })` (Tasks 2.1, 2.2), making re-seeds, retries, and pre-existing rows safe; (2) a real env flag `SERVICE_SYNC_ENABLED` (default enabled, `isSyncEnabled()` in `sync-db.ts`, documented in `apps/cms/.env.example`) short-circuits the hooks. The flag also resolves the Req 15.3 inconsistency — rollback is now "set `SERVICE_SYNC_ENABLED=false`", not "comment out the hooks".
- **Admin test rewrite (Task 6.6, non-optional):** `apps/admin/src/app/api/services/services-mgmt.test.ts` imports the POST/PATCH handlers that become 410, so it breaks the build and CI runs tests. Rewriting it is not optional.
- **Dead web CMS client (Task 7.5):** `getServices()` in `apps/web/src/lib/cms/client.ts` queries the removed `active`/`order`/`type` fields and has no callers. Delete the function only — the `Service` TYPE is still used by `apps/web/src/lib/catalogue.ts` and must be kept.
- **Seed-assumption spike (Task 5.0):** whether `payload.create()` honors explicit `id`/`createdAt`/`updatedAt` was assumed, not verified. Task 5.0 verifies it on `dev` before 5.1 is written; the fallback is a direct-SQL `cms.*` seed or relaxing Property 10 to post-seed edits only.
- **Nav removal is three places (Task 7.4):** the nav item list is in `apps/admin/src/lib/rbac.ts`; `apps/admin/src/lib/admin/nav-icons.ts` is only an icon map; and the RBAC route table entry `['/services', 3]` plus `middleware-access-matrix.test.ts` must be reconciled with the Task 7.3 redirect.
- **New requirements were APPENDED, not inserted:** Requirement 19 was added at 19; new ACs were appended to Requirements 1 (13, 14), 3 (11, 12, 13), and 15 (6, 7); new Correctness Properties were appended as 12 and 13. Existing Requirements 1-18, existing AC numbers, and Properties 1-11 are unchanged, so there is ZERO cross-reference churn in this file.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.0a"] },
    { "id": 1, "tasks": ["1.1", "1.1a", "1.1b", "1.2", "2.0"] },
    { "id": 2, "tasks": ["1.3", "1.3a", "1.3b", "1.4", "1.5", "2.1", "2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "3.0", "3.2"] },
    { "id": 4, "tasks": ["3.1", "3.3", "3.4", "5.0"] },
    { "id": 5, "tasks": ["5.1", "6.1", "6.2", "6.3", "6.4", "7.1", "7.2"] },
    { "id": 6, "tasks": ["5.2", "6.5", "6.6", "7.3", "7.4", "7.5"] },
    { "id": 7, "tasks": ["9.1", "10.1", "10.2", "10.3", "13.1", "13.2"] },
    { "id": 8, "tasks": ["11.1", "11.2", "12.1", "14.1"] }
  ]
}
```

**Added by the risk audit:** `3.0` (Payload migration) is a hard prerequisite for `3.1` and for anything that writes the new `cms` shape — nothing can apply while `push: false` and no migration exists. `5.0` (payload.create id/timestamp spike) gates `5.1`. `6.6` (admin test rewrite) is non-optional because a red build blocks every later wave. `7.5` (delete dead `getServices()`) rides along with the other admin/web cleanup in wave 6.

**Critical path note:** `2.0a` (transaction-model verification spike) is now the **first task in Wave 0, blocking everything** — the entire atomic-sync design depends on its outcome, and a failed spike switches the plan to the outbox fallback (`2.0-fallback`). `1.1a`/`1.1b` are sub-tasks of `1.1` and must land in the same commit as the collection field definition, not as follow-ups — a collection registered without the custom `id` override would let Payload create default-shaped IDs before the fix lands, requiring a data migration to correct. The drift job (`13.1`) and cache verification (`14.1`) are late-wave because they validate the system end-to-end after the write path and admin cleanup are in place.
