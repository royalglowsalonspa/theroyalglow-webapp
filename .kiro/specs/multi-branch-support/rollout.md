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

### Current application migrations (31 October 2026)

Applied on Neon dev (`0000`–`0034`). Production has `0000`–`0003`.

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
| `0016_membership_tier_tax_and_checks` | Additive plus checks: tier `sac_code` (default `999723`, six digits), tier usual values not negative and validity above 0, membership minutes above 0 and within the total, expiry after start. Before applying, check production has no membership that breaks these (none exist today) |
| `0017_tax_versions_and_invoice_snapshots` | Additive plus checks, generated then hand-edited: `branch_tax_version` and `invoice_sequence` tables; branch `legal_name`, `gstin`, `invoice_prefix` (backfilled from a 1–4 character code, else `B` and the number in base 36, then NOT NULL and unique); SAC codes on categories and services; invoice issue snapshot and per-line tax columns with their checks (only rows with a tax point); one invoice per booking; `monthly_gst_summary` unique per month, branch, issuer GSTIN and SAC code instead of per month |
| `0018_tax_guards_and_seed` | Enforcement and seed, hand-written: every new invoice needs its snapshot, issued facts and lines can't change, a line must use the branch's rate in force; a branch's prefix is fixed once it has issued; versions can't change or be deleted while in force; category SAC codes by slug; a provisional 5% for every branch and reviewed SAC code from 22/09/2025, copied to branches created later; the `gst` setting deleted |
| `0019_branch_settings` | Additive, generated: `branch_setting` (one row per branch and revision holding both sections, which section the save changed and who saved it; unique per branch and revision) and the `branch_setting_section` enum; `booking.settings_revision` with a composite foreign key to its own branch's revisions; `booking_status_log.settings_revision` |
| `0020_branch_settings_guards` | Backfill and enforcement, hand-written, rerunnable: the documented defaults as SQL functions; revision 1 for every branch from the shared `business_hours` and `booking_rules` settings (else the defaults; the two new reschedule rules from the defaults); a branch created later starts from the primary branch's current settings; revisions are numbered without gaps and can't change, or be deleted while their branch exists; the shared rows deleted |
| `0021_settlement_ledger` | Additive, generated: `settlement_period`, `settlement_entry` (and its kind enum), `branch_settlement`, `settlement_position` and `loyalty_allocation`; `loyalty_transaction.branch_id`, `batch_id`, `redemption_id` and the `returned` type; checks every current row meets: amounts by type (expired negative, an adjustment not zero, the rest positive), a return names its redemption once, gems balances and totals not negative |
| `0022_settlement_guards` | Guards, backfill and seed, hand-written, rerunnable: an entry's month is the IST month it is recorded in, or the next open one once that has closed; closed months, statements, positions and entries can't change (a correction is a reversing entry); a redemption spends unexpired, unspent gems of its own account, and an expiry only a lapsed batch's unspent gems; a sold membership's price paid and purchased minutes are fixed; every earned row becomes a batch at its invoice's branch, redemptions take their booking's branch and existing ones are allocated earliest-expiry first, old expiries name their batch from the `expired:<id>` marker; refuses to finish when a balance doesn't equal its movements or a batch is overspent; the `settlement` setting (100%, ₹1.00 a gem, the value per gem taken from `gems_value_paise` when valid) replaces `gems_value_paise` |
| `0023_settlement_enforce` | Enforcement, generated: every gems row except an adjustment names its branch; an expiry, and only an expiry, names its batch |
| `0024_settlement_entry_gst_share` | Fix, generated: the entry shape check no longer caps an entry's GST share at its value, which floor rounding exceeds by 1 paisa on a membership worth under a paisa a minute; statement sums stay exact |
| `0025_membership_holds` | Additive, generated: `membership_hold` (one per session booking; held, consumed or released) and its state enum; `spa_membership.reserved_minutes` (default 0) with the CHECK `used + reserved ≤ total`; `booking.started_at` |
| `0026_membership_hold_guards` | Guards and backfill, hand-written, rerunnable: a session booking's hold follows its status by trigger (confirmed or in progress holds, completed consumes, cancelled, rejected, no-show or rescheduled releases); validity at the session's actual or planned IST start; holds are final once consumed or released and never deleted; a membership's totals follow its holds and are checked against them at commit; a membership with a held session can't be cancelled; every existing session gets the hold its status implies, refusing to finish when a membership's used minutes differ from its completed sessions |
| `0027_staff_occupancy` | Additive, generated: `staff_occupancy` (planned interval of each confirmed or in-progress booking with one assignee) and `staff_work` (actual interval of each started one), each keyed by booking; `booking_service_booking_id_idx` |
| `0028_staff_occupancy_guards` | Guards and backfill, hand-written, rerunnable: `btree_gist`; both projections follow `booking` and `booking_service` by trigger and refuse direct writes; for one person at any branch, a SPA interval overlaps nothing else of theirs, planned or actual; once confirmed, every service line names the same person (checked at commit). The backfill takes the assignee off a confirmed booking that clashes with an earlier one and flags it `overrun` for reception, keeps a started one without a row, and counts bookings whose lines name different people |
| `0029_staff_overrun_values` | Additive, generated: enum values `booking_reassignment_resolution.started` and `notification_type.staff_overrun` |
| `0030_staff_overrun_close` | Trigger, hand-written, rerunnable: open reassignment work closes as `started` when its booking starts. `started` appears only in the function body, which runs after the migration run commits (the enum trap) |
| `0031_off_schedule_reason` | Additive, generated: enum value `booking_reassignment_reason.off_schedule` |
| `0032_assignee_schedule_guards` | Guards, hand-written, rerunnable: `staff_off_schedule`; a confirmed booking's assignee must be within their weekly schedule when they have a row for that weekday (a working day, at that day's branch, within its hours); a deferred trigger checks at commit, when a booking becomes confirmed or a confirmed booking moves, that every person it names works at its branch, isn't on approved leave that day and is scheduled then. Existing bookings aren't revalidated: no one has weekly rows yet. `off_schedule` appears only in the application's statements (the enum trap) |
| `0033_catalogue_branch_availability` | Additive, generated: `all_branches` (default true) on `service` and `service_category`; join tables `service_branch` and `service_category_branch`, cascading from both sides and indexed by branch. Every existing service stays offered at every branch |
| `0034_catalogue_availability_guard` | Guard, hand-written, rerunnable: `service_available_at(service, branch)`, true when the service's and its category's availability both include the branch ("all branches" includes branches added later); trigger `booking_service_availability_guard` refuses a booking line, on insert or a change of service, for a service its booking's branch doesn't offer (check violation `booking_service_branch_availability`). Lines already written aren't rechecked when the catalogue changes later |

