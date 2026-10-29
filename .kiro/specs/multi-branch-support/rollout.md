# Multi-branch support v6: rollout and recovery

Status: planning specification, 27 October 2026. Target launch: 1 January 2027, conditional on all three gates below.
This document defines future implementation and operations; writing it does not execute migrations, workflows, cleanup, role changes, commits or deployments.

Neon state checked read-only through the Neon API on 27 October 2026 (project `divine-heart-60915941`):

- test (`br-floral-waterfall-aoag027c`) and pprd (`br-super-king-aoqdtfor`) have been archived since 23 September 2026. Neon's last recorded reset of both from production is 26 June 2026, so do not assume the daily replication workflow has been refreshing pprd.
- prod (`br-bold-cake-aotql242`) and dev (`br-rapid-block-aoh6m3q0`) are ready. prod is not marked as a protected branch.
- An archived backup branch, `prod-backup-2026-09-27-before-dev-copy` (`br-fragrant-cake-aop0swey`), was copied from production on 27 September 2026.
- Neon unarchives an archived branch when something connects to it, so even a read-only query changes its state. Treat any access to test, pprd or the backup branch as an operation.

That production bookings and invoices are test activity is still the user's statement; the clean-up allowlist must prove it record by record.
Do not infer available branches, configured secrets, successful backups or workflow run history from repository files.

## Release ownership and evidence

- Keep application DDL in `packages/db/migrations/` and Payload DDL in `apps/cms/src/migrations/`; preserve their separate ledgers.
- Follow generate → review SQL → commit → migrate, including schema, generated metadata and fingerprint references where applicable.
- Use an explicit direct `DATABASE_URL_UNPOOLED` for Drizzle; supply the direct connection through `DATABASE_URL` for Payload.
- Merge reviewed work into `dev` once, then promote the same validated commit through `dev → test → pprd → prod` using the promotion workflow.
- A Git promotion is not proof that either database schema migrated or that web, admin, CMS and invoicing deployed successfully.
- Record the source commit, deployed artifact revisions, migration ledger heads, environment/branch IDs and evidence links for every gate.
- Commits, workflow dispatch, provisioning and production actions belong to later implementation/operations tasks with the applicable authorization.
- Current Next.js baseline is 16.4.3 in web, admin and CMS. Only `apps/admin/next.config.ts` sets `experimental.turbopackFileSystemCacheForDev: false`; web and CMS also run `next dev --turbopack` and need the same setting (tasks §1). There is no dependency patch to merge.

## Gate 1: design and implementation readiness

Pass before scheduling a production migration window:

- Resolve v6 role, branch-context, service availability, invoice snapshot and CMS editing-authority rules into executable acceptance tests.
- Validate the booking/assignment constraints on disposable PostgreSQL, including simultaneous requests and the mixed SPA/hair cases.
- Verify membership reservations, completion debits and retries atomically; no-show releases return hours only within the original membership expiry.
- Verify removal/handover access loss across HTTP, page reads and existing realtime connections, including cross-branch record requests.
- Inventory every branch-owned read/write, aggregate, export, job, token capability and shared-customer projection; test negative access cases.
- Ensure real invoice issuance requires approved tax settings; provisional GST/SAC configuration is for pre-launch test activity only.
- Collect the relevant tests in their actual runners and require passing lint, types, schema checks and affected-app builds.
- Keep unrelated workspace edits separate from the release. Any failed or unavailable required check leaves this gate open.

## Additive migration and deployment order

1. Inventory source data, current ledgers and all writers, including jobs, old app instances and CMS hooks; identify incompatible versions.
2. Generate additive public-schema migrations first: new tables and nullable columns, compatible indexes and required extensions.
3. Review extension availability and constraint behavior on the disposable target; do not assume a configured production capability.
4. Generate compatible Payload migrations independently; record the public-schema prerequisites required by its new sync hooks.
5. Commit reviewed migration artifacts with the implementing code before applying them to shared environments.
6. Apply the additive public changes, then the compatible CMS changes; deploy readers/writers that understand both old and new rows.
7. Keep one authoritative writer for each catalogue/offer field during transition. Do not enable overlapping admin and CMS ownership.
8. Run the idempotent backfill with a preview, stable record IDs, resumable batches and recorded before/after counts.
9. Assign Rayasandra only to verified legacy rows; preserve explicit branch assignments and list ambiguous records for resolution.
10. Backfill role relationships, issuer snapshots, balances and assignment reservations using reviewed rules; never silently discard conflicts.
11. Reconcile both catalogue schemas, branch totals, membership reservations and invoice references; prove rerunning the backfill changes nothing.
12. Deploy every required writer, drain incompatible instances/jobs, and verify no new nullable or legacy-format rows are being created.
13. Apply forward migrations that enforce required columns and final constraints only after all validation queries pass.
14. Re-run database constraints and application acceptance tests, then enable branch functionality and the CMS offer write path.

For each environment, preserve this dependency order and both migration ledgers; never use schema push or edit applied migrations.
If a step fails, stop subsequent steps and retain the compatible additive state while preparing a forward repair.

### Current application migrations (29 October 2026)

