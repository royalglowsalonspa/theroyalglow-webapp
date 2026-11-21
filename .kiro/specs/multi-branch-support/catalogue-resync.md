# Developer catalogue resync

Implementation design for the repair item of [tasks](tasks.md) §6 (R4.7,
[design](design.md) §5). It follows [catalogue availability](catalogue-availability.md)
and [offers](offers.md), which made a normal save recreate a missing mirror
and taught the nightly drift job about availability and offers.

## Today (before this slice)

- A CMS save mirrors its document into `public.*` in the save's transaction,
  so the next save of a document repairs its mirror.
- `service-drift-reconcile` (Job 20) logs the differences each night and
  withholds its heartbeat. Nobody can repair a record without saving it again
  in the CMS, and there is no view of the findings outside the logs.

## Decisions

- **Where.** A Developer-only panel, "Catalogue sync", on the admin portal's
  Integrations page (`/integrations`, already Developer-only), backed by
  `GET` and `POST /api/catalogue-sync` (`requireRole('developer')`, route
  policy `developer`). The admin portal keeps no catalogue authoring: the
  resync only copies Payload's current row into its mirror, so Payload stays
  the source of truth (R4.6). The admin AGENTS.md notes this as the one
  catalogue write the admin portal makes.
- **Report.** `GET` runs the same comparison as Job 20 on demand and groups
  the findings by record: category, service or offer, its id and name, what
  differs (field, CMS value, mirror value), and the CMS row's revision (its
  `updated_at`, to the millisecond). A record missing from the mirror or
  differing from it can be resynced; a mirror row with no CMS row can't
  (nothing is deleted), and the panel says to recreate or retire it in the CMS.
- **Resync.** `POST { records: [{ table, id, cmsUpdatedAt }] }`, at most 25
  records, de-duplicated and processed categories first, then services, then
  offers, so a service's category mirror exists before the service. Each
  record is one transaction (`db.batch`):
  1. lock the CMS row (`FOR UPDATE`) and check its `updated_at` still equals
     the revision the report showed, else abort (409 `CATALOGUE_CHANGED`);
     a CMS save in flight holds the same row, so the resync waits for it and
     then refuses, and a save that starts later overwrites the resync with
     newer values;
  2. upsert the mirror from the CMS row, mapped exactly as the sync hooks map
     it (and as the drift read compares it), with the CMS timestamps;
  3. replace the join rows (`service_branch`, `service_category_branch`,
     `offer_service`);
  4. an offer without a checkout rule retires its mirror instead
     (`is_active = false`, last rule kept).
- **Dependencies, checked before the write.** A service's category must have
  its mirror; branches the CMS lists must exist; an offer's linked services
  must be in the catalogue. Otherwise 409 `CONFLICT` names what to fix, and
  nothing is written.
- **Retry-safe.** Every write is an idempotent upsert or replacement, so a
  retried or repeated resync converges on the same rows.
- **Parity and audit.** After the records are processed, the route reads the
  snapshot again and reports, per record, the outcome (`created`, `updated`,
  `retired`, `changed`, `refused` or `failed`) and any difference that
  remains. Every attempt is written to the audit log with the Developer as
  actor, the record, its findings before and the outcome and remaining
  findings after (best-effort, as other admin audits).
- **Job 20 stays detect-only.** Its log message points at Integrations →
  Catalogue sync.

## Out of scope

Deleting mirror rows, resyncing from an older CMS version (restore the
version in the CMS instead), CMS roles, and repairing CMS-side data.

## As built (21 November 2026, Neon dev)

No migration: the resync reads the `cms` tables and writes the existing
mirrors.

| Part | Where |
| --- | --- |
| Request schema, `MAX_RESYNC_RECORDS` (25) | `packages/types/src/catalogue-sync.ts` |
| Report grouping, names, order, what remains | `packages/business/src/jobs/catalogue-resync.ts` |
| Revisions and the per-record transaction | `packages/db/src/queries/catalogue-resync.ts` |
| `GET`/`POST /api/catalogue-sync` | `apps/admin/src/app/api/catalogue-sync/route.ts` |
| Catalogue sync panel on Integrations | `apps/admin/src/app/integrations/catalogue-sync-panel.tsx` |
| Error code `CATALOGUE_CHANGED` | `packages/errors/src/codes.ts` |

Behaviour as built:

- Outcomes: `created`, `updated`, `retired`, `unchanged` (an offer without a
  rule whose mirror was already retired), `changed` (409
  `CATALOGUE_CHANGED`), `refused` (another 409: a dependency, an offer rule
  without dates or one the mirror check refuses) and `failed` (anything else,
  logged).
- The refusals name what to fix: "Its category … has no mirror yet. Resync the
  category first, or with it.", "The CMS lists branches that don't exist: ….",
  "Its services have no mirror yet: …."
- The mirror gets the CMS row's `created_at` and `updated_at`, so the drift
  read sees both sides alike, timestamps included. An offer mirror keeps its
  creation time, as the sync hook keeps it.
- Job 20's drift log names the repair path.

Verified:

- Unit: business helpers (6), the route (10: report, dependency order,
  outcomes, de-duplication, validation, Developer only, audit) and the panel
  (3).
- Live, `packages/db/src/queries/catalogue-resync.integration.test.ts` (6):
  missing mirrors created from CMS rows (a service only after its category),
  both sides then alike in the drift read; an out-of-band edit put back and a
  rerun idempotent; a stale or vanished revision refused with nothing
  written; a resync waiting on a CMS save that holds the row (`pg_sleep` in
  the same transaction) refuses afterwards; unknown branches and unmirrored
  services refused by name; a rule-free offer's mirror retired with its last
  rule kept.