Drizzle applies migrations strictly in journal order, so `0007`–`0034` can't
go in before `0005`–`0006`, and the new code needs `0007`–`0034`. Recommended
production sequence: pause role and staff changes, counter billing, gems
redemptions, membership sessions and catalogue edits in Payload, apply
`0004`–`0034` in one run, then deploy the CMS (its start command applies the
CMS migration below) and web and admin straight away. Between the two, the old code's role and staff writes fail closed (the
`0006` checks and triggers reject them) instead of writing unkeyed rows, and
the old code can't issue an invoice at all: checkout and membership sales fail
on the `0018` snapshot trigger, and the old monthly GST job's upsert on
`month` fails (it runs only at 01:00 IST on the 1st). After `0023` the old
code's gems writes fail closed too: a customer's redemption on the website
names no branch, and the old 00:10 IST expiry job names no batch (it would
also have expired spent gems). After `0026` the old code's session recording
fails closed: it writes a completed booking, whose minutes the new trigger
already consumes, plus a direct deduction, which the balance check refuses at
commit. Before applying `0026`, check that every production membership's used
minutes equal its completed sessions' minutes; the migration refuses to
finish otherwise and names the memberships. After `0028` the old code's
walk-ins fail closed when it picks a different default person per service:
a confirmed booking whose lines name different people fails at commit, and
nothing is written. Its approvals and assignments already name one person.
Before applying `0028`, list confirmed and in-progress bookings whose lines
name different people, and pairs of the same person's bookings that overlap
where either is a SPA: the backfill flags the clashing confirmed ones
`overrun`, which reception must reassign, and its notice counts the rest.
After `0032` the old code's reschedule has no release step, so a customer
moving a confirmed booking onto a day its person has approved leave is
refused at commit and nothing moves (before, it moved and kept them). The
weekly schedule limits nothing until a week is saved, because no one has
weekly rows yet; the new code's saves release what they rule out.
After `0020` the old code finds no shared
business hours or booking rules and uses its built-in defaults; production's
saved values return with the new code, as each branch's revision 1. A booking
the old code rejects or marks a no-show keeps its gems until the new nightly
expiry gives them back. Every other old-code path keeps working,
because the remaining changes are additive or refuse writes only at a
shut-down branch or with an assignee who doesn't work at the branch. Existing
holidays become all-branches closures (`branch_id` null). Before applying
`0011`, check production for a branch already marked `shutdown`: from then on
it takes no new bookings or invoices. Before applying `0014`, check for
pending or confirmed bookings whose assignee no longer works at their branch:
they stay as they are (the trigger checks new writes only), but they can't be
approved or reassigned to that person; list them for reception. Before
applying `0017`, list production's branch codes: a 1–4 character code
becomes its invoice prefix, others get `B` and their number, and every
prefix must be unique. Invoices issued before `0017` keep their numbers and
header-only tax and render as before. Reset `test` and `pprd` from production
afterwards.