Applied on Neon dev (`0000`–`0015`). Production has `0000`–`0003`.

| Migration | Kind |
| --- | --- |
| `0004_multi_branch_people` | Additive (references stay inactive) |
| `0005_multi_branch_backfill` | Backfill, idempotent, refuses ambiguous data |
| `0006_multi_branch_enforce` | Enforcement (NOT NULL Owner, checks, triggers) |
| `0007_multi_branch_memberships` | Additive (`selling_branch_id`, nullable) |
| `0008_realtime_revocation` | Additive (outbox table and enum) |
| `0009_multi_branch_notifications` | Additive (`branch_manager_missing` enum value) |
| `0010_branch_closures` | Additive (`holiday.branch_id`, nullable = all branches; per-branch partial unique indexes replace the one-per-date index) |
| `0011_branch_shutdown_guard` | Enforcement, hand-written (triggers: no new bookings or invoices at a shut-down branch; no shutdown while anything is open) |
| `0012_booking_reassignment` | Additive (`booking_reassignment` table and its two enums) |
| `0013_booking_reassignment_close` | Hand-written trigger: closes a booking's open reassignment work when the booking ends |
| `0014_booking_assignee_guard` | Enforcement, hand-written (trigger `booking_assignee_guard`: an assignee must work at the booking's branch; not on approved leave on a confirmed booking's day) |
| `0015_booking_assignee_guard_leave_date` | Fix for `0014`: compares the text leave date with the booking date correctly. Apply together with `0014`; on its own, `0014` refuses every assignment |

Drizzle applies migrations strictly in journal order, so `0007`–`0015` can't
go in before `0005`–`0006`, and the new code needs `0007`–`0015`. Recommended
production sequence: pause role and staff changes, apply `0004`–`0015` in one
run, then deploy the code straight away. Between the two, the old code's role
and staff writes fail closed (the `0006` checks and triggers reject them)
instead of writing unkeyed rows; every other old-code path keeps working,
because the remaining changes are additive or refuse writes only at a
shut-down branch or with an assignee who doesn't work at the branch. Existing
holidays become all-branches closures (`branch_id` null). Before applying
`0011`, check production for a branch already marked `shutdown`: from then on
it takes no new bookings or invoices. Before applying `0014`, check for
pending or confirmed bookings whose assignee no longer works at their branch:
they stay as they are (the trigger checks new writes only), but they can't be
approved or reassigned to that person; list them for reception. Reset `test`
and `pprd` from production afterwards.

Before launch, also: issue admin realtime tokens from an Ably key with
"Revocable tokens" enabled (a reviewed key cutover: switch `ABLY_PRIVATE_KEY`,
then wait for old tokens to expire); register the two new QStash schedules
(`missing-manager-reminder`, `realtime-revocations`) and the
`BETTER_STACK_HEARTBEAT_MISSING_MANAGER` monitor. A later enforcement migration
sets NOT NULL on `lead.branch_id`, `waitlist.branch_id`,
`customer_note.branch_id` and `spa_membership.selling_branch_id` once the
backfill reports no nulls.

## Gate 2: isolated migration and recovery rehearsal

Pass using the exact candidate migrations, cleanup implementation and release artifacts intended for production:

- Verify live branch availability and identity read-only before choosing the rehearsal target.
- If test/pprd are unavailable, provision a temporary isolated Neon rehearsal database and record its mapping to the missing environment stage.
- Keep Git promotion order unchanged; an isolated database rehearsal does not silently waive configured test/pprd deployment checks.
- Quarantine the target from application traffic and outbound email, messages, jobs, analytics and production storage writes before copying data.
- Use dedicated test credentials and storage. Copied sessions, OAuth tokens, lead contacts, notes and other PII remain restricted until sanitized or destroyed.
- The existing replication script is not a complete sanitizer or proof that an archived branch can be restored; review and close its coverage gaps first.
- Restore the selected full backup into an empty temporary target, then rehearse additive migration, backfill, enforcement and cleanup.
- Exercise failure/retry and recovery boundaries between Drizzle migration, CMS migration, app deployment and CMS ownership cutover.
- Run acceptance tests against actual PostgreSQL and the deployed rehearsal apps; record passing results and unresolved operational dependencies.
- Rehearse teardown, revoke temporary credentials and delete isolated copies when evidence is retained; retain only approved redacted reports.

## Full backup and restore requirements

- The four-table catalogue backup is insufficient for branch/role, invoice, membership or cleanup work.
- The weekly workflow provides a full database dump starting point; a gzip check alone does not prove it is restorable.
- Quiesce writes for the operation, including CMS saves and job consumers, or capture one exported database snapshot for dump and manifest queries.
- Create a manifest binding backup checksum/object version, creation time, database identity, commit and both migration ledgers to that snapshot.
- Include table inventory, exact row counts, schema/constraint fingerprints and critical sums: invoice/payment amounts, gems and membership balances/reservations.
- Include relevant R2 invoice/media object inventories and versions or recovery references; a database dump does not contain object bytes or provider queues.
- Restore that exact named artifact, not an unqualified latest backup, into the verified empty disposable target.
- Fail immediately on dump/restore errors: check pipeline exit status and use `psql -v ON_ERROR_STOP=1` or the equivalent fail-fast restore mode.
- Compare restored rows, schema, ledgers and critical sums with the consistent-snapshot manifest; printed counts without assertions do not pass.
- Run representative read and invariant checks, record the successful restore duration, and confirm the recovery target meets the agreed outage window.
- The current monthly workflow needs these checks and isolated-target handling before its green status can serve as release evidence.
- Keep backup data, credentials and PII quarantined through verification and teardown; never expose copied production credentials to test clients.

