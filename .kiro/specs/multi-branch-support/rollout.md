# Multi-branch support v6: rollout and recovery

Status: implementation and launch runbook, updated 23 November 2026. Target launch: 1 January 2027, conditional on all three gates below.

The Owner chose to verify deployed behavior on the existing production services during the approved release window. Gate 1 uses the completed local and disposable-database checks. This release does not require a new hosted rehearsal environment, domain, certificate or provider account. A temporary quarantined backup restore remains part of Gate 2. It does not receive production traffic or connect to live delivery providers.

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
- Record database migration and web, admin, CMS and invoicing deployment separately from Git promotion.
- Record the source commit, deployed artifact revisions, migration ledger heads, environment/branch IDs and evidence links for every gate.
- Commits, workflow dispatch, provisioning and production actions belong to later implementation/operations tasks with the applicable authorization.
- Current Next.js baseline is 16.4.3 in web, admin and CMS. Only `apps/admin/next.config.ts` sets `experimental.turbopackFileSystemCacheForDev: false`; web and CMS also run `next dev --turbopack` and need the same setting (tasks §1). There is no dependency patch to merge.

## Gate 1: design and implementation readiness

Pass before scheduling a production migration window:

- Resolve v6 role, branch-context, service availability, invoice snapshot and CMS editing-authority rules into executable acceptance tests.
- Validate the booking/assignment constraints on disposable PostgreSQL, including simultaneous requests and the mixed SPA/hair cases.
- Verify membership reservations, completion debits and retries atomically; no-show releases return hours only within the original membership expiry.
- Verify removal/handover access loss across HTTP and page reads, including cross-branch record requests, and exercise token revocation logic locally. Check an existing provider connection in Gate 3.
- Inventory every branch-owned read/write, aggregate, export, job, token capability and shared-customer projection; test negative access cases.
- Ensure real invoice issuance requires approved tax settings; provisional GST/SAC configuration is for pre-launch test activity only.
- Collect the relevant tests in their actual runners and require passing lint, types, schema checks and affected-app builds. Verify the invoicing deployment artifact in Gate 3 if the local image check remains deferred.
- Keep unrelated workspace edits separate from the release. Any failed or unavailable required check leaves this gate open.

The driver proof uses rollback and concurrency checks on disposable PostgreSQL and
the recorded timing of the private AWS probe. Deployed CloudFront, browser, and
provider behavior are verified during the production release window.

On 23 November 2026, the private probe at revision
`78116d03-6f48-4a3e-866e-8882e239803f` ran the app code from `29bdde8` with
the probe from this workspace. CloudWatch measured 154.25 ms of initialization
and 371.28 ms for the cold invocation. Three warm invocations measured
67.83, 56.56 and 41.11 ms. The admin health handler took 302.92 ms cold and
4.29–16.55 ms warm. The failed synthetic `CHECK` rolled back the prior insert
on all four invocations. The temporary function, role and logs were removed.

The standalone [Lambda health timing tool](../../../scripts/release/rehearse-lambda-health.mjs)
remains available for nonproduction diagnostics. For this release, use read-only
production health requests after deploying the reviewed candidate and correlate
request IDs with the production Lambda logs.

### Local rehearsal with synthetic salon data

Use a disposable native PostgreSQL database named `rgss_rehearsal_<name>`
bound to `127.0.0.1`. Apply the candidate Drizzle and Payload migrations to
that empty database using their respective migration commands. Use synthetic
auth values and leave outbound providers unconfigured.

1. Run [the branch seed](../../../packages/db/scripts/seed-multi-branch-rehearsal.sql)
   with `psql -X -v ON_ERROR_STOP=1` on the disposable database. It creates
   Rayasandra, Marathahalli and Whitefield rehearsal branches with realistic
   hours, staff and provisional tax versions. One Owner can access the first
   two branches. A separate Owner controls Whitefield. Contact addresses use
   `example.invalid`.
2. Set `REHEARSAL_DATABASE_URL` to the same explicit loopback connection and
   run `bun run apps/cms/scripts/seed-multi-branch-rehearsal.ts`. This publishes
   a haircut and a massage through the normal Payload catalogue hooks. Rerun
   the branch seed to assign the published services to staff.
