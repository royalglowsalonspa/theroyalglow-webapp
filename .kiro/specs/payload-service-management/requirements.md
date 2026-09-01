# Requirements Document

## Introduction

This feature migrates service management from the admin portal to Payload CMS. All service and service category CRUD operations will be performed through Payload's admin interface at `cms.theroyalglow.in`. The booking engine continues reading from the Drizzle `public.service` table with no changes to booking flows. A Payload `afterChange` hook syncs CMS writes to Drizzle in real-time, establishing Payload as the authoritative source.

**Collection strategy (revised):** Payload already has a `service` collection (slug `service`) created for exactly this purpose but never wired up — it is currently dead code (no route in `apps/web` calls it). This feature **repurposes that existing collection** rather than creating a new one, eliminating any slug collision. The unrelated `service-card` collection (homepage marketing cards on `theroyalglow.in`) is untouched — it serves a different purpose (display-only pricing teasers) and has no field overlap with the booking catalogue.

**Duration model (revised — "Option A+", data-driven):** Services no longer use the old SPA-30/60-only vs. Salon-5-minute-step split. All services (Salon and SPA) use a single fixed duration set: **15, 30, 45, 60, 90, 120, 150, 180 minutes**, selected via a dropdown in Payload. This set was derived from an audit of the real catalogue (`packages/db/scripts/data/services-salon.ts` + `services-spa.ts`, 57 services): 8 services are 45 min (haircut-advanced, root-touchup, facial-classic, wax-full-legs, manicure-spa, pedicure-spa, hair-spa-basic, scalp-treatment), 3 are 120 min (colour-global-long, highlights, makeup-bridal), and 1 is 180 min (keratin). An earlier 15/30/60/90-only set would have failed seed validation on all 12 and would have double-booked stylists by squeezing a 180-minute keratin into 90 minutes. `150` is included as headroom; every other value is in live use. The allowed values live in ONE place — the shared constant `SERVICE_DURATION_MINUTES` exported from `packages/types/src/service.ts` — and Payload's `select` options are derived from it. This removes the need to replicate the `isValidDurationForType()` business rule in Payload — a fixed-option field enforces validity by construction. The 30-minute booking slot grid (`SLOT_OPEN_MINUTES`–`SLOT_CLOSE_MINUTES`, `SLOT_DURATION_MINUTES = 30`) only constrains slot *start* alignment, not service duration, so all eight values are compatible with zero booking-engine changes and no Drizzle migration (`public.service.duration_minutes` stays a plain `integer`).

## Glossary

- **Payload_CMS**: The content management system at `cms.theroyalglow.in` running Payload v3
- **Admin_Portal**: The administrative application at `apps/admin/` served from `admin.theroyalglow.in`
- **Booking_Engine**: The customer-facing booking system that reads services from Drizzle
- **Drizzle_Service_Table**: The PostgreSQL `public.service` table used by the booking engine
- **Payload_Service_Collection**: The **repurposed, pre-existing** Payload CMS collection `cms.service` storing service data (slug `service`, previously dead/unwired)
- **Payload_Category_Collection**: A **new** Payload CMS collection `cms.service_category` storing category data (no existing collection to collide with)
- **Payload_ServiceCard_Collection**: The **unrelated, unchanged** Payload CMS collection `cms.service-card` — homepage marketing cards, out of scope for this feature
- **AfterChange_Hook**: Payload lifecycle hook that fires after a document is created or updated
- **Sync_Operation**: Real-time write from Payload CMS to Drizzle via a dedicated Node-native Postgres connection (see Requirement 4)
- **Admin_Service_UI**: The existing service management interface at `apps/admin/src/app/services/`
- **Admin_Service_API**: The existing service API routes at `apps/admin/src/app/api/services/`
- **Fixed_Duration_Set**: The eight allowed service duration values: `15`, `30`, `45`, `60`, `90`, `120`, `150`, `180` minutes, enforced via Payload `select` field options derived from the Service_Duration_Constant. Chosen to cover the entire real 57-service catalogue (which uses 45, 120 and 180 minutes) with `150` as headroom
- **Service_Duration_Constant**: `SERVICE_DURATION_MINUTES`, the single source of truth for the Fixed_Duration_Set — exported from `packages/types/src/service.ts` as `[15, 30, 45, 60, 90, 120, 150, 180] as const`. Supersedes `SPA_DURATIONS` and `isValidDurationForType()` for the CMS write path
- **Service_Sync_Flag**: `SERVICE_SYNC_ENABLED`, the environment feature flag (default enabled) that short-circuits the Payload→Drizzle sync hooks; set to `false` during seeding and as the primary rollback lever