### Current CMS migrations (31 October 2026)

Neon dev's Payload ledger holds six migrations, the last listed below. Check
production's ledger before the window: the CMS start command runs
`payload migrate`, so it should hold the first five.

| Migration | Kind |
| --- | --- |
| `20261031_015028_catalogue_tax_versions_availability` | Generated, then hand-edited. On categories and services: a SAC code from the reviewed list, `availability` (`all` or `selected`, default `all`), `edited_by`, a branch list (`service_category_texts`, `service_texts`) and version tables (`_service_category_v`, `_service_v` and their branch lists). It carries over the application's SAC codes and any branch availability `0033` stores (skipped where those don't exist), fills a category still without a code from `0018`'s slug table, else by type (salon `999721`, SPA `999723`), then makes the category's code required. Existing documents get their first version on their next save |

Apply `0033` before the CMS deploys: the new sync hooks write `all_branches`
and the join tables, and without them every catalogue save fails and writes
nothing in either schema (the hook's error rolls back Payload's transaction).
Admin's drift job (00:15 IST) reads the new CMS columns, so it fails and
withholds its heartbeat until the CMS migration has run; deploy the CMS before
admin. The old CMS can still be serving while the new one migrates, and
creating a category there fails on the now-required SAC code, so keep
catalogue edits paused until the new CMS serves. For the same reason an older
CMS build can't create categories once the migration has run: repair the CMS
forward rather than rolling it back. The old web and admin code keeps working
after `0033`–`0034`: every service starts offered at every branch, so the
trigger refuses nothing until an editor limits one, and `0034` needs no data
check. Once one is limited, bookings already made for it at a branch that no
longer offers it stay as they are; the admin dashboard lists them for
reception to keep, cancel or rebook.

Invoices issued after `0018` are test invoices until the launch tax review
(TX-10): the seeded 5% rates are provisional and `invoicing.live` is off. To
go live, the Developer reviews each branch's rates on Settings → Tax, enters
each branch's legal name and GSTIN on Branches, then switches on live
invoicing in Settings; from then on an invoice is refused (409) at a branch
missing any of them (TX-08). The same review confirms the SAC codes in
Payload: every category needs one from the reviewed list, and a service
without its own uses its category's. The CMS migration's codes by type are
provisional.

Before launch, also: issue admin realtime tokens from an Ably key with
"Revocable tokens" enabled (a reviewed key cutover: switch `ABLY_PRIVATE_KEY`,
then wait for old tokens to expire); register the four new QStash schedules
(`missing-manager-reminder`, `realtime-revocations`, `settlement-close`,
`staff-overrun-check`) and the `BETTER_STACK_HEARTBEAT_MISSING_MANAGER`,
`BETTER_STACK_HEARTBEAT_SETTLEMENT_CLOSE` and
`BETTER_STACK_HEARTBEAT_STAFF_OVERRUN` monitors. `staff-overrun-check` runs
60 times a day, so check the QStash daily message quota with it registered.
No heartbeat URL is wired
into the admin Lambda in `sst.config.ts` yet, so every job's heartbeat is a
no-op in production until they are; wire them before relying on the monitors.
A later enforcement migration
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