3. Run the opt-in admin TX-03 integration with `ADMIN_REHEARSAL_TAX=1`.
   Set `DATABASE_URL` to the loopback connection, set `REHEARSAL_PG_DATA` to
   the absolute native cluster directory, and use Node's `--import` to load
   [the local PostgreSQL adapter](../../../scripts/release/preload-local-rehearsal-db.mjs)
   in the test process and its workers. In a built Next app, use `localhost`
   as the hostname in `DATABASE_URL`. Run the scenario once per prepared
   database because it issues four synthetic invoices and adds a tax version.
   Enable `ADMIN_REHEARSAL_MEMBERSHIP_HISTORY=1` for the separate
   `membership-history.integration.test.ts` route rehearsal. It records an
   omitted visit, verifies role and branch restrictions, and applies a linked
   correction while preserving the issue snapshot.
4. For the recovery rehearsal, run `scripts/backup/capture-full.sh` with the
   synthetic database URL and `BACKUP_SOURCE_ID=local-synthetic-fixture`. In
   an empty `rgss_rehearsal_restore_<name>` database, use the exact resulting
   dump and manifest with
   [the native PostgreSQL restore verifier](../../../scripts/backup/verify-local-synthetic-restore.mjs).
   Set `REHEARSAL_POSTGRES_BIN` and `REHEARSAL_PG_DATA` to absolute paths and
   provide the temporary database role and password through
   `REHEARSAL_PG_USER` and `REHEARSAL_PG_PASSWORD`. The verifier retains the
   restored copy for migration replay and exact cleanup tests.

The local adapter exercises the application queries and transaction guards on
PostgreSQL. Collect separate evidence for deployed AWS, Neon, QStash and Ably
behavior, the selected release backup, and approved launch values.

To check local signed-session handover, start the built admin app on
`http://127.0.0.1:<port>` with the same database and adapter, with Ably unset.
Set `PLAYWRIGHT_ADMIN_BASE_URL` to that origin, set `ADMIN_E2E_OWNER_STATE`
and `ADMIN_E2E_MANAGER_STATE` to fresh signed fixture storage states for
`rehearsal_mb_owner_ab` and `rehearsal_mb_a_manager`, and set
`ADMIN_E2E_LOCAL_HANDOVER=1`. Run `local-role-handover.spec.ts` with the admin
Playwright config. The test restores the assignment and confirms that the
original Manager session remains invalid. Use the separate deployed realtime
test to observe Ably disconnecting an existing subscriber.

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

### Application migrations

Applied on Neon dev (`0000`–`0036`). Production has `0000`–`0003`.

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
| `0035_offer_cms_mirror_and_invoice_snapshot` | Additive plus checks, generated: `offer.cms_id` (unique, null on the admin-made test offers) and `offer.show_on_website` (default true); `offer_cms_rule_check` holds a Payload mirror (`cms_id` set) to its id `cms_offer_<cms id>`, an end on or after its start and exactly its type's value (percentage 1–100, a positive flat amount or combo price); invoice `offer_id` (restrict) with name, type and value snapshots, all four or none and the value above 0 (`invoice_offer_snapshot_check`). Every existing row passes: no offer has a `cms_id` and no invoice an offer |
| `0036_invoice_offer_snapshot_guard` | Guard, hand-written, rerunnable: `invoice_snapshot_fixed()` also fixes the offer and its snapshot on an issued invoice, so a later CMS edit or a retired offer never changes a past invoice |
| `0037_staff_designation_reason` | Additive enum value `designation_changed`. The next migration uses it only when its triggers run after commit. |
| `0038_staff_designation_guards` | Checks the staff designation when assigning or starting bookings. Changing a designation clears future incompatible assignments and gives confirmed bookings a reassignment flag. Completed staff history is preserved. |
| `0039_membership_corrections` | Adds the append-only correction note table, its link to settlement entries, and the signed adjustment posting kind. |
| `0040_membership_correction_guards` | Validates the original session invoice, actor and remaining minutes. Applies the balance, posts a signed cross-branch adjustment when needed, and records the audit in the same transaction. |
| `0041_staff_designation_enum_cast` | Explicitly casts the designation reassignment reason in the trigger's `SELECT DISTINCT`, as identified in the isolated rehearsal. |
| `0042_membership_session_completion` | Stores the replay key, original request fingerprint and remaining minutes in the same transaction as completing a session. Existing completion callers can omit the key. |

