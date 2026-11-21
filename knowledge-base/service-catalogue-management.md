# Service Catalogue Management

> **Services and service categories are managed in Payload CMS**, at `https://cms.theroyalglow.in/admin/collections/service` and `.../service_category`. The admin portal no longer creates or edits them. The booking engine is unchanged — it still reads `public.service` / `public.service_category` through Drizzle.

**Write in CMS, read from Drizzle.** Payload is the authoring source of truth; an `afterChange` hook mirrors each write into the `public` tables inside the same database transaction. Every customer-facing read surface keeps reading `public.*`, so nothing downstream knows Payload exists.

For the one-time migration itself — backup, per-branch checklist, rollback — see [service-catalogue-migration.md](./service-catalogue-migration.md).

## Where to manage what

| Task | Where | Notes |
|------|-------|-------|
| Create / edit a service | CMS → `service` collection | Name, category, price, duration, buffer, description, image URL, display order, gems config, SAC code (optional), branches offered at |
| Create / edit a category | CMS → `service_category` collection | Name, `serviceType` (`salon` / `spa`), SAC code (required), branches offered at, display order |
| Choose where it's offered | CMS → "Offered at" on the category or service | All branches (default, includes branches opened later) or Selected branches. See [Branch availability](#branch-availability) |
| See or restore an earlier version | CMS → the document's Versions tab | Every save is kept, with who saved it. See [Version history](#version-history) |
| Retire a service or category | CMS → set `isActive` to false | **Delete is disabled on both collections.** Hard deletes are blocked at the access layer (`delete: () => false`), matching the never-hard-delete DB convention and avoiding the `ON DELETE RESTRICT` foreign key on `booking_service.service_id` |
| Reorder display | CMS → `displayOrder` | Lower first, within a category |
| Assign staff to a service | Admin portal → Staff | `staff_service` is not part of the CMS collections |
| Create / edit an offer, attach its services | CMS → `offer` collection, "Checkout rule" | The admin portal's Offers page is read-only. See [Offers](#offers) |

**Access:** Payload's own authentication (the `users` collection with `auth: true`), not Better Auth. Writes require an authenticated Payload user (`adminsWrite`); reads use `anyoneReads`. Payload's session system is entirely separate from the web/admin apps' Better Auth sessions — a CMS account is provisioned separately.

**Admin portal:** `admin.theroyalglow.in/services` still exists but is a Manager-gated redirect to the CMS collection. The sidebar entry is gone. The four write endpoints are permanently retired:

| Endpoint | Response |
|----------|----------|
| `POST /api/services` | `410` `ENDPOINT_GONE` — "Service management moved to CMS…" |
| `PATCH /api/services/[id]` | `410` `ENDPOINT_GONE` |
| `POST /api/service-categories` | `410` `ENDPOINT_GONE` |
| `PATCH /api/service-categories/[id]` | `410` `ENDPOINT_GONE` |

`GET /api/services` and `GET /api/services/all` still read the catalogue. The lead screens and membership session recording read `GET /api/services`, which also carries each service's `availableBranchIds` (null = every branch), so the session dialog lists only the active branch's services. `services/all` feeds the staff skills picker and lists every service. The walk-in page reads the catalogue directly and lists only what the active branch offers.

## Field rules enforced by the CMS

| Field | Rule |
|-------|------|
| `id` | 21-character `nanoid`, generated in a `beforeValidate` hook. Overrides Payload's default auto-increment integer id so the `cms.*` and `public.*` ID spaces stay identical — the FK columns on `booking_service`, `staff_service`, `offer_service` and `waitlist` all reference `public.service.id` |
| `slug` | Auto-generated from the name (`slugify({ lower: true, strict: true })`) in a `beforeChange` hook |
| `durationMinutes` | Fixed `select` of 8 values — 15, 30, 45, 60, 90, 120, 150, 180 — derived from `SERVICE_DURATION_MINUTES` in `packages/types/src/service.ts`, the single source of truth. The 8 values come from an audit of the real 57-service catalogue |
| `pricePaise` | Integer, minimum 0. Paise, GST-inclusive; an invoice taxes it at the branch's rate in force for the service's SAC code |
| `gemsRequired` | Required and greater than 0 whenever `gemsRedeemable` is true (`beforeValidate`) |
| `serviceType` (category) | `salon` or `spa` |
| `sacCode` | A select of the reviewed codes, `REVIEWED_SAC_CODES` in `packages/types` (999721 hair care, 999722 facial and cosmetic care, 999723 spa and massage, 999729 other beauty treatments). Required on a category; optional on a service, where empty means the category's code applies |
| `availability` | Radio, required: `all` (default) or `selected`. "All branches" includes branches opened later |
| `availableBranches` | Branch ids, shown only for `selected`. At least one is required; on save every id must name a branch in `public.branch`. Cleared when `all` is chosen |
| `editedBy` | Read-only, in the sidebar. Set on every save and restore to the CMS login's email (`system` for a script) |