## Cleanup preparation and execution

Cleanup is a separately reviewed production operation, not a migration side effect or a generic smoke test.

1. Produce an explicit allowlist of verified test record IDs and dependent rows; unknown provenance blocks deletion of that record.
2. Preview affected tables, row counts, financial totals, retained references, derived fields and object/queue work without writing anything.
3. Preserve every customer account and intended profile/consent, staff record, branch/owner assignment, schedule, catalogue and setting.
4. Preserve approved real CMS offers and their public mirrors; remove only allowlisted test offers/redemptions in the required foreign-key order. Offers created in the admin portal before the Payload cutover are test data by user decision and are not migrated; they still go through this allowlist and preview.
5. Preserve any real booking, invoice, payment, membership, balance or reservation discovered during review; revise the test-data assumption accordingly.
6. Pause intake and CMS writes; pause scheduled publishers and consumers, then drain or cancel only identified test deliveries and retries.
7. Include invoice/email jobs, reminders and deduplication/outbox state in the inventory so old requests cannot recreate or notify about deleted data.
8. Capture and restore-verify the full backup after quiescence; approve the reviewed manifest and exact cleanup preview for that window.
9. Run the allowlisted cleanup atomically where practical, or in journaled resumable phases whose retry and recovery behavior was rehearsed.
10. Recompute derived test visit/spend counters and summaries from retained records; reconcile gems balances against retained ledger entries.
11. Reset no-show/late-cancellation counters, approval flags or risk tags only where test provenance is established; preserve real/manual decisions.
12. Release test membership reservations without extending original expiry; preserve all real memberships and their valid outstanding obligations.
13. Never restart an invoice sequence if any real invoice exists in the affected series/financial year, including issued copies outside the database.
14. A test-only sequence reset requires explicit verified evidence and reconciliation of stored PDFs, queued renders and deduplication identifiers.
15. Reconcile retained CMS/public offers and availability; do not rely on a future CMS save or a detect-only drift job to restore missing mirrors.
16. Verify preserved accounts/roles, valid branch assignments, financial invariants and absence of test deliveries before resuming consumers and intake.

## Gate 3: production go/no-go

- Gates 1 and 2 pass, the exact release and cleanup evidence is approved, and the current backup has a successful verified restore.
- Real branch details, owners, managers or documented coverage, schedules, closures and catalogue availability are checked end to end.
- Approved GST/SAC/legal issuer settings replace provisional test values before real invoicing; historical issuer snapshots remain immutable.
- Cross-branch isolation, staff conflicts, membership accounting, offer application, invoice rendering and branch-specific notifications pass production-safe checks.
- Operators have the recovery owner, escalation route, maintenance controls, monitoring and rollback decision thresholds available for the launch window.
- Any unresolved isolation, accounting, concurrency, migration or recovery failure is a no-go, regardless of the calendar date.

## Recovery and schedule

Use a forward migration for schema defects; do not run destructive down/reset migrations against production.
Rollback application binaries only when the compatibility matrix proves they can read and write the current public and CMS schemas safely.
If that is unsafe, maintain the write pause and repair forward; prevent older admin writes from competing with CMS-owned offers.
Disabling sync alone is not rollback: it permits divergence. Freeze affected authoring, reconcile both schemas and verify parity before reopening it.
Restore from backup only as an explicitly authorized recovery operation; account for writes, objects and external deliveries after the snapshot.
Restore/repair the paired application and CMS state together, revalidate both ledgers, then resume queues with duplicate-delivery controls.
The 1 January 2027 date remains conditional; no fixed effort estimate or automatic waiver follows from this plan.
Sequence work through the three gates, preserve recovery/testing time and defer optional scope or the launch date when required evidence is missing.

## Implementation references

- [Migration discipline](../../steering/migration-discipline.md), [promotion workflow](../../../.github/workflows/promote.yml), [CMS migration workflow](../../../.github/workflows/cms-migrate.yml).
- [Catalogue backup](../../../.github/workflows/pre-migration-backup.yml), [weekly full dump](../../../.github/workflows/weekly-backup.yml), [current restore test](../../../.github/workflows/monthly-backup-test.yml).
- [Replication workflow](../../../.github/workflows/replicate-prod-to-pprd.yml), [current sanitizer](../../../scripts/anonymize-preprod.ts), [transaction resolver](../../../apps/cms/src/lib/sync-db.ts).
- [Service sync](../../../apps/cms/src/hooks/sync-service.ts), [drift detection](../../../apps/admin/src/app/api/jobs/service-drift-reconcile/route.ts), [invoice storage](../../../apps/invoicing/src/storage/r2.ts).