Drizzle applies migrations strictly in journal order. The release candidate
needs all migrations through `0042`. Recommended
production sequence: pause role and staff changes, counter billing, gems
redemptions, membership sessions, catalogue and offer edits in Payload and
offer edits in the admin portal, apply
`0004`–`0042` in journal order, then deploy the CMS (its start command applies the
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
After `0035`–`0036` the old admin's offer writes still work: its rows carry no
`cms_id`, so the mirror check doesn't apply, and its checkout writes no
invoice offer snapshot, which the snapshot check allows. Its offer expiry job
would also retire a CMS mirror past its end date, which drift then reports
until the next CMS save; mirrors exist only once the new CMS saves a rule.
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

### CMS migrations

Neon dev's Payload ledger holds seven migrations, the last two listed below.
Check production's ledger before the window: the CMS start command runs
`payload migrate`, so it should hold the first five.

| Migration | Kind |
| --- | --- |
| `20261031_015028_catalogue_tax_versions_availability` | Generated, then hand-edited. On categories and services: a SAC code from the reviewed list, `availability` (`all` or `selected`, default `all`), `edited_by`, a branch list (`service_category_texts`, `service_texts`) and version tables (`_service_category_v`, `_service_v` and their branch lists). It carries over the application's SAC codes and any branch availability `0033` stores (skipped where those don't exist), fills a category still without a code from `0018`'s slug table, else by type (salon `999721`, SPA `999723`), then makes the category's code required. Existing documents get their first version on their next save |
| `20261121_114423_offer_checkout_rules` | Generated, imports corrected by hand. On offers: `show_on_website` (default true), the checkout rule (`rule_type`, default `none`, with its percentage, flat amount, combo price and terms), `edited_by`, the linked services (`offer_rels`, path `rule.services`) and version tables (`_offer_v`, `_offer_v_rels`); the card image is no longer required at the database (the collection requires it while the card is shown). Existing offers keep their cards, shown, with no rule |

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

