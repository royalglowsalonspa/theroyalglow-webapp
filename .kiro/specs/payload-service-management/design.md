# Technical Design: Payload Service Management

## Overview

This feature migrates service and service category management from the admin portal to Payload CMS. Payload becomes the authoritative source for service data, with a real-time `afterChange` hook syncing writes to the Drizzle `public.service` and `public.service_category` tables. The booking engine continues reading from Drizzle with zero changes, establishing a write-in-CMS, read-from-Drizzle architecture.

**Key Principle:** Payload writes → Drizzle reads. The booking engine never knows Payload exists.

## Revision Notes (post-review corrections)

This design was audited against the actual codebase and five issues were found and corrected below:

1. **Collection collision resolved** — `apps/cms/src/collections/Service.ts` (slug `service`) already exists but is verified dead code (no route in `apps/web` calls `getServices()`). This design **repurposes it** rather than creating `ServiceBookingSync`. No rename needed, no new slug.
2. **Duration model simplified, then data-corrected ("Option A+")** — replaced the SPA-30/60 vs Salon-5-min-step rule with a single fixed `select` field for all services regardless of category type. A later audit of the real catalogue (`packages/db/scripts/data/services-salon.ts` + `services-spa.ts`, 57 services) found 12 services outside an initially proposed 15/30/60/90 set — 8 at 45 min, 3 at 120 min, 1 at 180 min (keratin) — so the option set is now `15 | 30 | 45 | 60 | 90 | 120 | 150 | 180`, sourced from the shared `SERVICE_DURATION_MINUTES` constant. Verified against `packages/business/src/booking/reschedule.ts`: the 30-minute slot grid only constrains *start time* alignment, not duration, so this is fully compatible with the existing booking engine.
3. **`id` field override added** — Payload's Postgres adapter defaults to auto-increment integer IDs. Both collections now explicitly declare `id` as `text`, generated via `nanoid()` in a `beforeValidate` hook, to stay compatible with Drizzle's `text` FK columns across `booking_service`, `staff_service`, `offer_service`, and `waitlist`.
4. **Atomic same-transaction sync (supersedes the earlier dedicated-pool idea)** — verification (Payload issue #8852, buildwithmatija "transaction trap") showed that a *separate* pool commits independently of Payload's transaction, risking divergence on rollback. The sync therefore writes `public.*` on Payload's own request-scoped transaction handle so `cms.*` and `public.*` commit or roll back together. `@rgss/db`'s edge `neon-http` client is still avoided. A verification spike (Task 2.0a) gates this; the outbox pattern is the documented fallback.
5. **Auth model corrected** — Payload uses its own independent `users` collection (`auth: true`) with `Boolean(req.user)`-based access control (`adminsWrite`/`anyoneReads` in `apps/cms/src/access/published.ts`). It is explicitly NOT integrated with Better Auth. All references to "Better Auth session" enforcement have been removed.

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Payload CMS (cms.theroyalglow.in)            │
│  ┌────────────────┐          ┌────────────────┐                 │
│  │  service       │          │ service_category│                 │
│  │  collection    │          │  collection     │                 │
│  └───────┬────────┘          └────────┬────────┘                 │
│          │                            │                          │
│          │ afterChange hooks          │                          │
│          └────────────────┬───────────┘                          │
│                           │                                       │
│                     ┌─────▼──────┐                               │
│                     │ Sync Logic │                               │
│                     │ (Drizzle)  │                               │
│                     └─────┬──────┘                               │
└───────────────────────────┼──────────────────────────────────────┘
                            │
                 ┌──────────▼──────────┐
                 │ Neon PostgreSQL     │
                 ├─────────────────────┤
                 │ cms schema:         │
                 │  - cms.service      │
                 │  - cms.service_cat..│
                 ├─────────────────────┤
                 │ public schema:      │
                 │  - public.service   │
                 │  - public.service_..│
                 └──────────┬──────────┘
                            │
              ┌─────────────▼─────────────┐
              │  Booking Engine           │
              │  (reads public.service)   │
              └───────────────────────────┘
```

### Data Flow

1. **Create:** Admin creates service in Payload → saved to `cms.service` → `afterChange` fires → INSERT into `public.service`
2. **Update:** Admin updates service in Payload → saved to `cms.service` → `afterChange` fires → UPDATE `public.service` by ID
3. **Read:** Booking engine queries `public.service` (unchanged, no awareness of Payload)

**Isolation:** Payload tables live in `cms` schema, app tables in `public` schema. Zero collision risk.

---

## Components and Interfaces

| Component | File | Responsibility |
|---|---|---|
| `Service` collection (repurposed) | `apps/cms/src/collections/Service.ts` | Payload admin UI for creating/editing bookable services; owns the `service` slug; triggers sync on save |
| `ServiceCategory` collection (new) | `apps/cms/src/collections/ServiceCategory.ts` | Payload admin UI for service categories (Salon/SPA); triggers sync on save |
| Sync DB helper | `apps/cms/src/lib/sync-db.ts` | Re-exports `@rgss/db/schema` tables + a `txDb(req)` resolver returning Payload's transaction-bound Drizzle handle for atomic cross-schema writes (no separate pool on the primary path) + `isSyncEnabled()`, the `SERVICE_SYNC_ENABLED` feature-flag gate |
| Payload migration | `apps/cms/src/migrations/<ts>_repurpose_service_collection.*` | Generated `cms`-schema migration for the repurposed Service collection + new `service_category` table (required — `apps/cms` runs `push: false`) |
| Service sync hook | `apps/cms/src/hooks/sync-service.ts` | `afterChange` hook: maps and writes Payload service docs to `public.service` |
| Category sync hook | `apps/cms/src/hooks/sync-service-category.ts` | `afterChange` hook: maps and writes Payload category docs to `public.service_category` |
| Field mappers | `apps/cms/src/hooks/mappers.ts` | Pure functions translating Payload document shape → Drizzle row shape (type coercion, defaults, null-handling) |
| Seed script | `apps/cms/scripts/seed-services.ts` | One-time migration: reads existing Drizzle rows, creates matching Payload documents before hooks go live |
| Admin API routes (modified) | `apps/admin/src/app/api/services/*`, `apps/admin/src/app/api/service-categories/*` | GET endpoints preserved for booking-engine/admin reads; POST/PATCH replaced with `410 Gone` |
| Booking engine (unchanged) | `apps/web/src/app/api/services/route.ts`, `packages/db/src/queries/services.ts` | Continues reading `public.service`/`public.service_category` directly via Drizzle; no awareness of Payload |

**Interface boundary:** Payload's `afterChange` hooks are the *only* write path into `public.service`/`public.service_category` after migration. The booking engine's read queries (`getActiveCatalogue`, `getServicesByIds`, `getServiceBySlug`, etc. in `packages/db/src/queries/services.ts`) are unmodified — they are not part of this feature's interface surface, only its consumer.

## Data Models

### Drizzle (`public` schema — read by booking engine, written only by sync hooks after migration)

Unchanged from the existing schema in `packages/db/src/schema/service.ts`:

```typescript
service_category {
  id: text (PK, nanoid)
  name: text (not null)
  slug: text (not null, unique)
  description: text (nullable)
  service_type: enum('salon' | 'spa') (not null)
  display_order: integer (default 0)
  is_active: boolean (default true)
  created_at, updated_at: timestamptz
}

service {
  id: text (PK, nanoid)
  category_id: text (FK → service_category.id, RESTRICT)
  name: text (not null)
  slug: text (not null, unique)
  description: text (nullable)
  duration_minutes: integer (not null)   // now always a member of SERVICE_DURATION_MINUTES
                                         // (15|30|45|60|90|120|150|180) — still a plain
                                         // integer column, no CHECK constraint added
  buffer_minutes: integer (default 0)
  price_paise: integer (not null)
  is_active: boolean (default true)
  image_url: text (nullable)
  display_order: integer (default 0)
  gems_redeemable: boolean (default false)
  gems_required: integer (nullable)
  gems_catalogue_order: integer (nullable)
  created_at, updated_at: timestamptz
}
```

No Drizzle schema changes are made by this feature — `packages/db/migrations/` gains no new migration. The only behavioral change is *who* writes these tables (Payload sync hooks instead of admin API routes) and *what values* `duration_minutes` can take (constrained to the 8 values of `SERVICE_DURATION_MINUTES` by the Payload UI, not by a new DB constraint). Note this is distinct from the **Payload** migration, which IS required — see "Payload Migration" under Migration Strategy.

### Payload (`cms` schema — owned by Payload, mirrors the shape above for editing)

```typescript
// cms.service (repurposed collection)
{
  id: text (custom nanoid override, see "Custom `id` Field Override")
  categoryId: relationship → service_category
  name: text (required)
  slug: text (auto-generated)
  description: textarea (optional)
  durationMinutes: select(SERVICE_DURATION_MINUTES → '15'|'30'|'45'|'60'|'90'|'120'|'150'|'180') (required)
  bufferMinutes: number (default 0)
  pricePaise: number (required, min 0)
  isActive: checkbox (default true)
  imageUrl: text (optional)
  displayOrder: number (default 0)
  gemsRedeemable: checkbox (default false)
  gemsRequired: number (conditionally required)
  gemsCatalogueOrder: number (optional)
}

// cms.service_category (new collection)
{
  id: text (custom nanoid override)
  name: text (required)
  slug: text (auto-generated)
  description: textarea (optional)
  serviceType: select('salon' | 'spa') (required)
  displayOrder: number (default 0)
  isActive: checkbox (default true)
}
```

**Relationship between the two schemas:** field names differ only in casing convention (Payload camelCase ↔ Drizzle snake_case); the mapper functions in `apps/cms/src/hooks/mappers.ts` are the single translation point. There is intentionally no shared TypeScript type between them — Payload's generated `payload-types.ts` and Drizzle's `$inferInsert`/`$inferSelect` types remain independent, with the mapper as the explicit seam.

## Payload Collection Schemas

### Service Collection (Repurposed)

**Slug:** `service` (existing collection at `apps/cms/src/collections/Service.ts` — repurposed, NOT a new collection)
**Storage:** `cms.service` table
**Admin Title Field:** `name`

> **Note:** The current `Service.ts` fields (`type`, `category` as a hardcoded select, `bookingRef`, `active`, `featured`, `order`) are the marketing-catalogue shape from before this feature existed and are dead code (unused by any live route). This design **replaces the field set entirely** with the booking-accurate schema below. This is a breaking change to that file's shape, which is safe precisely because nothing reads it today.

#### Fields

| Field | Payload Type | Drizzle Column | Required | Notes |
|-------|-------------|----------------|----------|-------|
| `id` | `text` | `id` | ✓ | Custom override — nanoid() via `beforeValidate`, NOT Payload's default auto-increment int |
| `categoryId` | `relationship` (`relationTo: 'service_category'`) | `category_id` | ✓ | FK to `service_category` collection; `hasMany: false` |
| `name` | `text` | `name` | ✓ | Service display name |
| `slug` | `text` | `slug` | ✓ | Auto-generated from `name` via `beforeChange` hook |
| `description` | `textarea` | `description` | | Nullable text |
| `durationMinutes` | `select` (number-valued) | `duration_minutes` | ✓ | **Fixed options derived from `SERVICE_DURATION_MINUTES`: `15`, `30`, `45`, `60`, `90`, `120`, `150`, `180`** — replaces the old SPA/Salon conditional rule |
| `bufferMinutes` | `number` | `buffer_minutes` | | Integer, default: 0 |
| `pricePaise` | `number` | `price_paise` | ✓ | Non-negative integer (₹ in paise) |
| `isActive` | `checkbox` | `is_active` | | Boolean, default: true |
| `imageUrl` | `text` | `image_url` | | Nullable URL |
| `displayOrder` | `number` | `display_order` | | Integer, default: 0 |
| `gemsRedeemable` | `checkbox` | `gems_redeemable` | | Boolean, default: false |
| `gemsRequired` | `number` | `gems_required` | | Positive integer, required if `gemsRedeemable=true` |
| `gemsCatalogueOrder` | `number` | `gems_catalogue_order` | | Nullable integer |

#### Duration Field (Fixed Set, "Option A+" — replaces `isValidDurationForType`)

**Single source of truth.** The allowed durations are declared ONCE, in `packages/types/src/service.ts`, and Payload's `select` options are *derived* from that constant. Hard-coding the list in the collection would let the CMS UI, the seed data, and validation drift apart.

```typescript
// packages/types/src/service.ts  (NEW export — supersedes SPA_DURATIONS
// and isValidDurationForType() for the CMS write path)
export const SERVICE_DURATION_MINUTES = [15, 30, 45, 60, 90, 120, 150, 180] as const
export type ServiceDurationMinutes = (typeof SERVICE_DURATION_MINUTES)[number]
```

```typescript
// apps/cms/src/collections/Service.ts — options DERIVED, never hard-coded
// `@rgss/types` exposes ONLY the package root export (its package.json declares
// `"exports": { ".": "./src/index.ts" }` — there is no `./service` subpath), so
// import from the root; `src/index.ts` re-exports `./service`.
import { SERVICE_DURATION_MINUTES } from '@rgss/types'

{
  name: 'durationMinutes',
  type: 'select',
  required: true,
  options: SERVICE_DURATION_MINUTES.map((m) => ({
    label: `${m} minutes`,
    value: String(m),
  })),
  admin: {
    description:
      'Typical: beard/shave 15min, haircut 30min, advanced haircut / classic facial / spa mani-pedi 45min, most SPA 60-90min, global colour (long) & bridal makeup 120min, keratin 180min.',
  },
  // Payload select field values arrive as strings; convert to number before
  // syncing to Drizzle's integer column (see mapPayloadToPublicService).
}
```

**Why these eight values (data-driven, not arbitrary):** an audit of the live catalogue (`packages/db/scripts/data/services-salon.ts` + `services-spa.ts`, 57 services) found 12 services outside a 15/30/60/90 set:

| Duration | Count | Services |
|---|---|---|
| 45 min | 8 | haircut-advanced, root-touchup, facial-classic, wax-full-legs, manicure-spa, pedicure-spa, hair-spa-basic, scalp-treatment |
| 120 min | 3 | colour-global-long, highlights, makeup-bridal |
| 180 min | 1 | keratin |

A 15/30/60/90-only set would have failed seed validation on all 12, and forcing a 180-minute keratin into a 90-minute slot would double-book the stylist. `150` is added as headroom; every other value is in live use.

**What does NOT change:** Drizzle `public.service.duration_minutes` stays a plain `integer` — **no Drizzle migration, no booking-engine change**. The Payload field stays a `select` (dropdown) rather than a free `number` input so owner-entered durations are correct by construction, and the mapper still coerces the string value with `Number()`.

**Future-proofing (known extension path, not a surprise):** Payload backs a `select` field on Postgres with an enum type in the `cms` schema. Adding a NEW duration option later therefore requires exactly two steps:

1. Add the value to `SERVICE_DURATION_MINUTES` in `packages/types/src/service.ts`.
2. Run one `payload migrate:create` + `payload migrate` (the generated migration adds the enum value).

This is cheap and one-step, but it is *not* zero-step — it is documented here so it is never discovered mid-incident.

**Why this replaces `isValidDurationForType()` entirely, not just in Payload:** the old rule branched on category type (SPA → 30/60 only, Salon → free 5-min steps). A fixed dropdown sourced from `SERVICE_DURATION_MINUTES` is category-agnostic and enforces validity by construction — there is no conditional logic left to replicate, so `isValidDurationForType()` and `SPA_DURATIONS` become dead code once the admin write paths are removed (Task 6). They are **not** deleted from `packages/types/src/service.ts` in this migration since removing shared package exports is out of scope and low-value; they simply have zero callers after Task 6-7, and `SERVICE_DURATION_MINUTES` is added alongside them in the same file.

#### Custom `id` Field (nanoid override)

```typescript
import { customAlphabet } from 'nanoid'

// Match @rgss/db's nanoid() defaults exactly (21-char, standard alphabet)
const generateId = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_',
  21,
)

{
  name: 'id',
  type: 'text',
  admin: { hidden: true },
  hooks: {
    beforeValidate: [
      ({ value, operation }) => {
        if (operation === 'create' && !value) {
          return generateId()
        }
        return value
      },
    ],
  },
}
```

**Critical:** Payload's Postgres adapter auto-generates an `id` column (serial/UUID) unless a field named `id` is explicitly declared in `fields`. Declaring it as above overrides the default and produces IDs shaped exactly like `@rgss/db`'s `nanoid()` output, keeping `cms.service.id` and `public.service.id` in the same ID-space so downstream FKs (`booking_service.service_id`, `staff_service.service_id`, `offer_service.service_id`, `waitlist.service_id`) never see a foreign key violation from a mismatched ID format.

#### Gems Conditional Validation

```typescript
// Field-level validation
pricePaise: { min: 0 }

// Conditional validation (beforeValidate hook)
if (gemsRedeemable === true && !gemsRequired) {
  throw new ValidationError('gemsRequired is required when gemsRedeemable is true')
}
if (gemsRedeemable === true && gemsRequired <= 0) {
  throw new ValidationError('gemsRequired must be positive')
}
```

#### Slug Generation

```typescript
// beforeChange hook
hooks: {
  beforeChange: [
    ({ data, operation }) => {
      if (operation === 'create' && !data.slug) {
        data.slug = slugify(data.name, { lower: true, strict: true })
      }
      return data
    }
  ]
}
```

**Slugify Options:**
- `lower: true` — lowercase
- `strict: true` — remove special chars, only alphanumeric + hyphens

---

### Service Category Collection (New)

**Slug:** `service_category` (new collection — no existing slug to collide with)
**Storage:** `cms.service_category` table
**Admin Title Field:** `name`

#### Fields

| Field | Payload Type | Drizzle Column | Required | Notes |
|-------|-------------|----------------|----------|-------|
| `id` | `text` | `id` | ✓ | Custom override — nanoid() via `beforeValidate` (same pattern as Service collection) |
| `name` | `text` | `name` | ✓ | Category display name |
| `slug` | `text` | `slug` | ✓ | Auto-generated from `name` |
| `description` | `textarea` | `description` | | Nullable text |
| `serviceType` | `select` | `service_type` | ✓ | Enum: `salon` or `spa` |
| `displayOrder` | `number` | `display_order` | | Integer, default: 0 |
| `isActive` | `checkbox` | `is_active` | | Boolean, default: true |

#### Validation Rules

```typescript
serviceType: {
  options: [
    { label: 'Salon', value: 'salon' },
    { label: 'SPA', value: 'spa' }
  ],
  required: true
}
```

---

### Service Card Collection (Unchanged, Out of Scope)

`apps/cms/src/collections/ServiceCard.ts` (slug `service-card`) is the homepage marketing card feature ("See what Royal Glow can do for you"). It is display-only, has no `durationMinutes`/`pricePaise` integer fields, no sync hook, and no relationship to the booking engine. **No changes are made to this collection.** It is documented here only to make explicit that it was never actually in conflict with this migration.

---

## Sync Hook Architecture

### Atomic Same-Transaction Sync (revised — supersedes the earlier dedicated-pool design)

**Why the earlier dedicated-`pg.Pool` design was wrong:** Payload v3.85 wraps each mutation and its hooks in a single DB transaction (`req.transactionID`). The `cms.service` write is *pending, uncommitted* when `afterChange` fires. A write issued from a **separate** pool commits independently — so if Payload's transaction later rolls back, `public.service` keeps a row `cms.service` no longer has. That is silent divergence, the exact failure this feature exists to prevent. Verified against Payload community reports (issue #8852; buildwithmatija "transaction trap").

**Correct model:** write `public.*` on Payload's own request-scoped transaction handle. Both schemas live in the same physical Neon database, so the `cms` write and the `public` write are **one atomic transaction — commit together, roll back together.**

**File:** `apps/cms/src/lib/sync-db.ts`

```typescript
// Reuse ONLY the Drizzle table definitions from @rgss/db/schema (structure, not
// the neon-http `db` client). The connection used at write time is Payload's
// request-scoped TRANSACTION-BOUND handle, resolved per-call (see hooks).
import { service, serviceCategory } from '@rgss/db/schema'

export { service, serviceCategory }

// Resolve the Drizzle client bound to Payload's ACTIVE TRANSACTION for this
// request. VERIFIED shape (Task 2.0a spike, matching Payload's own internal
// getTransaction() in @payloadcms/drizzle):
//
//   - `req.transactionID` may be a Promise → MUST be awaited (so txDb is async)
//   - `adapter.sessions[txID].db` is the transaction-bound Drizzle instance;
//     writes on it join Payload's transaction (atomic with the cms.* write)
//   - `?? adapter.drizzle` fallback matches Payload's behavior when there is no
//     active transaction (non-transactional call)
//
// DO NOT use `req.payload.db.drizzle` directly — that is the BASE POOL handle,
// which commits INDEPENDENTLY of Payload's transaction and reintroduces the
// exact divergence this feature prevents. (Confirmed wrong by the 2.0a spike.)
export async function txDb(req: any) {
  const adapter = req.payload.db // PostgresAdapter
  const txID = await req.transactionID
  return adapter.sessions?.[txID]?.db ?? adapter.drizzle
}

// Feature flag gate for the sync hooks (Req 3.12, 3.13, 15.6).
// Default ENABLED — only an explicit 'false' turns the sync off, so a missing
// env var can never silently stop syncing. Set to 'false' while running the
// seed script, and as the primary rollback lever. Documented in
// apps/cms/.env.example.
export function isSyncEnabled(): boolean {
  return process.env.SERVICE_SYNC_ENABLED !== 'false'
}
```

> **Verification gate (Task 2.0a) — PASSED.** Confirmed on the `dev` Neon branch: a cross-schema write to `public.*` on Payload's transaction-bound handle (a) commits atomically with the `cms.*` write and (b) rolls back together when the hook throws. Unqualified Drizzle table defs resolve to `public.*` via search_path; drizzle-orm 0.45.2 is shared between `@rgss/db` and `@payloadcms/drizzle`, so there is no dual-instance symbol mismatch. The outbox fallback is therefore NOT needed.

### Hook Registration (compose sync + revalidate + disable delete)

```typescript
// apps/cms/src/collections/Service.ts (REPURPOSED — same file, same slug `service`)
import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'
import { syncServiceToPublic } from '../hooks/sync-service'

const revalidate = revalidateHooks('service')

export const Service: CollectionConfig = {
  slug: 'service',
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: () => false, // DELETE DISABLED — retire via isActive toggle only (Req 14.6)
  },
  hooks: {
    // Sync FIRST (writes public.* atomically in Payload's txn), THEN the existing
    // cache-busting ping. Do NOT drop revalidate — dropping it was a regression in
    // the pre-review draft (edits would sync but the site cache would not refresh).
    // Both are composed. (Req 18.1)
    afterChange: [syncServiceToPublic, ...revalidate.afterChange],
    afterDelete: revalidate.afterDelete, // harmless; delete is disabled anyway
  },
  // ... fields per "Service Collection (Repurposed)" section above
}
```

```typescript
// apps/cms/src/collections/ServiceCategory.ts (NEW FILE)
import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'
import { syncServiceCategoryToPublic } from '../hooks/sync-service-category'

const revalidate = revalidateHooks('service') // revalidatePath('/','layout') refreshes all surfaces

export const ServiceCategory: CollectionConfig = {
  slug: 'service_category',
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: () => false, // DELETE DISABLED (Req 14.6)
  },
  hooks: {
    afterChange: [syncServiceCategoryToPublic, ...revalidate.afterChange],
    afterDelete: revalidate.afterDelete,
  },
  // ... fields per "Service Category Collection (New)" section above
}
```

### Sync Implementation (writes on Payload's transaction handle)

**File:** `apps/cms/src/hooks/sync-service.ts`

```typescript
import type { CollectionAfterChangeHook } from 'payload'
import { eq } from 'drizzle-orm'
import { service, txDb, isSyncEnabled } from '../lib/sync-db'
import { mapPayloadToPublicService } from './mappers'

export const syncServiceToPublic: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  // Feature-flag gate (Req 3.12, 15.6). SERVICE_SYNC_ENABLED defaults to
  // enabled; set it to 'false' while seeding (the seed itself calls
  // payload.create, which would otherwise re-write the row it just read),
  // and as the PRIMARY rollback lever — no code edit, no rebuild.
  if (!isSyncEnabled()) {
    console.info('[sync] skipped — SERVICE_SYNC_ENABLED=false', {
      operation,
      documentId: doc.id,
    })
    return doc
  }

  const startedAt = Date.now()
  try {
    // Bind to Payload's active transaction so cms.service + public.service
    // commit/roll back together (Req 3.5, 4.1). txDb is async — it awaits
    // req.transactionID and returns the transaction-bound session handle.
    const db = await txDb(req)
    const mappedData = mapPayloadToPublicService(doc)

    if (operation === 'create') {
      // UPSERT, not a bare insert (Req 3.11). The seed reads rows FROM
      // public.service and then calls payload.create() with the SAME id, so a
      // plain .insert() would raise a duplicate-key / unique-slug violation.
      // onConflictDoUpdate makes re-seeding, hook retries, and pre-existing
      // rows safe instead of fatal — belt AND braces with the flag above.
      const { id: _id, createdAt: _createdAt, ...updatable } = mappedData
      await db
        .insert(service)
        .values(mappedData)
        .onConflictDoUpdate({
          target: service.id,
          set: { ...updatable, updatedAt: new Date() },
        })
    } else if (operation === 'update') {
      await db
        .update(service)
        .set({ ...mappedData, updatedAt: new Date() })
        .where(eq(service.id, doc.id))
    }
    // No delete branch — delete is disabled at the access layer (Req 14.6).

    console.info('[sync] service synced', {
      operation,
      documentId: doc.id,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    console.error('[sync] service sync failed', {
      operation,
      documentId: doc.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      durationMs: Date.now() - startedAt,
    })
    // Re-throw → Payload rolls back the WHOLE transaction (cms.service included)
    // → no divergence possible (Req 3.9).
    throw error
  }

  return doc
}
```

`apps/cms/src/hooks/sync-service-category.ts` follows the identical pattern against `serviceCategory` / `public.service_category` — including the `isSyncEnabled()` short-circuit and the `onConflictDoUpdate({ target: serviceCategory.id, ... })` upsert on the create path.

### Idempotency and the Seeding Deadlock (why upsert, not insert)

The seed script (Migration Strategy Phase 1) reads rows **from** `public.service`, then calls `payload.create()`. With hooks live, that `create` fires `afterChange`, which writes `public.service` using the **same `id`** the row was just read from — a guaranteed primary-key (and unique-`slug`) violation. Two independent mitigations are applied, and both are kept:

1. **`SERVICE_SYNC_ENABLED=false` during the seed run** — the hook short-circuits, so no write is attempted at all. This is the intended operating procedure.
2. **Upsert on the create path** — even with the flag on, `.onConflictDoUpdate({ target: <table>.id, set: { ... } })` converts the collision into a harmless update. This also covers hook retries, partially-completed seeds, and any pre-existing row, none of which should be fatal.

`id` and `createdAt` are excluded from the conflict `set` clause so an existing row keeps its original creation timestamp (Property 10) while every mutable field converges on the Payload document.

### Outbox Fallback (only if the Task 2.0a spike fails)

If Payload 3.85 cannot execute cross-schema writes on its transaction handle:

1. Payload commits `cms.service` normally — it becomes the source of truth.
2. `afterChange` enqueues a QStash job (`sync-service-to-public`) with the doc id + operation.
3. The QStash endpoint writes `public.service` via a dedicated `node-postgres` client, with QStash's built-in at-least-once retry for transient failures.
4. The drift-reconciliation job (Req 17) re-drives any job that never succeeded.

This trades atomic consistency for eventual consistency (seconds of lag), acceptable given the low write volume, and is fully self-healing via the drift job. It is the *fallback*, not the default.

---

## Field Mapping Specifications

### Service Mapping

**Function:** `mapPayloadToPublicService(doc: PayloadService): PublicService`

```typescript
function mapPayloadToPublicService(doc: any) {
  return {
    id: doc.id,
    // Payload relationship field can arrive as a string ID (hasMany: false,
    // depth: 0) or a populated object ({ id, ... }) depending on the request's
    // `depth` param. Handle both defensively.
    categoryId: typeof doc.categoryId === 'object' ? doc.categoryId?.id : doc.categoryId,
    name: doc.name,
    slug: doc.slug,
    description: doc.description ?? null,
    // durationMinutes is a Payload `select` field — values arrive as strings
    // ('15'|'30'|'45'|'60'|'90'|'120'|'150'|'180', per SERVICE_DURATION_MINUTES).
    // Drizzle's column is integer; must coerce.
    durationMinutes: Number(doc.durationMinutes),
    bufferMinutes: doc.bufferMinutes ?? 0,
    pricePaise: doc.pricePaise,
    isActive: doc.isActive ?? true,
    imageUrl: doc.imageUrl ?? null,
    displayOrder: doc.displayOrder ?? 0,
    gemsRedeemable: doc.gemsRedeemable ?? false,
    gemsRequired: doc.gemsRequired ?? null,
    gemsCatalogueOrder: doc.gemsCatalogueOrder ?? null,
    createdAt: doc.createdAt, // Preserve from Payload
    // updatedAt set by caller (INSERT: now, UPDATE: explicit set)
  }
}
```

**Key Rules:**
- `categoryId`: Payload relationship field may be a bare ID string or a populated object depending on request depth — mapper normalizes both
- `durationMinutes`: Payload `select` field values are always strings; MUST coerce to `Number()` before writing to Drizzle's `integer` column, or the sync INSERT/UPDATE fails a type check
- `createdAt`: NEVER modify — preserve Payload's timestamp
- `updatedAt`: Always set to `new Date()` on UPDATE, let Drizzle default on INSERT
- Nullables: coalesce undefined → null for Postgres compatibility

### Category Mapping

**Function:** `mapPayloadToPublicCategory(doc: PayloadCategory): PublicCategory`

```typescript
function mapPayloadToPublicCategory(doc: any) {
  return {
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    description: doc.description ?? null,
    serviceType: doc.serviceType, // 'salon' | 'spa'
    displayOrder: doc.displayOrder ?? 0,
    isActive: doc.isActive ?? true,
    createdAt: doc.createdAt,
    // updatedAt handled by caller
  }
}
```

---

## Error Handling

### Hook-Level Error Handling

```typescript
try {
  // Sync logic
} catch (error) {
  // Structured logging
  console.error('[sync] Operation failed', {
    operation,
    documentId: doc.id,
    collection: 'service',
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })

  // Re-throw to bubble up to Payload
  // Payload will:
  // 1. Rollback the cms.service write (transaction)
  // 2. Return 500 to admin user with message
  throw error
}
```

### Error Response to Admin

When sync fails, Payload returns:

```json
{
  "errors": [
    {
      "message": "Failed to sync service data"
    }
  ]
}
```

**HTTP Status:** 500 Internal Server Error

**User Experience:** Admin sees error toast in Payload UI, document not saved.

---

## Migration Strategy

### Phase 0: Payload Migration (REQUIRED — cannot be skipped)

`apps/cms` runs its postgres adapter with **`push: false`** and currently has exactly **one** committed migration: `apps/cms/src/migrations/20260614_185535_initial.*`. Repurposing the Service collection changes the `cms` schema, and with `push: false` that change **cannot self-apply** — without a generated migration the deploy simply runs against the old shape and every write fails. This phase is therefore a hard prerequisite for the seed (Phase 1). Implemented by **Task 3.0**, which runs before Task 3.1.

**Generate → review → apply:**

```bash
# from apps/cms/
bun payload migrate:create repurpose_service_collection
# → review the emitted SQL in apps/cms/src/migrations/<ts>_repurpose_service_collection.ts
bun payload migrate
```

**What the emitted SQL must cover on `cms.service`:**

| Change | Detail | Risk |
|---|---|---|
| ALTER `id` | Payload default (integer/serial) → `varchar` — the adapter (`@payloadcms/drizzle/dist/postgres/schema/setColumnID.js`) emits `varchar` for a custom `id` field of `type: 'text'`, so expect `varchar` in the SQL, not `text` | **DESTRUCTIVE** column type change on an existing table. Still ID-space compatible with Drizzle's `text` `public.service.id`: values are byte-identical `nanoid()` output, the columns are never foreign-keyed to each other, and `varchar`/`text` are binary-coercible in Postgres |
| DROP columns | `image` (a media FK relation), `type`, `category`, `bookingRef`, `active`, `featured`, `order` | Data loss by design — these are the dead marketing-shape fields |
| ADD columns | `categoryId` (relationship FK), `slug`, `durationMinutes` (enum), `bufferMinutes`, `pricePaise`, `isActive`, `imageUrl`, `displayOrder`, `gemsRedeemable`, `gemsRequired`, `gemsCatalogueOrder` | New booking-accurate shape |
| CREATE table | `cms.service_category` (own `text` `id`) | New collection |

**Verify row count BEFORE altering `id` — do not assume empty:**

```sql
SELECT count(*) FROM cms.service;
```

The collection is believed to be dead code and therefore empty, but the `id` type change is destructive, so this is **verified, not assumed**, on every target branch. If any rows exist, export them and record an explicit decision (discard or re-create post-migration) before proceeding.

**Discipline:** generate with `payload migrate:create` (never hand-written, never `push`), review the SQL before trusting it, commit the migration with the collection change, then apply with `payload migrate` per branch in `dev` → `test` → `pprd` → `prod` order — consistent with `.kiro/steering/migration-discipline.md`. Migrations are **forward-only**: never edit, reorder, or delete a committed migration; correct mistakes with a new one.

**Note on scope:** this is the *Payload* (`cms` schema) migration only. `packages/db/migrations/` still gains **no** new Drizzle migration — `public.service` is unchanged.

### Phase 1: Seed Payload from Drizzle (One-Time)

**Script:** `apps/cms/scripts/seed-services.ts`

```typescript
import { db as drizzleDb } from '@rgss/db'
import { service, serviceCategory } from '@rgss/db/schema'
import { getPayload } from 'payload'
import config from '../src/payload.config'

async function seedFromDrizzle() {
  const payload = await getPayload({ config })

  // Seed categories first
  const categories = await drizzleDb.select().from(serviceCategory)
  for (const cat of categories) {
    await payload.create({
      collection: 'service_category',
      data: {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        serviceType: cat.serviceType,
        displayOrder: cat.displayOrder,
        isActive: cat.isActive,
        createdAt: cat.createdAt.toISOString(),
        updatedAt: cat.updatedAt.toISOString(),
      },
    })
  }

  // Seed services
  const services = await drizzleDb.select().from(service)
  for (const svc of services) {
    await payload.create({
      collection: 'service',
      data: {
        id: svc.id,
        categoryId: svc.categoryId,
        name: svc.name,
        slug: svc.slug,
        description: svc.description,
        durationMinutes: svc.durationMinutes,
        bufferMinutes: svc.bufferMinutes,
        pricePaise: svc.pricePaise,
        isActive: svc.isActive,
        imageUrl: svc.imageUrl,
        displayOrder: svc.displayOrder,
        gemsRedeemable: svc.gemsRedeemable,
        gemsRequired: svc.gemsRequired,
        gemsCatalogueOrder: svc.gemsCatalogueOrder,
        createdAt: svc.createdAt.toISOString(),
        updatedAt: svc.updatedAt.toISOString(),
      },
    })
  }

  console.log(`Seeded ${categories.length} categories, ${services.length} services`)
}

seedFromDrizzle()
```

**Run Once:** After the Phase 0 Payload migration is applied, and with **`SERVICE_SYNC_ENABLED=false`** so the sync hooks do not fire while seeding:

```bash
SERVICE_SYNC_ENABLED=false bun run apps/cms/scripts/seed-services.ts
```

Without the flag, `payload.create()` would fire `afterChange`, which writes `public.service` with the same `id` the row was just read from — a duplicate-key violation. The upsert in the sync hook makes that non-fatal even if the flag is forgotten, but the flag is the intended procedure.

> **Unverified assumption (gated by Task 5.0).** This script assumes `payload.create()` honors an explicit `id` **and** explicit `createdAt`/`updatedAt`. Payload manages its own timestamps and may silently ignore overrides. Task 5.0 is a verification spike (same spirit as the already-passed 2.0a) that confirms this on the `dev` Neon branch before 5.1 is written. **Fallback if it does not hold:** either insert the seed rows directly into the `cms.*` tables via SQL (bypassing Payload's create pipeline), or accept fresh CMS timestamps and relax Property 10 so it applies only to post-seed live edits.

### Phase 2: Enable Hooks

1. Verify seed script completed successfully
2. Restore `SERVICE_SYNC_ENABLED` to enabled (remove the override, or set `true`) — the hooks are always *registered*; the flag is what gates them
3. Test create/update on staging → verify Drizzle sync
4. Enable on production

### Phase 3: Remove Admin UI/APIs

**Files to Remove:**
- `apps/admin/src/app/services/page.tsx`
- `apps/admin/src/app/services/services-manager.tsx`
- `apps/admin/src/app/api/services/route.ts` (POST endpoint)
- `apps/admin/src/app/api/services/[id]/route.ts` (PATCH endpoint)
- `apps/admin/src/app/api/service-categories/route.ts` (POST)
- `apps/admin/src/app/api/service-categories/[id]/route.ts` (PATCH)

**Files to Keep (Read-Only):**
- `apps/admin/src/app/api/services/route.ts` (GET endpoint for booking)

**Files that MUST be updated in the same change (they break the build otherwise):**

| File | Why | Action |
|---|---|---|
| `apps/admin/src/app/api/services/services-mgmt.test.ts` | Imports `svcRoute.POST`, `svcIdRoute.PATCH`, `catRoute.POST` and asserts 201/400/403/404 plus the SPA 30/60 slot-length rule. Those handlers become `410`, so the suite fails — and CI runs tests (`.github/workflows/ci.yml`), so this is a **red build that blocks everything**. | Rewrite (Task 6.6): delete the create/update and SPA-30/60 cases, KEEP + adapt the `GET /api/services/all` and categories test, add assertions that POST/PATCH return `410`. Non-optional. |
| `apps/web/src/lib/cms/client.ts` | `getServices()` queries `/api/service?where[active][equals]=true&depth=1&sort=order` plus `where[type][equals]=...`. `active`, `order`, and `type` are all DROPPED by the repurposing, so it becomes broken code. It has **no callers** (verified dead). | Delete `getServices()` only (Task 7.5). **KEEP the `Service` type** from `@/lib/cms/types` — it is still used by `apps/web/src/lib/catalogue.ts`. Also drop any imports left unused by the deletion. |
| `apps/admin/src/lib/rbac.ts` | Contains BOTH the sidebar nav item list (`{ label: 'Services', href: '/services', minLevel: 3 }` under the "Catalog" section) and the RBAC route table entry (`['/services', 3]`). | Remove the nav item; decide the route-table entry deliberately (Task 7.4) — the `/services` path still exists as the redirect from Task 7.3, so its gate must stay consistent with that redirect. `apps/admin/src/lib/middleware-access-matrix.test.ts` asserts `/services` is Manager-gated and must be updated in step with whatever is decided. |
| `apps/admin/src/lib/admin/nav-icons.ts` | Holds the `'/services': Sparkles` icon-map entry — an icon map, **not** the nav item list. | Remove the `/services` entry (Task 7.4). |

**Redirect Old Routes:**

```typescript
// apps/admin/src/app/services/page.tsx (new)
import { redirect } from 'next/navigation'

export default function ServicesRedirect() {
  redirect('https://cms.theroyalglow.in/admin/collections/service')
}
```

**Remove Write Endpoints:**

```typescript
// apps/admin/src/app/api/services/route.ts
export async function POST() {
  return Response.json(
    { success: false, error: { message: 'Service management moved to CMS' } },
    { status: 410 }
  )
}
```

---

## Database Connection Strategy

### Payload CMS Connection

Payload's own `postgresAdapter` continues to use whatever connection string is already configured in `apps/cms/src/payload.config.ts` (currently `process.env.DATABASE_URL`, per the existing file — this design does not change Payload's own DB config). No change to `payload.config.ts`'s `db` block is required.

### Sync Hook Connection (atomic same-transaction)

The `afterChange` hooks write `public.*` on **Payload's own request-scoped transaction handle** — resolved by the async `txDb(req)` as `adapter.sessions[await req.transactionID].db ?? adapter.drizzle` — NOT a separate pool and NOT `@rgss/db`'s edge `neon-http` client. Because `cms` and `public` are schemas in the same physical Neon database, the CMS write and the sync write share one transaction.

> **Do NOT use `req.payload.db.drizzle` directly.** The Task 2.0a spike confirmed that returns the base pool handle, which commits INDEPENDENTLY of Payload's transaction — reintroducing the exact divergence this design prevents. Use the session-bound handle via `txDb(req)`.

**Why on Payload's transaction, not a separate pool:**
- A separate pool commits independently → if Payload's transaction rolls back after `afterChange`, `public.*` keeps a row `cms.*` no longer has (silent divergence). Verified risk (Payload #8852; buildwithmatija "transaction trap").
- Writing on Payload's handle makes both schema writes atomic — commit together, roll back together — the only truly leak-free model.
- `@rgss/db`'s `neon-http` client is still avoided: a stateless edge/Workers `fetch` driver, unsuited to a persistent Node process and unable to join Payload's transaction.
- Only `@rgss/db/schema`'s table definitions are reused (structure), executed against Payload's handle.

**Why Safe:**
- Single transaction across both schemas → atomicity guarantees no divergence on failure (re-throw rolls back everything).
- No schema introspection (Payload owns `cms`; the sync targets `public` tables on the same connection).
- Gated by the Task 2.0a verification spike; outbox fallback documented if the handle can't do cross-schema writes on v3.85.

---

## Access Control (Corrected — Fix #5)

### Payload Access Control (Payload's own auth, not Better Auth)

Payload CMS runs its own independent authentication system via the `users` collection (`auth: true`, defined in `apps/cms/src/collections/Users.ts`). It is **explicitly separate** from Better Auth, which handles sessions for the web app (`theroyalglow.in`) and admin portal (`admin.theroyalglow.in`). There is no session bridge between the two systems, and this design does not introduce one.

The existing access helpers in `apps/cms/src/access/published.ts` are reused as-is — the same pattern every other collection in this CMS already follows:

```typescript
// apps/cms/src/collections/Service.ts and ServiceCategory.ts
import { adminsWrite, anyoneReads } from '../access/published'

access: {
  read: anyoneReads,   // () => true — any authenticated Payload user can read
  create: adminsWrite, // ({ req }) => Boolean(req.user) — any authenticated Payload user can write
  update: adminsWrite,
  delete: () => false, // DELETE DISABLED (Req 14.6) — retire via the isActive toggle, never hard-delete
}
```

> **Note:** `delete` is deliberately NOT `adminsWrite` here. Both service collections disable delete outright (Req 14.6) — this is the one place these collections diverge from the pattern the other CMS collections follow.

**Model:** Payload has no built-in per-collection RBAC roles configured in this project (no `role` field on `users`) — access is currently binary (authenticated vs. anonymous), matching every other collection. If finer-grained roles (e.g. restricting service price changes to a subset of CMS users) are wanted later, that requires adding a `role` field to `apps/cms/src/collections/Users.ts` first — out of scope for this migration, called out here so it isn't silently assumed to already exist.

**Authentication:** Payload's own built-in session cookie, issued by its `users` collection auth — not Better Auth.

---

## Testing Strategy

### Unit Tests (Vitest)

**File:** `apps/cms/src/hooks/__tests__/sync-service.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest'
import { syncServiceToPublic } from '../sync-service'

describe('syncServiceToPublic', () => {
  it('should insert on create', async () => {
    // Mock db.insert
    // Call hook with operation='create'
    // Assert db.insert called with correct data
  })

  it('should update on update', async () => {
    // Mock db.update
    // Call hook with operation='update'
    // Assert db.update called with correct where clause
  })

  it('should preserve createdAt timestamp', async () => {
    // Verify createdAt not modified during sync
  })

  it('should update updatedAt on update', async () => {
    // Verify updatedAt set to new Date()
  })

  it('should throw and log on sync failure', async () => {
    // Mock db.insert to throw
    // Assert error is logged and re-thrown
  })
})
```

### Integration Tests (Playwright)

**File:** `apps/cms/tests/service-sync.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test('service create syncs to Drizzle', async ({ page }) => {
  // Login to Payload as admin
  // Navigate to /admin/collections/service
  // Create new service
  // Query public.service via API
  // Assert service exists with correct data
})

test('service update syncs to Drizzle', async ({ page }) => {
  // Login, navigate to existing service
  // Update name field
  // Query public.service
  // Assert name updated
})

test('sync failure shows error to user', async ({ page }) => {
  // Mock Drizzle connection to fail
  // Attempt to create service
  // Assert 500 error displayed in UI
})
```

---

## Rollback Plan

### Emergency Rollback

If critical issues arise post-deployment:

1. **Disable the sync via the feature flag** (immediate, no code change — Req 15.3, 15.6):

```bash
# Set on the CMS service (Render env var) and restart. That's the whole rollback
# of the write path — the hooks stay registered but short-circuit.
SERVICE_SYNC_ENABLED=false
```

The hook reads this on every invocation via `isSyncEnabled()` (`apps/cms/src/lib/sync-db.ts`). Only an explicit `'false'` disables it, so a missing variable can never silently stop syncing.

> **Do NOT roll back by commenting out hook registrations.** That was the earlier plan and it is wrong for an incident: it needs a code edit, review, rebuild, and redeploy, which does not fit the 15-minute rollback window (Req 15.5). Source edits are the *last* resort, not the first.
>
> **Do NOT roll back the Payload migration** either — migrations are forward-only (Req 19.6). Leaving `cms.*` in its new shape is harmless once the flag is off.

2. **Restore Admin Write APIs** (within 15 minutes):

```bash
git revert <commit-that-removed-write-apis>
git push origin prod
# Trigger re-deploy
```

3. **Restore Admin UI** (optional):

```bash
git revert <commit-that-removed-ui>
git push origin prod
```

**No Data Loss:** Drizzle `public.service` data remains intact (hooks only write to it, never delete).

---

## Observability

### Logging

All sync operations emit structured JSON logs:

```json
{
  "level": "info",
  "message": "[sync] create service abc123 to public.service",
  "timestamp": "2026-06-08T10:30:00.000Z",
  "operation": "create",
  "collection": "service",
  "documentId": "abc123"
}
```

**Error Logs:**

```json
{
  "level": "error",
  "message": "[sync] failed to sync service abc123",
  "timestamp": "2026-06-08T10:30:00.000Z",
  "operation": "update",
  "collection": "service",
  "documentId": "abc123",
  "error": "Connection timeout",
  "stack": "..."
}
```

### Monitoring

**Metrics to Track:**
- Sync duration (p50, p95, p99)
- Sync failure rate
- Payload→Drizzle consistency checks (daily cron comparing counts)

**Alerts:**
- Sync failure rate > 1% over 5 minutes
- Sync duration p99 > 500ms

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Slug Generation Correctness (Services)

*For any* service with a non-empty name, the auto-generated slug SHALL be a lowercase, hyphen-separated string derived from the name with all special characters removed.

**Validates: Requirements 1.7**

### Property 2: Duration Value Correctness

*For any* service document, the `durationMinutes` value synced to Drizzle SHALL be one of the integers `15`, `30`, `45`, `60`, `90`, `120`, `150`, or `180` — i.e. a member of `SERVICE_DURATION_MINUTES`, never a value outside the Fixed_Duration_Set, and never left as a string (Payload `select` fields serialize as strings; the mapper's `Number()` coercion must produce a valid integer, not `NaN`). The test SHALL derive its expected set from the `SERVICE_DURATION_MINUTES` constant rather than restating the literals, so the property cannot drift from the source of truth.

**Validates: Requirements 1.9, 1.13**

### Property 3: Custom ID Format Correctness

*For any* service or category document created in Payload, the resulting `id` SHALL be a 21-character string composed only of characters from the alphabet `0-9A-Za-z-_` (matching `@rgss/db`'s `nanoid()` format) — never a Payload-default auto-increment integer or UUID.

**Validates: Requirements 1.8, 2.10**

### Property 4: Gems Conditional Validation

*For any* service document where `gemsRedeemable` is true, the `gemsRequired` field SHALL be a positive integer (> 0).

**Validates: Requirements 1.11**

### Property 5: Slug Generation Correctness (Categories)

*For any* service category with a non-empty name, the auto-generated slug SHALL be a lowercase, hyphen-separated string derived from the name with all special characters removed.

**Validates: Requirements 2.7**

### Property 6: Service Create Sync Correctness

*For any* service document created in Payload CMS, an identical row SHALL exist in Drizzle `public.service` table with matching field values.

**Validates: Requirements 3.1**

### Property 7: Service Update Sync Correctness

*For any* service document updated in Payload CMS, the corresponding row in Drizzle `public.service` (matched by `id`) SHALL reflect the updated field values.

**Validates: Requirements 3.2**

### Property 8: Category Create Sync Correctness

*For any* service category document created in Payload CMS, an identical row SHALL exist in Drizzle `public.service_category` table with matching field values.

**Validates: Requirements 3.3**

### Property 9: Category Update Sync Correctness

*For any* service category document updated in Payload CMS, the corresponding row in Drizzle `public.service_category` (matched by `id`) SHALL reflect the updated field values.

**Validates: Requirements 3.4**

### Property 10: CreatedAt Preservation

*For any* service or category document synced from Payload to Drizzle, the `createdAt` timestamp in Drizzle SHALL equal the `createdAt` timestamp from Payload (within 1 second to account for serialization).

> **Scope caveat (Task 5.0).** This property assumes `payload.create()` honors an explicit `createdAt`. Payload manages its own timestamps and may ignore the override. If the Task 5.0 spike shows it does not honor them, this property is RELAXED to apply only to post-seed live edits, and the seed instead writes `cms.*` rows directly via SQL to preserve the original timestamps.

**Validates: Requirements 3.7**

### Property 11: UpdatedAt Correctness

*For any* service or category document updated in Payload, the `updatedAt` timestamp in Drizzle SHALL be set to the current time (within 2 seconds of the sync operation).

**Validates: Requirements 3.8**

### Property 12: Sync Write Idempotency

*For any* service or category document, applying the create-path sync N times (N ≥ 1) with the same document SHALL produce exactly one row in `public.*` with that `id` and SHALL NOT raise a primary-key or unique-constraint error — the upsert converges rather than colliding. The row's `createdAt` SHALL remain that of the first write while all mutable fields reflect the latest document.

**Validates: Requirements 3.11**

### Property 13: Sync Flag Gating

*For any* service or category create/update, WHEN `SERVICE_SYNC_ENABLED` is `'false'` the hook SHALL perform NO write to `public.*`; for every other value of the variable (including unset), the sync SHALL execute. A disabled sync SHALL NOT throw, so the CMS write still succeeds.

**Validates: Requirements 3.12, 15.6**

---

## Dependencies

### New Dependencies

```json
{
  "dependencies": {
    "slugify": "^1.6.6",
    "nanoid": "^5.0.7"
  }
}
```

**Note:** `slugify` (slug generation) and `nanoid` (custom `id`) are the only new dependencies on the primary atomic path — the sync writes on Payload's existing connection, so no extra DB driver is needed. `pg` + `@types/pg` are added **only if** the Task 2.0a spike fails and the outbox fallback is adopted. Pin exact versions per workspace convention (no open ranges).

### Existing Dependencies

- `@rgss/db/schema` — table definitions only (types/structure, not the `db` client instance)
- `payload` — CMS framework (its postgres adapter provides the transaction-bound Drizzle handle used for the atomic write)
- `drizzle-orm` — Query builder (already present)

---

## Implementation Checklist

- [ ] Task 2.0a FIRST — verify Payload's transaction handle supports atomic cross-schema writes on `dev`
- [ ] Add `SERVICE_DURATION_MINUTES` to `packages/types/src/service.ts` (single source of truth for the 8 allowed durations)
- [ ] Repurpose `apps/cms/src/collections/Service.ts` — replace entire field set (fixed-duration select, custom nanoid `id`); set `delete: () => false`; compose `[syncServiceToPublic, ...revalidateHooks('service').afterChange]`; slug `service` unchanged
- [ ] Create `apps/cms/src/collections/ServiceCategory.ts` (new collection, custom nanoid `id`, `delete: () => false`, composed sync+revalidate hooks)
- [ ] Create `apps/cms/src/lib/sync-db.ts` (`txDb(req)` resolver + re-exported schema tables; no separate pool on primary path)
- [ ] Implement `apps/cms/src/hooks/sync-service.ts` (writes on `txDb(req)`, re-throws to roll back)
- [ ] Implement `apps/cms/src/hooks/sync-service-category.ts`
- [ ] Implement `mapPayloadToPublicService()` and `mapPayloadToPublicCategory()` mappers (incl. `durationMinutes` string→number coercion, `categoryId` relationship normalization)
- [ ] Add `slugify`, `nanoid` dependencies to `apps/cms/package.json` (+ `pg`/`@types/pg` only if outbox fallback)
- [ ] Add `isSyncEnabled()` + document `SERVICE_SYNC_ENABLED` in `apps/cms/.env.example`
- [ ] Task 3.0 — generate + review + apply the Payload migration (`payload migrate:create` → review SQL → verify `cms.service` row count → `payload migrate` on `dev` first)
- [ ] Create the drift-reconciliation QStash job (Task 13.1)
- [ ] Task 5.0 — verify `payload.create()` honors explicit `id`/`createdAt`/`updatedAt` on `dev` before writing the seed
- [ ] Create seed script `apps/cms/scripts/seed-services.ts`
- [ ] Write unit tests for sync hooks (mock `txDb`; assert re-throw rolls back)
- [ ] Write integration test: 20+ sequential create/update cycles end-to-end + one forced-rollback case asserting no `cms`/`public` divergence (Requirement 4.6)
- [ ] Write integration tests for end-to-end sync
- [ ] Remove admin write API routes (POST/PATCH endpoints)
- [ ] Task 6.6 (non-optional) — rewrite `apps/admin/src/app/api/services/services-mgmt.test.ts` so CI stays green
- [ ] Task 7.5 — delete the dead `getServices()` from `apps/web/src/lib/cms/client.ts` (KEEP the `Service` type)
- [ ] Task 7.4 — remove the `Services` nav item from `apps/admin/src/lib/rbac.ts` + the `/services` entry from `apps/admin/src/lib/admin/nav-icons.ts`, and reconcile the RBAC route table with the Task 7.3 redirect
- [ ] Remove admin UI pages for service management
- [ ] Add redirect from `/admin/services` → CMS
- [ ] Update Payload config to register `ServiceCategory` collection (`Service` already registered)
- [ ] Run seed script on staging
- [ ] Verify sync on staging (create + update test, incl. all 8 duration values from `SERVICE_DURATION_MINUTES`)
- [ ] Deploy to production
- [ ] Verify booking engine unchanged
- [ ] Update documentation

---

## Migration Day Checklist

**Pre-Deployment:**
- [ ] Backup `public.service` and `public.service_category` tables
- [ ] Verify seed script tested on staging
- [ ] Confirm admin users have Payload CMS access

**Deployment:**
- [ ] Verify `SELECT count(*) FROM cms.service` on the target branch BEFORE the destructive `id` type change (Req 19.4)
- [ ] Apply the Payload migration: `bun payload migrate` (generated + reviewed per Phase 0 / Task 3.0), per branch in `dev` → `test` → `pprd` → `prod` order
- [ ] Deploy CMS with the sync **disabled via the flag**: `SERVICE_SYNC_ENABLED=false` (no code edit)
- [ ] Run seed script: `SERVICE_SYNC_ENABLED=false bun run seed:services`
- [ ] Verify all services + categories in Payload
- [ ] Restore `SERVICE_SYNC_ENABLED` to enabled and restart the CMS
- [ ] Test create + update on staging
- [ ] Deploy admin portal (API removals + redirects)

**Post-Deployment:**
- [ ] Verify booking engine functional (place test booking)
- [ ] Monitor logs for sync errors (first 1 hour)
- [ ] Confirm no 410 errors from removed APIs

**Rollback Trigger:**
- Booking engine broken
- Sync failure rate > 10%
- Critical data inconsistency

---

## References

- **Requirements:** `.kiro/specs/payload-service-management/requirements.md`
- **Database Schema:** `packages/db/src/schema/service.ts`
- **Existing Service Collection:** `apps/cms/src/collections/Service.ts` (marketing, not booking)
- **Existing Payload Migration (only one):** `apps/cms/src/migrations/20260614_185535_initial.*`
- **Real Duration Data:** `packages/db/scripts/data/services-salon.ts`, `packages/db/scripts/data/services-spa.ts`
- **Duration Constant:** `packages/types/src/service.ts` (`SERVICE_DURATION_MINUTES`)
- **Drizzle Connection:** `packages/db/src/index.ts`
- **Migration Discipline:** `.kiro/steering/migration-discipline.md`