## Requirements

### Requirement 1: Payload CMS Service Collection

**User Story:** As a content manager, I want to manage services through Payload CMS, so that I can use a familiar CMS interface for all content operations.

#### Acceptance Criteria

1. THE Payload_CMS SHALL define a `service` collection with fields matching Drizzle `public.service` schema
2. THE Payload_Service_Collection SHALL include fields: `id`, `categoryId`, `name`, `slug`, `description`, `durationMinutes`, `bufferMinutes`, `pricePaise`, `isActive`, `imageUrl`, `displayOrder`, `gemsRedeemable`, `gemsRequired`, `gemsCatalogueOrder`
3. THE Payload_Service_Collection SHALL store data in the `cms.service` PostgreSQL table under the `cms` schema
4. THE Payload_Service_Collection SHALL use `name` as the admin panel title field
5. THE Payload_Service_Collection SHALL enforce required fields: `name`, `categoryId`, `durationMinutes`, `pricePaise`
6. THE Payload_Service_Collection SHALL provide a relationship field to `service_category` collection via `categoryId`
7. THE Payload_Service_Collection SHALL auto-generate `slug` from `name` on document creation
8. THE Payload_Service_Collection SHALL define `id` as a custom `text` field populated via nanoid on creation, NOT the Payload/Postgres-adapter default auto-increment integer, to preserve compatibility with Drizzle foreign keys in `booking_service.service_id`, `staff_service.service_id`, `offer_service.service_id`, and `waitlist.service_id`
9. THE Payload_Service_Collection SHALL define `durationMinutes` as a `select` field restricted to the Fixed_Duration_Set (`15`, `30`, `45`, `60`, `90`, `120`, `150`, `180`), replacing the prior SPA/Salon-conditional duration rule (`isValidDurationForType()`) which SHALL NOT be ported to Payload
10. THE Payload_Service_Collection SHALL validate `pricePaise` as non-negative integer
11. WHEN `gemsRedeemable` is true, THE Payload_Service_Collection SHALL require `gemsRequired` to be a positive integer
12. THE Payload_Service_Collection SHALL repurpose the existing `apps/cms/src/collections/Service.ts` collection (slug `service`, currently unwired/dead code) rather than creating a new collection, avoiding any slug collision
13. THE Fixed_Duration_Set SHALL be defined exactly once, as the Service_Duration_Constant `SERVICE_DURATION_MINUTES` exported from `packages/types/src/service.ts` (`[15, 30, 45, 60, 90, 120, 150, 180] as const`), AND the Payload `select` options in AC 9 SHALL be DERIVED from that constant rather than hard-coded — so the allowed set can never drift between the CMS UI, validation, and seed data
14. THE Service_Duration_Constant SHALL supersede `SPA_DURATIONS` and `isValidDurationForType()` for the CMS write path, and Drizzle `public.service.duration_minutes` SHALL remain a plain `integer` column with NO new Drizzle migration and NO booking-engine change

### Requirement 2: Payload CMS Service Category Collection

**User Story:** As a content manager, I want to manage service categories through Payload CMS, so that I can organize services hierarchically.

#### Acceptance Criteria