**Adding a duration value later costs two steps**, not zero: Payload backs a `select` with a `cms`-schema enum, so (1) edit `SERVICE_DURATION_MINUTES`, then (2) run one `payload migrate:create` plus `payload migrate` per branch. `public.service.duration_minutes` stays a plain `integer` with no CHECK constraint, so no Drizzle migration and no booking-engine change is involved.

## Branch availability

Each category and each service is offered at **All branches** (the default) or at **Selected branches** (multi-branch R4.2, `.kiro/specs/multi-branch-support/catalogue-availability.md`). A service is offered at a branch only when its own choice and its category's both include the branch, so a category limited to Rayasandra limits every service in it. "All branches" includes branches opened later; to stop offering something everywhere, untick Active instead.

- **Picker.** Branches live in the admin portal (`public.branch`), not in Payload. The field lists them from the CMS endpoint `GET /api/catalogue-branches` (CMS login required) and hides shut-down branches unless one is already chosen.
- **Where it applies.** The website's services list, a service's page, `llms.txt` and `llms-full.txt` say "Only at …" for a restricted service, naming public branches only. The booking dialog, the gems "Redeem at" picker, the walk-in page and the membership session dialog list only what the chosen branch offers.
- **Enforcement.** The booking, walk-in, session and gems redemption routes refuse a service the branch doesn't offer (400, naming it). The database refuses the same lines (`booking_service_availability_guard`, migration 0034); a refusal caused by a catalogue change after the route's check answers 409 `CONFLICT`, and nothing is written.
- **Existing bookings.** Limiting a service never changes bookings already made. The admin dashboard lists the active branch's pending and confirmed bookings, from today on, with a service it no longer offers, for reception to keep, cancel or rebook.

## Version history

Services and categories keep every saved version (`versions: { maxPerDoc: 0 }`, no drafts): a save publishes straight away, as before. The Versions tab compares and restores earlier versions; a restore is a save, so it syncs and revalidates like one. Payload's version records don't name the editor, so each version carries `editedBy`, the CMS login that saved it. Versions start with the first save after the CMS migration `20261031_015028_catalogue_tax_versions_availability`.

## Offers

A CMS offer is the website card plus an optional **Checkout rule** (multi-branch R4.5–R4.8, `.kiro/specs/multi-branch-support/offers.md`):

- **Rule.** None (a card only, the default), a percentage (1–100), a flat amount or a combo price, with the services it covers and terms shown at the counter. The card's Valid from and Valid until bound the rule too, as IST calendar days, inclusive; a rule needs both.
- **Show on website.** On by default. Off keeps a counter-only discount off `/offers`; the card image is required only while it is shown.
- **Validation on save.** The rule's value is required and in range; it links at least one service, and a combo at least two. Every linked service must be an active salon service in an active category, read from `public.*` in the save's transaction.
- **Mirror.** An offer with a rule is upserted into `public.offer` as `cms_offer_<id>` (slug `cms-offer-<id>`), with its `offer_service` rows replaced, by the same transactional `afterChange` sync as services. Removing the rule retires the mirror (`is_active = false`, last rule kept). While `SERVICE_SYNC_ENABLED=false`, a save that has or had a rule is refused; card-only saves go through.
- **Retire, don't delete.** Untick Active to retire the whole offer; delete is disabled. Every version is kept with `editedBy`, as on services.
- **At checkout.** The receptionist picks one of the offers that apply to the booking, with its saving. The discount covers the booking's linked lines only (a combo needs all of them). One offer per customer per IST day, at any branch; the invoice keeps the rule as applied.

The admin-made offers from before the move stay in `public.offer` without a `cms_id`. The admin portal labels them test offers, they are not migrated, and the nightly expiry job retires them after their end date.

## Repair

Job 20 only reports drift. The repair is explicit and Developer-only: admin portal → **Integrations → Catalogue sync** (`GET`/`POST /api/catalogue-sync`, `.kiro/specs/multi-branch-support/catalogue-resync.md`).