Apply `0035` before the CMS deploys as well: the offer hook writes `cms_id`
and `show_on_website`, and without them a save with a checkout rule fails and
writes nothing. Card-only saves don't touch the mirror. The old CMS keeps
saving while the new one migrates, because the offer migration only adds
defaulted columns and relaxes the image. Deploy web after the CMS: its card
read filters on `showOnWebsite`, which the old CMS can't query. The drift job
reads the new offer columns too, which the CMS-before-admin order above
already covers. The admin-made test offers stay in `public.offer` without a
`cms_id` and are not migrated. They stay usable at checkout until the expiry
job retires them after their end date, and the admin portal can no longer
edit them, so list production's live ones before the window.

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
The admin Lambda maps the three heartbeat variables to the stage's [SST
secrets](../../../knowledge-base/background-jobs.md#env-vars-jobs-specific).
Verify delivered pings from the release environment before relying on the monitors.

### Verify live providers during the production window

Use the production provider credentials from their approved secret stores in an
authorized shell. Verify the exact deployed commit and host before sending any
requests. Keep new schedules and customer intake paused until the applicable checks
pass.

- **QStash delivery.** A repository administrator restricts the `production-aws`
  environment to `prod` and puts `QSTASH_TOKEN` in that environment's secrets.
  In **Register QStash Schedules**, dispatch `signed-canary` from `prod` with
  `dry_run=true` and an empty `jobs` field. It confirms the unsigned response
  is 401, then publishes one signed request without an invoice ID and with zero
  retries. It returns before database, PDF, email or heartbeat work. Use
  `register` with `dry_run=true` to review the exact selected job keys. Apply
  that reviewed selection only at the approved point. After the approved
  resume, dispatch `verify` with `dry_run=true` and an empty `jobs` field to
  check the full inventory, including job paths, UTC crons, methods, duplicates,
  and paused schedules. AWS runtime and the workflow use the same optional
  `QSTASH_URL` and default to `https://qstash.upstash.io` when it is unset.
  [Upstash delivery logs](https://upstash.com/docs/qstash/howto/debug-logs)
- **Ably and branch access.** In the production Ably dashboard, match the active
  key to the deployed admin, enable **Revocable tokens**, and allow up to 13
  minutes for previously issued admin tokens and requests to expire before
  checking handover. Identify and retire the separate legacy key exposed by an
  earlier deployment after verifying its consumers. Keep `NEXT_PUBLIC_ABLY_KEY`
  as the nonsecret value `enabled`. Use the production canary on its
  generated subscriber to verify provider code `40141`. With `ABLY_PRIVATE_KEY`
  from the deployed runtime's secret store and the confirmed
  `PRODUCTION_ABLY_APP_ID`, run:
  ```sh
  bun apps/admin/scripts/rehearse-ably-revocation.ts --confirm-production-synthetic-revocation
  ```
  The script mints one subscribe-only token and targets that generated client ID.
  For application evidence,
  use signed sessions and a separately approved test-only Owner/Manager assignment
  with no business bookings. The Playwright `realtime-handover.spec.ts` test
  has an explicit `ADMIN_E2E_REALTIME_HANDOVER=production-fixture` mode for
  `PLAYWRIGHT_ADMIN_BASE_URL=https://admin.theroyalglow.in`. Prepare an approved
  non-primary `RGSS Launch Verification` branch in `temporarily_closed` status,
  an unused synthetic lead in `new` status at that branch, and signed Owner
  and Manager storage states kept outside Git. Set `PRODUCTION_ABLY_APP_ID`,
  `ADMIN_E2E_REVOCATION_BRANCH_ID`, `ADMIN_E2E_REVOCATION_OWNER_ID`,
  `ADMIN_E2E_REVOCATION_MANAGER_ID`, `ADMIN_E2E_REVOCATION_MANAGER_EMAIL`, and
  `ADMIN_E2E_REVOCATION_LEAD_ID` to match the approved fixtures. Run only
  `bun run --filter @rgss/admin test:e2e realtime-handover.spec.ts`.
  The test attaches the Manager's existing subscription, removes the fixture
  assignment through the Owner API and verifies `40141`, denied token and
  page requests, and denied reads and writes on the fixture lead. It restores
  the assignment with an expected-holder check and verifies the original
  session remains invalid. Clear only the fixture sessions and preserve the
  audit. The live run requires the approved fixture records and signed sessions.
  [Ably token revocation](https://ably.com/docs/auth/revocation)
  The integration workflow also runs signed staffing and Manager handover
  against a built admin app and PostgreSQL on runner loopback. It checks service
  assignments, weekly shift edits, out-of-shift availability, branch isolation,
  and rejection of a genuine stale session cache after removal. The synthetic
  sessions, database and app logs stay on the disposable runner.
- **Heartbeat and release health.** Compare the approved schedule list with the
  provider, then verify heartbeats from permitted quiet runs. Confirm scheduled jobs
  that reach customer data or advance settlement periods are enabled only at their
  approved point. Save web/admin health and deployed revision, CMS catalogue
  parity, and private PDF access evidence with redacted IDs.

A later enforcement migration
sets NOT NULL on `lead.branch_id`, `waitlist.branch_id`,
`customer_note.branch_id` and `spa_membership.selling_branch_id` once the
backfill reports no nulls. Run the [read-only launch preview](../../../packages/db/scripts/preview-multi-branch-launch.sql)
with the candidate launch date on the restored release schema. It reports the
four null counts, branch issuer/settings coverage, active service roster and
scheduled days by service type, and applicable tax gaps at the start of the
launch day in IST. Reconcile these counts with the approved branch and tax
records. Check actual shifts and dated leave before accepting real bookings.

## Gate 2: exact production backup and recovery readiness

The completed synthetic rehearsal validates the procedure. Before production DDL or
cleanup, validate the actual release backup from the quiesced source.

- Confirm the release SHA, current production state and exact Neon branch identity
  through metadata. Keep Git promotion and database migration order unchanged.
  Archived branches may need to be reactivated or migrate under the existing
  release procedure without deploying a new application environment.
- Obtain the exact approved full database dump, manifest and R2 asset inventory.
  Restore the dump into an empty, quarantined target with no app traffic, provider
  egress, or production credentials. A disposable PostgreSQL recovery target is
  sufficient. Keep any copied sessions, OAuth records and PII restricted.
- Verify the restored schema, both ledgers, counts, balances, constraints and linked
  invoice/media files. Use the candidate migrations and reviewed allowlist on the
  restored copy for preflight, rollback/forward repair and cleanup preview. Check
  CMS and public catalogue parity before recording that no repair is needed.
- Reject unverified snapshots, unexpected conflicts, unresolved asset references,
  and unexplained differences. Record restore duration, hashes, redacted evidence
  and teardown. Keep the approved backup available throughout the release window.

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
- A synthetic PostgreSQL 18.6 rehearsal captured and restored a full archive into
  a second empty local cluster. It rejected an incorrect count and a checksum
  mismatch, and confirmed that the scratch database was removed. The PR's Linux
  check exercises the container's network isolation. Restoring the approved
  release backup and recovering its R2 assets are part of the release rehearsal.
- Run representative read and invariant checks, record the successful restore duration, and confirm the recovery target meets the agreed outage window.
- The monthly workflow restores an exact dump/manifest pair in an empty
  network-isolated PostgreSQL container and compares the facts before teardown.
  Keep the approved run and its artifact reference for the release rehearsal.
  Verify R2 object recovery separately from the database's stored references.
- Keep backup data, credentials and PII quarantined through verification and teardown; never expose copied production credentials to test clients.

### Verify recovered R2 assets

Review an exact inventory of invoice PDFs and CMS media, including generated
variants, for the selected database backup. Export the reference rows from the
quarantined restored database before running migrations or cleanup. Keep the
export with the restricted recovery materials.

```sh
umask 077
psql "$RESTORED_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 \
  -v rgss_backup_reference_export=true \
  -c 'BEGIN READ ONLY; SET LOCAL search_path = pg_catalog;' \
  -f scripts/backup/database-facts.sql -c 'COMMIT;' > reference-export.json
```

Create an inventory JSON with `version: 2`, the SHA-256 of the exact database
manifest file as `manifestSha256`, an approval reference in `reviewReference`,
and `objects` and `excludedReferences` arrays. Each object has `bucket`, `key`,
`recoveryReference`, `sha256`, `size` in bytes, `file` and a `references` array
of `{kind, position}` pairs from the export. Attach both URL and filename
references for a CMS asset to the same inventory object. For a private invoice
link, use the invoice number and issue date to resolve its storage key. Each
approved exclusion must include the reference's `kind`, `position` and `reason`.
Establish the expected checksum and byte length from the trusted recovery
source before restoring the files. Use a unique lowercase filename such as
`invoice-42.object`. Put only the listed files in the quarantined directory.

```sh
node scripts/backup/verify-recovered-assets.mjs <manifest> <inventory> <recovered-directory> <reference-export>
```

Record the printed hashes and verified counts with the database restore
evidence. The comparison checks the export against the manifest's database
digests, requires every reference to appear once and checks the recovered
bytes. Reviewers confirm the references resolve to the listed bucket and key,
the sources are trusted and any reported exclusions are approved.

On 23 November 2026, the private `rgss-backups` R2 REST path round-tripped
the synthetic `rgss_full_20261123T174419Z_312-1.dump` (426,707 bytes,
SHA-256 `abb6c9f6a7f3eb0ffbf76e069f0aea7675006f38e0595af7128093e9eb91a460`),
its manifest and a PNG fixture. An empty native PostgreSQL target matched the
schema, facts, 43 Drizzle migrations and seven Payload migrations. The
recovered asset verifier matched both CMS references to the 68-byte object.
The temporary local cluster was removed, and the remote rehearsal prefix was
verified empty. On 26 November, the scoped S3 capture and restore workflows
verified the selected production database backup. Recovery of the referenced
R2 object bytes remains open. See [the recovery record](#launch-and-recovery-record).

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

### Read-only cleanup preview

Restore the exact verified dump into a quarantined recovery target and apply
the candidate migrations. Set `CLEANUP_PREVIEW_DATABASE_URL` to its explicit
read-only connection. Run `bun scripts/backup/preview-cleanup.mjs <allowlist.json> <manifest.json>`
using the selected backup manifest. Each allowlist entry identifies an exact
primary key and its record-level provenance. For example, a synthetic entry is
`{"table":"public.invoice","key":{"id":"fixture-invoice"},"evidenceReference":"fixture review 1"}`.
The top-level JSON fields are `version` (1), `reviewReference`, `dumpSha256`
(from the named backup manifest), and `rows` (the reviewed entries).

For a hosted preview, upload the reviewed allowlist to private `rgss-backups`
next to its verified release backup. Replace `.manifest.json` with
`.cleanup-allowlist.json` in the exact release manifest key. Dispatch **Monthly
Backup Restore Test** with that same manifest and candidate, with
`require_assets=true`, `replay_candidate=true` and `preview_cleanup=true`.
Supply `cleanup_allowlist_sha256` from the file that was reviewed. On Windows,
use `(Get-FileHash -LiteralPath '<allowlist path>').Hash.ToLowerInvariant()`.
The runner verifies that file and its binding to the dump, restores the assets,
replays the candidate, then runs the preview inside the isolated restore.
Only the aggregate result appears in Actions.

When the record review selects zero records for removal, dispatch the same
strict restore with `require_assets=true`, `replay_candidate=true` and
`retain_all_cleanup=true`. Leave `preview_cleanup` off and the allowlist hash
blank. The workflow records zero selected records against the exact backup
after successful replay and teardown.

Keep the report in the approved evidence store. A missing key or unreviewed
incoming dependency exits with status 2. Review financial totals, invoice
series, retained references and the object and queue inventory before approving
the preview. Compare object-reference hashes with the restricted R2 inventory
and verify the actual asset and queue disposition separately. The preview does
not execute cleanup or establish that a record is a test record.

## Gate 3: production go/no-go

1. **Authorize and quiesce.** Confirm the reviewed candidate SHA, existing app
   revisions, current database ledgers, Owner-approved branch data and tax
   records, recovery owner, and maintenance window. Verify each pause for
   intake, CMS auto-deploy and authoring, staff billing and the affected
   publishers and consumers. Record in-flight job IDs and disable or drain
   the corresponding deliveries before capture.
2. **Capture and verify recovery.** Run **Weekly Prod Backup** with
   `backup_purpose=release`, `release_candidate_sha`, `source_deployed_sha`,
   `source_neon_host` and `source_neon_branch_id`. Use the published exact
   `release/...manifest.json` value as `manifest_key` in **Monthly Backup
   Restore Test** and supply the same `release_candidate_sha`. For a capture
   with the release asset inventory, set `require_assets=true` and
   `replay_candidate=true`. The workflow restores the dump in an isolated
   container, verifies the referenced bytes from private R2, exercises both
   migration ledgers and removes the container. Keep the identical manifest
   for the private exact-ID cleanup preview in Gate 2. Older manifests can
   still be verified as database-only backups.
   Take the separate catalogue snapshot before Payload DDL. Stop on a missing
   artifact, invalid backup, changed candidate, unexplained data, or required
   R2 object that cannot be recovered.
3. **Promote and migrate.** Dispatch **Promote validated commit** from
   `dev` with target `prod`, maintainer approval and
   `defer_production_deploy=true`. This advances the exact validated commit
   through `test` and `pprd` without dispatching AWS deployment or release
   publication. Render auto-deploy must already be paused. Apply the reviewed
   Drizzle then Payload migrations to their verified targets in the existing
   environment order. Review before/after counts and both ledgers. Proceed
   only when all expected branch, occupancy, membership and invoice guards
   are present and reconciliation passes.
4. **Deploy the approved artifacts.** When standalone invoicing is in scope,
   deploy the Cloud Run candidate and verify private `rgss-invoices` access.
   This rollout defers standalone invoicing. Deploy CMS after its migrations
   and verify catalogue parity and the media origin. Then dispatch **Deploy
   AWS** on `prod` with `git_ref` set to the same full reviewed SHA. Confirm the
   deployed revisions, health endpoints and runtime configuration. Apply only
   the reviewed cleanup, if approved, against
   the still-quiesced production data and reconcile all retained records.
5. **Verify production before reopening.** First use read-only health,
   roles, branch isolation, catalogue availability and previews. Run the
   bounded provider canaries and the approved test-only handover above.
   Check permitted operational actions only against the approved exact
   fixture list. Keep payment capture, real email/SMS, third-party delivery
   and real invoice issuance outside synthetic tests. Use local evidence
   for concurrency, invalid tax and synthetic invoice/settlement write
   cases. Record the first genuine invoice and normal job outcomes after
   authorization rather than spending production invoice numbers on probes.
6. **Reopen on a recorded go decision.** Verify approved issuer/SAC values,
   schedules, closures, notification destinations and invoice access.
   Enable live invoicing only after TX-10 review. Resume writers and jobs
   in dependency order, verify first deliveries and publish the release
   from the exact promoted SHA. An unexpected authorization, accounting,
   migration or recovery result keeps the write pause in effect.

## Recovery and schedule

Use a forward migration for schema defects; do not run destructive down/reset migrations against production.
Rollback application binaries only when the compatibility matrix proves they can read and write the current public and CMS schemas safely.
If that is unsafe, maintain the write pause and repair forward; prevent older admin writes from competing with CMS-owned offers.
Disabling sync alone is not rollback: it permits divergence. Freeze affected authoring, reconcile both schemas and verify parity before reopening it.
Restore from backup only as an explicitly authorized recovery operation; account for writes, objects and external deliveries after the snapshot.
Restore/repair the paired application and CMS state together, revalidate both ledgers, then resume queues with duplicate-delivery controls.
### Launch and recovery record

Record these references together for the release window. Keep customer data,
backup contents and provider credentials in their approved stores.

| Evidence | Capture before launch |
| --- | --- |
| Release and deployment | Promoted Git SHA, deployment evidence for web, admin, CMS and invoicing in each target stage, and both database migration heads. |
| Approved branch data and tax | Owner review of branch details, staff coverage, hours, closures and availability. Tax approval reference with effective dates, issuer legal name/GSTIN, SAC codes and rates for every branch and invoice line type. |
| Isolation and operational checks | Passing signed-session and realtime results, provider job delivery and heartbeat evidence, and branch-specific billing/render/report checks. |
| Backup and recovery | Exact DB dump and manifest keys with checksums, source branch ID, R2 recovery references, isolated restore evidence and duration, and the agreed outage and data-loss limits. |
| Cleanup | Reviewed exact test-ID allowlist and a preview from the same quiesced snapshot, retained-record checks, queued test work, and object inventory. |
| Execution and recovery owners | Maintainer approval for the named window, who can pause each writer and resume traffic, who owns forward repair and restore, and the escalation channel. |

1. Pause intake and the affected writers and consumers. Record which versions
   and queues have stopped. Compare the evidence against the candidate SHA and
   the current database and object inventories before executing cleanup.
2. Stop and maintain the pause on ledger mismatch, reconciliation failure,
   unexpected retained-record changes or lost isolation. Capture the failure
   time, the last successful operation and any writes or deliveries after the
   backup snapshot. Use the same record to decide whether to repair forward
   within the window or request the authorized restore procedure.
3. Before restoring to a shared target, recover the named database and assets
   in isolation and reconcile changes after the snapshot. Restore app binaries
   only after verifying compatibility with each recovered ledger and the CMS
   write authority. Record approval for the selected recovery action.
4. Verify queues and deduplication state, branch isolation, catalogue parity,
   retained accounting and invoice assets before reopening traffic. Resume
   writers and consumers in dependency order and record the first healthy run.

On 23 November 2026, Neon reported `dev`, `test` and `pprd` archived. AWS
reported no separate hosted browser stage. The approved production-window
checks use the existing production services.

An earlier production
[weekly backup run](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45006730820)
failed at PostgreSQL client installation. An earlier
[monthly restore run](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/41296793499)
failed with an invalid R2 endpoint. The exact production release capture and
isolated database restore succeeded on 26 November. Use `rgss-uploads` for
website and CMS media, `rgss-invoices` for private invoice PDFs, and
`rgss-backups` for private database backup and recovery artifacts. The legacy
media bucket continues to serve existing absolute URLs during the cutover.

The approved media hostname is `https://media.theroyalglow.in`. The new
bucket contains the website media copied from `theroyalglow-uploads` and the
`.health` object used by the web app. The updated AWS workflow prefers the
`R2_UPLOAD_BUCKET_NAME` and `R2_UPLOAD_PUBLIC_URL` repository variables when
both are set. Confirm Render CMS uses `rgss-uploads` with a scoped key and
the media public URL as part of CMS cutover verification. When standalone
invoicing is in scope, configure `rgss-invoices` with private PDF access and
a scoped key.

The backup workflows use the GitHub repository variable
`R2_BACKUP_ACCOUNT_ID` for the S3 endpoint and credentials scoped to
`rgss-backups`. Store the capture pair in `R2_BACKUP_WRITE_ACCESS_KEY_ID` and
`R2_BACKUP_WRITE_SECRET_ACCESS_KEY`. Store the read-only restore pair in
`R2_BACKUP_READ_ACCESS_KEY_ID` and `R2_BACKUP_READ_SECRET_ACCESS_KEY`. Verify the
exact dump and assets together for this gate.

#### 26 November 2026 production rollout evidence

- The candidate `26362337fa1b6af667d2479d1bfe14a9c7299c26` reached
  `dev`, `test`, `pprd` and `prod`. The production promotion passed CI,
  PostgreSQL integration, Chromium, load and passive security checks. The
  production migration applied and the new booking replay table, Web Push
  index and binding trigger were verified. [Promotion](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45716103366) · [Production migration](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45718156439)
- The production backup used source revision `415b799` and was bound to the
  reviewed candidate. The exact dump and manifest passed the scoped S3
  download and isolated database restore with teardown. This original run
  verified the database. The later asset-bound recovery is recorded below.
  [Capture](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45711879948) · [Exact database restore](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45712388253)
- Web and admin deployed on AWS and CMS deployed on Render at the exact
  candidate. Repeat web, admin and CMS HTTP smoke checks passed. The public
  media health object and three sampled media objects each returned HTTP
  200 to HEAD requests. Those responses verify live reachability. The
  backup asset recovery uses the selected database manifest and its reviewed
  object inventory. Sentry showed zero unresolved issues in its 90-day view
  after deployment. [AWS deployment](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45718483848) · [Render deployment](https://dashboard.render.com/web/srv-d9mgqpjm8hqs73caq540/deploys/dep-dc3mhgutlv9c73f6ssp0) · [Sentry](https://theroyalglow-sentry.sentry.io/issues/?query=is%3Aunresolved)
- The read-only database preview found zero missing references across the
  four branch ownership fields. Both non-shutdown branches have settings
  and one is operational. The Owner approved the website branch hours and
  synthetic staffing, waived the maintenance window and write and CMS
  auto-deploy pauses for this rollout, and deferred standalone invoicing.
- The production contact page and branch settings show 10:00–21:00 IST on
  weekdays and 10:00–22:00 IST on weekends. A Saturday availability query
  returned the expected Rayasandra request grid, while Marathahalli refused
  the request as Opening soon. Rayasandra now has one Manager, one
  Receptionist, one Stylist and one Therapist. The Stylist and Therapist have
  zero service mappings and zero scheduled shifts. Confirm their services and
  shifts and verify actual coverage before intake.
- The catalogue parity queries found matching fields and timestamps across
  10 categories and 57 services, with no CMS checkout offers or mirrors.
  The daily QStash catalogue parity schedule was registered and its exact
  destination, method and cron were verified. A signed one-off run was
  delivered and the deployed job reported catalogue parity in CloudWatch.
  The live admin runtime lacked a catalogue heartbeat URL. Load the Better
  Stack heartbeat URL into the `production` SST stage as
  `BetterStackHeartbeatServiceDrift`, deploy through promotion, and verify
  the first scheduled execution and heartbeat receipt.
- The production QStash canary rejected the unsigned request and delivered
  the signed synthetic request with no invoice ID. The `production-aws`
  GitHub environment is restricted to the exact `prod` branch and now holds
  `QSTASH_TOKEN`. After verifying zero pending revocations, a scoped run
  registered the security-only `realtime-revocations` schedule. The subsequent
  read-only audit confirmed it and `service-drift-reconcile` are registered.
  The 19 other schedules remain inactive pending launch acceptance.
  [Scoped registration](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45790490946) · [Schedule audit](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45790655967)
- Revocable tokens are enabled on the deployed Ably key. The exposed legacy
  key was retired after checking both deployed applications use the active
  key. A new synthetic subscription was then disconnected with provider code
  `40141`. The public build variable contains the literal `enabled`.
  [Ably error codes](https://ably.com/docs/platform/errors/codes)
- The production review retained all nine bookings, six invoices and one lead.
  None had verified fixture provenance, so zero records were selected for
  cleanup. Live invoicing is off and there are no stored invoice PDFs. The
  deployed signed role handover still needs a dedicated Manager Google account
  with no operating branch assignment and a dedicated closed branch. The Owner
  can act on that fixture with the approved Royal Glow account. The decision to
  begin real business activity is pending.
- The recovery workflows from PR #316 reached all four Git branches at
  `c51acf8`. A candidate-bound production backup included three CMS files
  with six database references. The strict restore verified the asset bytes,
  replayed both migration ledgers without changes on the second run, and
  removed the isolated target. [Promotion](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45749511366) · [Capture](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45747391321) · [Strict restore](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45747750618)
- A second strict restore of the same backup verified catalogue parity in
  quarantine. CMS and public each had 10 categories, 57 services and zero
  checkout offers. The comparator found zero drift and both migration ledgers
  replayed without changes. No forward repair was needed. The workflow removed
  the isolated target and recorded the retain-all decision with zero selected
  records. This closes Gate 2 for the named backup. [Catalogue and cleanup disposition](https://github.com/royalglowsalonspa/theroyalglow-webapp/actions/runs/45792088465)

The release capture reads the media references in the same database snapshot
as the dump, then retrieves the approved public CMS media bytes. Preserve those
objects while collecting the release snapshot so an in-place media replacement
cannot make the captured bytes older or newer than the reviewed reference.
Capture checksums, sizes and media types in the inventory and publishes the
manifest after verifying the private upload. Automatic capture stops if a
private invoice PDF reference is present. The reviewed manual asset verifier
can handle private invoice bytes when invoicing and its recovery access are in
scope. Keep the cleanup allowlist and preview report in a restricted store.

The 1 January 2027 date remains conditional; no fixed effort estimate or automatic waiver follows from this plan.
Sequence work through the three gates, preserve recovery/testing time and defer optional scope or the launch date when required evidence is missing.

## Implementation references

- [Migration discipline](../../steering/migration-discipline.md), [promotion workflow](../../../.github/workflows/promote.yml), [CMS migration workflow](../../../.github/workflows/cms-migrate.yml).
- [Catalogue backup](../../../.github/workflows/pre-migration-backup.yml), [weekly full dump](../../../.github/workflows/weekly-backup.yml), [current restore test](../../../.github/workflows/monthly-backup-test.yml).
- [Replication workflow](../../../.github/workflows/replicate-prod-to-pprd.yml), [current sanitizer](../../../scripts/anonymize-preprod.ts), [transaction resolver](../../../apps/cms/src/lib/sync-db.ts).
- [Service sync](../../../apps/cms/src/hooks/sync-service.ts), [drift detection](../../../apps/admin/src/app/api/jobs/service-drift-reconcile/route.ts), [invoice storage](../../../apps/invoicing/src/storage/r2.ts).