1. THE Payload_CMS SHALL define a `service_category` collection with fields matching Drizzle `public.service_category` schema
2. THE Payload_Category_Collection SHALL include fields: `id`, `name`, `slug`, `description`, `serviceType`, `displayOrder`, `isActive`
3. THE Payload_Category_Collection SHALL store data in the `cms.service_category` PostgreSQL table under the `cms` schema
4. THE Payload_Category_Collection SHALL use `name` as the admin panel title field
5. THE Payload_Category_Collection SHALL enforce required fields: `name`, `serviceType`
6. THE Payload_Category_Collection SHALL provide a select field for `serviceType` with options: `salon`, `spa`
7. THE Payload_Category_Collection SHALL auto-generate `slug` from `name` on document creation
8. THE Payload_Category_Collection SHALL validate `displayOrder` as integer with default value `0`
9. THE Payload_Category_Collection SHALL default `isActive` to `true`
10. THE Payload_Category_Collection SHALL define `id` as a custom `text` field populated via nanoid on creation, NOT the Payload/Postgres-adapter default auto-increment integer, to preserve compatibility with Drizzle foreign keys in `service.category_id`

### Requirement 3: Real-Time Sync to Drizzle

**User Story:** As a system, I want Payload CMS changes to sync immediately to Drizzle, so that the booking engine always reads current service data.

#### Acceptance Criteria

1. WHEN a service document is created in Payload_CMS, THE Sync_Operation SHALL insert a matching row into Drizzle `public.service` table
2. WHEN a service document is updated in Payload_CMS, THE Sync_Operation SHALL update the matching row in Drizzle `public.service` by `id`
3. WHEN a service category document is created in Payload_CMS, THE Sync_Operation SHALL insert a matching row into Drizzle `public.service_category` table
4. WHEN a service category document is updated in Payload_CMS, THE Sync_Operation SHALL update the matching row in Drizzle `public.service_category` by `id`
5. THE Sync_Operation SHALL execute its `public`-schema writes on Payload's own request-scoped database transaction (the `req.transactionID`-bound Drizzle handle exposed by the postgres adapter), so the `cms.service` write and the `public.service` write COMMIT OR ROLL BACK ATOMICALLY as one transaction — never leaving one schema updated while the other is stale
6. THE Sync_Operation SHALL map Payload field names to Drizzle column names with exact 1:1 correspondence
7. THE Sync_Operation SHALL preserve `createdAt` timestamps from Payload without modification
8. THE Sync_Operation SHALL update `updatedAt` timestamps to current time on sync
9. IF the Sync_Operation fails, THEN THE Payload_CMS SHALL re-throw so Payload rolls back the entire transaction (both `cms` and `public` writes), log the error, and return a 500 response to the user — guaranteeing the two schemas can never diverge from a failed sync
10. THE Sync_Operation SHALL complete within 200 milliseconds of the Payload save operation under normal conditions; because it runs on Payload's own transaction, a slow/unreachable DB is bounded by the database connection/statement timeout rather than an app-level `Promise.race` (see Requirement 12.7)
11. THE Sync_Operation create path SHALL be IDEMPOTENT: it SHALL write via a Drizzle upsert (`.onConflictDoUpdate({ target: <table>.id, set: { ... } })`) rather than a bare `.insert()`, so a row that already exists in `public.*` with the same `id` is updated instead of raising a primary-key/unique violation. This makes re-seeding, hook retries, and pre-existing rows safe rather than fatal
12. THE Sync_Operation SHALL be gated by the Service_Sync_Flag environment variable `SERVICE_SYNC_ENABLED` (default: enabled). WHEN `SERVICE_SYNC_ENABLED` is `false`, THE AfterChange_Hook SHALL short-circuit and perform no `public`-schema write, allowing the seed migration to run without hooks firing and without a code edit + redeploy
13. THE Service_Sync_Flag SHALL be documented in `apps/cms/.env.example` alongside the other CMS environment variables

### Requirement 4: Atomic Same-Transaction Sync (Connection Strategy)

**User Story:** As a reliability engineer, I want the Payload→Drizzle sync to be transactionally atomic with the CMS write, so that a failure can never leave `cms.service` and `public.service` in disagreement.

#### Acceptance Criteria