- The panel lists each category, service or offer whose mirror is missing or differs, with the fields that differ. A mirror with no CMS row is listed but never deleted: recreate or retire it in the CMS.
- **Resync** copies the CMS row as it is now into its mirror, up to 25 records at a time, categories first, then services, then offers. Each record is one transaction, written only while the CMS row is still at the revision the panel showed; if someone saved it since (or is saving it), that record is refused with "changed in the CMS since this report" and nothing is written.
- Missing dependencies are refused by name: a service whose category has no mirror, branches that don't exist, an offer whose services have no mirror.
- Every attempt is audited, and the panel reports what still differs afterwards.

## How the sync works

```text
Payload admin save
  └─ cms.service write (Payload's transaction, still uncommitted)
       └─ afterChange: syncServiceToPublic
            ├─ isSyncEnabled() false? → log + return, no public write
            ├─ txDb(req) → the Drizzle handle bound to THAT transaction
            ├─ mapPayloadToPublicService(doc) → snake_case row (sac_code, all_branches included)
            ├─ create or update: INSERT … ON CONFLICT (id) DO UPDATE  (idempotent;
            │  a save recreates a missing mirror row)
            ├─ replace the document's service_branch rows (none for All branches)
            └─ on error: structured error log + re-throw
       └─ revalidateHooks('service') → WEB_APP_URL/api/revalidate
  └─ COMMIT — cms.* and public.* land together, or neither does
```

The category hook does the same for `public.service_category` and `service_category_branch`.

| Piece | File |
|-------|------|
| Transaction-handle resolver + feature flag | `apps/cms/src/lib/sync-db.ts` |
| Service sync hook | `apps/cms/src/hooks/sync-service.ts` |
| Category sync hook | `apps/cms/src/hooks/sync-service-category.ts` |
| Field mappers (pure) | `apps/cms/src/hooks/mappers.ts` |
| Collections | `apps/cms/src/collections/Service.ts`, `ServiceCategory.ts` |
| One-time seed | `apps/cms/scripts/seed-services.ts` |

**Atomicity is the whole design.** The write goes on Payload's own request-scoped transaction handle — `adapter.sessions[await req.transactionID].db`, resolved by `txDb(req)` — because `cms` and `public` are schemas in the same physical Neon database. A separate connection pool would commit independently, so a later rollback would leave `public.*` holding a row `cms.*` no longer has. `req.payload.db.drizzle` is that separate pool and must never be used directly. `@rgss/db`'s exported `db` client is also avoided: it is the `neon-http` edge driver and cannot join a transaction.

**Cache freshness.** The sync hook is composed *with* the pre-existing `revalidateHooks('service')`, never in place of it, so an edit pings `WEB_APP_URL/api/revalidate` → `revalidatePath('/', 'layout')` and `/services`, `/services/[slug]` and the booking dialog reflect it within seconds.

**Feature flag.** `SERVICE_SYNC_ENABLED` (`apps/cms`) gates the hooks. Only the literal string `false` disables the sync — an unset variable is the enabled state, so a missing env var can never silently stop syncing. It exists for two reasons: the seed script must run with it off, and it is the primary rollback lever (env change plus restart, no code edit).

## Failure modes