1. THE Sync_Operation SHALL write to the `public` schema using Payload's request-scoped, transaction-bound Drizzle connection (same physical Neon database, same transaction as the triggering `cms` write) — NOT a separately-pooled connection that would commit independently and risk divergence on rollback
2. THE Sync_Operation SHALL NOT use `@rgss/db`'s `drizzle-orm/neon-http` client (an edge/Workers HTTP-fetch driver unsuited to Payload's persistent Node process and incompatible with participating in Payload's transaction)
3. THE Sync_Operation SHALL reuse the `service` and `serviceCategory` table definitions exported from `@rgss/db/schema` (schema/structure only), executed against Payload's transaction handle so cross-schema (`cms` → `public`) writes join the same transaction
4. THE apps/cms application SHALL, BEFORE building the full sync (verification spike, Task 2.0a), confirm on the `dev` Neon branch that a cross-schema write to `public.*` on Payload's transaction-bound Drizzle handle commits atomically with the `cms.*` write and rolls back together on a thrown error
5. IF the verification spike in AC 4 fails (Payload's transaction handle cannot be used for cross-schema writes on v3.85), THEN the fallback SHALL be an outbox/async pattern: Payload commits `cms.service` as the source of truth, an `afterChange` hook enqueues a QStash sync job that writes `public.service` with retries, and the drift-reconciliation job (Requirement 17) repairs any transient gap
6. THE sync path (whichever of AC 1 or AC 5 is used) SHALL be covered by an integration test exercising at least 20 sequential create/update operations plus one forced-rollback case asserting no divergence between `cms.service` and `public.service`

### Requirement 5: AfterChange Hook Implementation

**User Story:** As a developer, I want an `afterChange` hook in Payload, so that Drizzle sync happens automatically on every CMS save.

#### Acceptance Criteria

1. THE Payload_Service_Collection SHALL register an `afterChange` hook function
2. THE Payload_Category_Collection SHALL register an `afterChange` hook function
3. WHEN the hook receives operation `create`, THE AfterChange_Hook SHALL execute an INSERT operation to Drizzle
4. WHEN the hook receives operation `update`, THE AfterChange_Hook SHALL execute an UPDATE operation to Drizzle by `id`
5. THE AfterChange_Hook SHALL receive the complete document data after Payload validation
6. THE AfterChange_Hook SHALL access Drizzle connection via `@rgss/db` package import
7. THE AfterChange_Hook SHALL handle sync failures by logging to structured logger and re-throwing
8. THE AfterChange_Hook SHALL NOT execute for operation `delete` (services are deactivated, not deleted)

### Requirement 6: Payload as Authoritative Source

**User Story:** As a system architect, I want Payload CMS to be the single source of truth for service data, so that there is no confusion about which system owns the data.

#### Acceptance Criteria

1. THE Payload_CMS SHALL be the only system permitted to create service records
2. THE Payload_CMS SHALL be the only system permitted to update service records
3. IF a conflict exists between Payload `cms.service` and Drizzle `public.service`, THEN THE Payload_CMS data SHALL be considered authoritative
4. THE Booking_Engine SHALL continue reading from Drizzle `public.service` without modification
5. THE Booking_Engine SHALL NOT write to `public.service` or `public.service_category` tables
6. THE Admin_Portal SHALL NOT create or update services after this migration
7. THE Admin_Portal SHALL retain read-only access to services via existing GET endpoints

### Requirement 7: Admin Portal UI Removal

**User Story:** As a system maintainer, I want the admin service CRUD UI removed, so that users are not confused by duplicate management interfaces.

#### Acceptance Criteria

1. THE Admin_Portal SHALL remove the file `apps/admin/src/app/services/page.tsx`
2. THE Admin_Portal SHALL remove the file `apps/admin/src/app/services/services-manager.tsx`
3. THE Admin_Portal SHALL remove the navigation menu item for "Services" in the admin sidebar
4. THE Admin_Portal SHALL display a redirect message if users access `admin.theroyalglow.in/services` directing them to `cms.theroyalglow.in`
5. THE Admin_Portal SHALL retain service list/detail pages for read-only viewing if required by other features

### Requirement 8: Admin Portal API Preservation

**User Story:** As a booking system, I want existing service APIs to remain functional, so that the booking flow is not disrupted.

#### Acceptance Criteria

1. THE Admin_Service_API route `GET /api/services` SHALL continue returning active services grouped by category
2. THE Admin_Service_API route `GET /api/services/all` SHALL continue returning all services including inactive for read-only admin views
3. THE Admin_Portal SHALL remove POST endpoint `POST /api/services`
4. THE Admin_Portal SHALL remove PATCH endpoint `PATCH /api/services/[id]`
5. THE Admin_Portal SHALL remove POST endpoint `POST /api/service-categories`
6. THE Admin_Portal SHALL remove PATCH endpoint `PATCH /api/service-categories/[id]`
7. IF a client attempts to call removed write endpoints, THEN THE Admin_Portal SHALL return HTTP 410 Gone with message "Service management moved to CMS"

### Requirement 9: Field Mapping Validation

**User Story:** As a data integrity engineer, I want exact field mapping between Payload and Drizzle, so that no data is lost or corrupted during sync.

#### Acceptance Criteria

1. THE Payload_Service_Collection field `id` SHALL map to Drizzle `service.id` (text, nanoid)
2. THE Payload_Service_Collection field `categoryId` SHALL map to Drizzle `service.category_id` (text, foreign key)
3. THE Payload_Service_Collection field `name` SHALL map to Drizzle `service.name` (text, not null)
4. THE Payload_Service_Collection field `slug` SHALL map to Drizzle `service.slug` (text, unique)
5. THE Payload_Service_Collection field `description` SHALL map to Drizzle `service.description` (text, nullable)
6. THE Payload_Service_Collection field `durationMinutes` SHALL map to Drizzle `service.duration_minutes` (integer)
7. THE Payload_Service_Collection field `bufferMinutes` SHALL map to Drizzle `service.buffer_minutes` (integer, default 0)
8. THE Payload_Service_Collection field `pricePaise` SHALL map to Drizzle `service.price_paise` (integer)
9. THE Payload_Service_Collection field `isActive` SHALL map to Drizzle `service.is_active` (boolean, default true)
10. THE Payload_Service_Collection field `imageUrl` SHALL map to Drizzle `service.image_url` (text, nullable)
11. THE Payload_Service_Collection field `displayOrder` SHALL map to Drizzle `service.display_order` (integer, default 0)
12. THE Payload_Service_Collection field `gemsRedeemable` SHALL map to Drizzle `service.gems_redeemable` (boolean, default false)
13. THE Payload_Service_Collection field `gemsRequired` SHALL map to Drizzle `service.gems_required` (integer, nullable)
14. THE Payload_Service_Collection field `gemsCatalogueOrder` SHALL map to Drizzle `service.gems_catalogue_order` (integer, nullable)

### Requirement 10: Category Field Mapping Validation

**User Story:** As a data integrity engineer, I want exact field mapping for categories between Payload and Drizzle, so that category hierarchy is preserved.

#### Acceptance Criteria

1. THE Payload_Category_Collection field `id` SHALL map to Drizzle `service_category.id` (text, nanoid)
2. THE Payload_Category_Collection field `name` SHALL map to Drizzle `service_category.name` (text, not null)
3. THE Payload_Category_Collection field `slug` SHALL map to Drizzle `service_category.slug` (text, unique)
4. THE Payload_Category_Collection field `description` SHALL map to Drizzle `service_category.description` (text, nullable)
5. THE Payload_Category_Collection field `serviceType` SHALL map to Drizzle `service_category.service_type` (enum: salon|spa)
6. THE Payload_Category_Collection field `displayOrder` SHALL map to Drizzle `service_category.display_order` (integer, default 0)
7. THE Payload_Category_Collection field `isActive` SHALL map to Drizzle `service_category.is_active` (boolean, default true)

### Requirement 11: Migration Sequence

**User Story:** As a deployment engineer, I want a clear migration sequence, so that the transition happens without downtime.

#### Acceptance Criteria

1. THE deployment SHALL create Payload collections before removing admin UI
2. THE deployment SHALL verify sync hook functionality on staging before production deploy
3. THE deployment SHALL back up existing `public.service` and `public.service_category` data before migration
4. THE deployment SHALL seed Payload CMS with existing Drizzle service data as initial state
5. WHEN Payload seeding is complete, THE deployment SHALL enable the `afterChange` hooks
6. WHEN hooks are verified working, THE deployment SHALL remove admin service CRUD UI and write API routes
7. THE deployment SHALL retain admin read-only service endpoints for backward compatibility

### Requirement 12: Error Handling and Observability

**User Story:** As a site reliability engineer, I want comprehensive error handling and logging, so that sync failures are immediately visible and debuggable.

#### Acceptance Criteria

1. WHEN the AfterChange_Hook fails, THEN THE Sync_Operation SHALL log error details including document ID, operation type, and stack trace
2. WHEN the AfterChange_Hook fails, THEN THE Payload_CMS SHALL return HTTP 500 to the user with message "Failed to sync service data"
3. THE AfterChange_Hook SHALL emit structured JSON logs via `@rgss/logger` package
4. THE AfterChange_Hook SHALL log successful syncs at `info` level with sync duration
5. THE AfterChange_Hook SHALL log failed syncs at `error` level with full error context
6. THE sync duration metric SHALL be available for performance monitoring
7. IF the Drizzle database is unreachable, THEN THE AfterChange_Hook SHALL fail fast, bounded by the database connection/statement timeout (recommended ≤5 seconds configured on the connection), so the admin save does not hang indefinitely

### Requirement 13: Booking Engine Compatibility

**User Story:** As a customer, I want the booking flow to work identically after migration, so that my experience is uninterrupted.

#### Acceptance Criteria

1. THE Booking_Engine SHALL read services from Drizzle `public.service` table without modification
2. THE Booking_Engine route `GET /api/services` SHALL return identical response format before and after migration
3. THE Booking_Engine availability calculation SHALL use `duration_minutes` and `buffer_minutes` from Drizzle without change
4. THE Booking_Engine pricing display SHALL use `price_paise` from Drizzle without change
5. THE Booking_Engine service filtering SHALL use `is_active` flag from Drizzle without change
6. THE Booking_Engine category grouping SHALL use `category_id` from Drizzle without change
7. THE Booking_Engine SHALL NOT detect any difference in service data structure after migration

### Requirement 14: CMS Access Control

**User Story:** As a security administrator, I want CMS access restricted to authorized roles, so that service data cannot be accidentally corrupted.

#### Acceptance Criteria

1. THE Payload_Service_Collection SHALL restrict create/update operations to authenticated Payload users, consistent with the existing `adminsWrite` access helper used by all other collections (`apps/cms/src/access/published.ts`)
2. THE Payload_Category_Collection SHALL restrict create/update operations using the same `adminsWrite` access helper
3. THE Payload_CMS SHALL allow read access to service collections for all authenticated Payload users, via the existing `anyoneReads` access helper
4. THE Payload_CMS SHALL enforce authentication via Payload's own built-in auth system (the `users` collection with `auth: true`, defined in `apps/cms/src/collections/Users.ts`) before allowing any collection access — this is Payload's independent, self-contained session system and is explicitly NOT integrated with Better Auth (the web app's separate authentication system for `theroyalglow.in`/`admin.theroyalglow.in`)
5. THE Payload_CMS SHALL log all service/category modifications with user ID and timestamp
6. THE Payload_Service_Collection AND Payload_Category_Collection SHALL DISABLE the delete operation entirely (`delete: () => false`) — services and categories are retired by toggling `isActive` off, never hard-deleted, matching the existing "no soft-delete-column but never hard-delete" DB convention and avoiding the `ON DELETE RESTRICT` foreign key on `booking_service.service_id`
7. THE Payload_Service_Collection AND Payload_Category_Collection SHALL surface, in the Payload admin UI (collection `admin.description` and/or a UI hint), that services/categories are deactivated rather than deleted, so CMS users understand the absence of a delete action is intentional, not a defect
8. BECAUSE delete is disabled (AC 6), the Sync_Operation SHALL NOT require an `afterDelete` sync path for data correctness; however the existing `revalidateHooks(...).afterDelete` cache-busting hook MAY remain registered harmlessly

### Requirement 15: Rollback Plan

**User Story:** As a deployment engineer, I want a rollback procedure, so that I can revert the migration if critical issues arise.

#### Acceptance Criteria

1. IF the migration causes booking failures, THEN THE deployment SHALL restore admin service write APIs from version control
2. IF the migration causes booking failures, THEN THE deployment SHALL restore admin service UI from version control
3. THE rollback SHALL disable Payload `afterChange` hooks by setting a feature flag
4. THE rollback SHALL NOT require data restoration from backup if Drizzle data is intact
5. THE rollback procedure SHALL complete within 15 minutes of issue detection
6. THE feature flag referenced in AC 3 SHALL be the Service_Sync_Flag environment variable `SERVICE_SYNC_ENABLED` (see Requirement 3.12) — set to `false` and restart/redeploy the CMS. Commenting out hook registrations in source SHALL NOT be the primary rollback mechanism, because it requires a code edit, review, and rebuild inside the 15-minute window
7. THE rollback SHALL NOT revert the Payload schema migration (Requirement 19) — migrations are forward-only; disabling the Service_Sync_Flag leaves `cms.*` intact and harmless while `public.*` reverts to being written by the restored admin write APIs

### Requirement 16: Documentation Updates

**User Story:** As a team member, I want updated documentation, so that I know where to manage services after migration.

#### Acceptance Criteria

1. THE project documentation SHALL update "Service Management" section to reference Payload CMS
2. THE documentation SHALL remove references to admin portal service CRUD
3. THE documentation SHALL document the sync mechanism and its failure modes
4. THE documentation SHALL provide instructions for accessing Payload CMS at `cms.theroyalglow.in`
5. THE documentation SHALL explain that services are now managed in CMS, not admin portal

### Requirement 17: Drift Reconciliation Safety Net

**User Story:** As a site reliability engineer, I want a scheduled check that compares the CMS and Drizzle service tables, so that any silent divergence is detected and alerted rather than going unnoticed.

#### Acceptance Criteria

1. THE system SHALL run a scheduled reconciliation job (QStash scheduled HTTP job, consistent with the existing 14-job pattern) that compares `cms.service` against `public.service` and `cms.service_category` against `public.service_category`
2. THE reconciliation job SHALL compare, at minimum, row counts and per-row `id` + `updatedAt` to detect missing rows, extra rows, and stale rows
3. WHEN the reconciliation job detects any divergence, THE system SHALL emit an error-level structured log and trigger a BetterStack alert (consistent with the existing job-alerting pattern)
4. THE reconciliation job SHALL run at least once daily
5. THE reconciliation job SHALL be read-only by default (detect + alert), NOT auto-repair, so a human reviews any divergence before mutation — UNLESS the Requirement 4 outbox fallback is in use, in which case it MAY re-drive failed sync jobs
6. THE reconciliation job SHALL complete without holding long transactions or blocking CMS writes

### Requirement 18: Cache Revalidation on Sync

**User Story:** As the salon owner, I want service edits made in Payload to appear on the customer website within seconds, so that prices and availability shown to customers are never stale after I change them.

#### Acceptance Criteria

1. THE repurposed Payload_Service_Collection SHALL preserve the existing cache-busting behavior by composing the existing `revalidateHooks('service')` hooks TOGETHER WITH the new sync hook — the sync hook SHALL NOT replace or drop the revalidate hook
2. THE Payload_Category_Collection SHALL register the `revalidateHooks(...)` cache-busting hooks so category edits also refresh the website
3. WHEN a service or category is created or updated in Payload, THE web app cache SHALL be revalidated (via the existing `WEB_APP_URL/api/revalidate` → `revalidatePath('/', 'layout')` mechanism) so the `/services` page, `/services/[slug]` page, and booking dialog reflect the change within seconds
4. THE customer-facing read surfaces (`getCatalogueServices` on `/services`, `GET /api/services`, `getServiceBySlug` on `/services/[slug]`) SHALL continue reading from Drizzle `public.*` — the single read source — so all customer surfaces show identical, consistent service data sourced ultimately from Payload via the atomic sync
5. **DEFERRED — not implemented:** IF an Upstash Redis cache is added in front of `GET /api/services`, it SHALL use a TTL no longer than 5 minutes, SHALL have explicit invalidation independent of Next.js `revalidatePath`, and SHALL treat Neon `public.*` as authoritative. The existing AC 3 flow revalidates Next.js paths only; it does not currently invalidate Redis.

### Requirement 19: Payload Schema Migration

**User Story:** As a deployment engineer, I want the `cms` schema change generated as a reviewed, committed Payload migration, so that repurposing the Service collection can actually be applied to a `push: false` database without drift or accidental data loss.

#### Acceptance Criteria

1. BECAUSE `apps/cms` runs its Payload postgres adapter with `push: false` and currently has exactly ONE committed migration (`apps/cms/src/migrations/20260614_185535_initial.*`), THE repurposing of the Service collection SHALL NOT be deployable without a newly generated Payload migration — the collection field changes alter the `cms` schema and cannot self-apply
2. THE migration SHALL be generated with `payload migrate:create` (never hand-written, never `push`), producing both the `up`/`down` TypeScript migration and its index entry under `apps/cms/src/migrations/`
3. THE emitted SQL SHALL be REVIEWED before it is applied, and the review SHALL explicitly confirm the following changes to `cms.service`:
   - `id` column changed from Payload's default (integer/serial) to `varchar` — Payload's postgres adapter (`@payloadcms/drizzle/dist/postgres/schema/setColumnID.js`) emits a `varchar` primary key for a custom `id` field declared as `type: 'text'`, so the reviewer SHALL expect `varchar` in the generated SQL, NOT `text`. This is still a DESTRUCTIVE column type change on an existing table. (This remains ID-space compatible with Drizzle's `text` `public.service.id`: the stored values are byte-identical `nanoid()` output, the two columns are never foreign-keyed to each other, and `varchar`/`text` are binary-coercible in Postgres.)
   - DROPPED columns: `image` (a media foreign-key relation), `type`, `category`, `bookingRef`, `active`, `featured`, `order`
   - ADDED columns: `categoryId` (relationship FK), `slug`, `durationMinutes` (enum), `bufferMinutes`, `pricePaise`, `isActive`, `imageUrl`, `displayOrder`, `gemsRedeemable`, `gemsRequired`, `gemsCatalogueOrder`
   - CREATED table: `cms.service_category`, with its own `text` `id`
4. BEFORE altering the `cms.service.id` column type, THE deployment SHALL VERIFY the actual row count of `cms.service` (e.g. `SELECT count(*) FROM cms.service`) on each target branch. The collection is believed to be dead code and therefore empty, but this SHALL be verified, NOT assumed — IF any rows exist, they SHALL be exported and either discarded deliberately or re-created after the migration, and the decision SHALL be recorded before proceeding
5. THE migration SHALL be applied with `payload migrate` (not `push`), per branch in `dev` → `test` → `pprd` → `prod` order, consistent with `.kiro/steering/migration-discipline.md`
6. THE migration SHALL be FORWARD-ONLY — once committed it SHALL NEVER be edited, reordered, or deleted; corrections SHALL be made as a new forward migration
7. THE migration SHALL be applied and verified on `dev` BEFORE the seed script (Requirement 11.4) is run, since seeding writes into the new `cms` shape
8. BECAUSE Payload backs a `select` field on Postgres with a `cms`-schema enum, ADDING a new value to the Fixed_Duration_Set later SHALL require exactly two steps: (a) update the Service_Duration_Constant in `packages/types/src/service.ts`, and (b) run one `payload migrate:create` + `payload migrate`. This SHALL be documented as a known, cheap, one-step extension path rather than treated as a surprise