| Mode | What happens | What you see | Response |
|------|--------------|--------------|----------|
| Sync write fails (constraint, type, timeout) | Hook logs at `error` level with document id, operation, stack and `durationMs`, then re-throws. Payload rolls back the **whole** transaction | The CMS save fails with HTTP 500 "Failed to sync service data". No row in `cms.*`, no row in `public.*` | Read the log, fix the input or the cause, save again. There is nothing to reconcile — a failed sync writes nothing anywhere |
| Database unreachable | Same path, bounded by the connection/statement timeout (≤5 s) so the admin save fails fast instead of hanging | Failed save, error log | Check Neon; retry the save |
| `SERVICE_SYNC_ENABLED=false` left on | CMS writes succeed against `cms.*`; `public.*` is not touched and nothing throws | Editors see saves succeed while the website never changes — the quietest failure in this system | Job 20 catches it within a day. Re-enable the flag, then reconcile by hand |
| Direct SQL edit against `public.*` | Bypasses the CMS entirely; `cms.*` still holds the old value. The next CMS edit of that row overwrites the manual change | Divergence with no error anywhere | Don't do it. Job 20 reports it; fix by re-saving the correct values in the CMS |
| Duplicate id on the create path | `ON CONFLICT (id) DO UPDATE` converges instead of colliding. `id` and `createdAt` are excluded from the update set, so the original creation timestamp survives | Nothing — by design | None |
| Mirror row missing on an update | The update path upserts too, so the save recreates the `public.*` row (multi-branch R4.7) | Nothing — the next save repairs it | Job 20 reports the gap until someone saves the document, or the Developer resyncs it (see [Repair](#repair)) |
| Selected branches with none chosen, or an unknown id | Field validation refuses the save before any write | "Choose at least one branch…" or "No branch has the id …" on the field | Choose branches again, or choose All branches |
| A chosen branch is deleted later | The join row cascades away; if it was the only one, the service is offered nowhere | The website says "Not offered at any branch right now"; the routes refuse it | Edit the document: choose branches again, or All branches |
| `public` schema without migration 0033 | The hooks write `all_branches` and the join tables, so every catalogue save fails and rolls back | HTTP 500 on save, error log | Apply the application migrations before deploying the CMS (see the multi-branch rollout) |
| `public` schema without migration 0035 | The offer hook writes `cms_id` and `show_on_website`, so an offer save with a checkout rule fails and rolls back; card-only saves still work | HTTP 500 on save, error log | Apply the application migrations before deploying the CMS |
| An offer's linked service is retired, or moved to SPA, later | The mirror keeps the link; checkout only discounts lines the booking has, and the next offer save refuses the link | "… isn't active." or "Offers apply to salon services only: …" on the next save | Edit the offer's services |
| Re-running the seed | Payload rejects a duplicate `id` in its own validation before the hook runs; the script's `cms.*` id skip-set means it skips instead | "created 0, skipped N" | None |

**Safety net — Job 20, `service-drift-reconcile`.** A daily QStash job (`45 18 * * *` UTC = 00:15 IST) compares `cms.service` ↔ `public.service` and `cms.service_category` ↔ `public.service_category` on row counts, ids and field values, including SAC codes, "all branches" and the branch lists (Payload's `<collection>_texts` rows against the join tables). It is read-only: it detects and alerts, never repairs, so a human reviews any divergence. It pings `BETTER_STACK_HEARTBEAT_SERVICE_DRIFT` **only on a clean run**, so drift trips the monitor by withholding the heartbeat. Full detail in [background-jobs.md](./background-jobs.md).

### Two caveats that look like drift and are not

1. **A CMS-originated create leaves `public.*.updated_at` fresher than `cms.*`.** The mapper omits `updatedAt` on the create path, so `public.*` takes the column default `now()` while `cms.*` keeps Payload's value. `created_at` **is** preserved on both. Job 20 does not flag it — both are written in the same request, well inside its 1-second tolerance.
2. **Timestamps match only to the millisecond.** Payload's `cms.*` timestamp columns are precision 3; `public.*` keeps microseconds (max observed delta 0.0004 s). Any comparison needs a tolerance — Job 20 uses `DRIFT_TIMESTAMP_TOLERANCE_MS` (1 s).

## Read surfaces

| Surface | Reads |
|---------|-------|
| `/services`, `/services/[slug]` | `GET /api/services` (client), `getServiceBySlug` → `public.*` |
| `GET /api/services` (web) | `getActiveCatalogue` → `public.*`, plus `availabilityNote` from `getPublicBranches` |
| Branch availability | `public.service.all_branches`, `public.service_category.all_branches`, `service_branch`, `service_category_branch` (`availableBranchIds` on every catalogue read) |
| Booking dialog + availability | `public.service.duration_minutes`, `buffer_minutes` |
| Pricing display | `public.service.price_paise` |
| Active filtering / grouping | `public.service.is_active`, `category_id` |
| Admin `GET /api/services`, `/api/services/all` | `public.*` |
| Payload MCP (`findService`, `findServiceCategory`) | `cms.*`, read-only |

## References

- [service-catalogue-migration.md](./service-catalogue-migration.md) — deployment checklist, backup, rollback
- [background-jobs.md](./background-jobs.md) — Job 20, drift reconciliation
- [database-schema.md](./database-schema.md) — `service` / `service_category` table definitions
- [payload-mcp.md](./payload-mcp.md) — read-only CMS access for AI agents
- [pages/admin.md](./pages/admin.md) — admin portal pages, including the `/services` redirect
- `.kiro/specs/payload-service-management/` — requirements, design, tasks
- `.kiro/specs/multi-branch-support/catalogue-availability.md` — SAC codes, version history and branch availability (design and as built)
