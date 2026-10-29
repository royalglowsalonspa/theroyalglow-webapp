# Implementation tasks: multi-branch support v6

An ordered work plan. A checked item is implemented and verified on Neon dev
(not yet committed or deployed); italic notes record progress and what is
still open. Read [requirements](requirements.md), [design](design.md),
[membership/scheduling](membership-scheduling.md), [tax/settings](tax-settings.md)
and [rollout](rollout.md) before selecting work.

## 1. Establish the release baseline

- [ ] Inventory current uncommitted admin/CRM/Next changes and their checks; keep
  unrelated work separate from feature commits. Next is already pinned to 16.4.3
  with an admin development-cache mitigation, not a dependency patch.
- [ ] Add `experimental.turbopackFileSystemCacheForDev: false` to
  `apps/web/next.config.ts` and `apps/cms/next.config.ts`, matching
  `apps/admin/next.config.ts`; restart each dev server twice and confirm the
  page no longer reloads repeatedly. *28/10: config added; restart check
  pending.*
- [x] Map APIs, server pages/actions, exports, queries, jobs, realtime publishers,
  invoice paths and settings readers to branch/shared/self-service policies.
  *28/10: [route inventory](route-inventory.md); its six gaps feed §3.*
- [ ] Record migration heads and compatible application/CMS versions; do not
  infer live state or successful deployment from a workflow file.
- [ ] Isolate and fix the existing membership-balance/idempotency defect with
  actual concurrent-write tests before introducing the larger lifecycle change.
  The fix can work with today's neon-http driver, as one guarded statement or a
  batch in which a database check fails the whole write, so it need not wait for
  the §2 driver decision. *28/10: implemented (guarded deduction in the batch,
  optional idempotency key with replay); SQL verified on a disposable branch
  ([spike results](spike-results.md) §1). Typecheck, Biome and unit tests pass
  (`session-request.test.ts`, `memberships.test.ts`, sessions
  `route.test.ts`). The two-connection race test is still pending.*

## 2. Prove the database invariants first

- [ ] Decide the database driver for transactional writes (design §4): a Neon
  WebSocket `Pool` through drizzle-orm/neon-serverless, node-postgres over TCP,
  or single statements and HTTP batches with raising guards. Prove rollback on a
  failed guard, connection handling on Lambda and cold-start cost before the
  prototypes below depend on it. *28/10: decided, confirmed by the user: stay
  on neon-http with guarded statements and batches
  ([spike results](spike-results.md) §5).*
- [ ] Prototype role-qualified references and deferred guards on a disposable
  database: mandatory Owner, one Manager/Receptionist, shared Manager, global
  Owner/performer exclusion, preserved inactive history and protected Developer.
- [ ] Prototype planned SPA/SPA and SPA/hair exclusions plus actual-start
  serialization; cover back-to-back, hair/hair, direct SQL and concurrent writes.
- [ ] Prototype minute holds and exactly-once consumption with the chosen driver;
  prove zero-row guard failure rolls back booking/invoice/occupancy changes.
  *28/10: all three prototypes above passed every case run one transaction at
  a time ([spike results](spike-results.md) §2–4). Concurrent two-connection
  cases are still open, as are hand-written migrations for constraints Drizzle
  can't declare and drift-gate coverage for them (§6).*
- [ ] Generate/review additive Drizzle schema, SQL, snapshots and fingerprints,
  then compatible Payload migrations with explicit ordering. No schema push.
  *28/10: first slice applied to dev as `0004_multi_branch_people`:*
  - *a `user (id, role)` key;*
  - *branch Owner and Manager references with role witnesses, deferrable;*
  - *staff profile branch and role witness, with one Receptionist per branch;*
  - *a branch on staff schedules, waitlist, leads, customer notes (with
    shared or private visibility) and the audit log.*

  *All of it stays inactive until the backfill. The SQL was hand-reordered and
  made deferrable; the drift reference is regenerated; typecheck, db tests and
  `drizzle-kit check` pass. Remaining slices: settings and tax, occupancy,
  membership holds and settlement, catalogue availability.*
- [ ] Design an idempotent backfill with preview/conflict report and preservation
  of existing explicit branches and historical identity/tax evidence.

## 3. Implement branch authorization and administrative ownership

- [x] Switch people management to the `0004` references in this order:
  1. Make every role write maintain them in one batch: `assignUserRole`,
     `createStaffProfile`, staff routes and Owner/Manager handover.
  2. Backfill: the single Owner owns every branch; the existing Manager manages
     the primary branch; active profiles get their role witness, and Staff and
     the Receptionist get the primary branch; existing schedules, leads,
     waitlist rows and notes get the primary branch.
  3. Enforce: `branch.owner_user_id` NOT NULL, the profile checks and the
     deferred role triggers from [spike results](spike-results.md) §2.

  Backfilling earlier would activate the keys while old code still changes
  roles without them. *29/10: done on dev.*
  - *Writes: every role change goes through `planBranchRoleChange`
    (`packages/business/src/branch/roles.ts`) and `applyBranchRolePlan`
    (`packages/db/src/queries/branch-roles.ts`): one batch that defers the
    role keys, locks people then branches in ID order, re-checks the whole
    snapshot (jsonb set equality), applies compare-and-set writes, deletes
    sessions and writes the audit entry. `assignUserRole`,
    `createStaffProfile`, the unscoped staff queries and the old role rules
    in `rbac.ts` are gone.*
  - *Backfill `0005_multi_branch_backfill` (one idempotent `DO` block that
    refuses ambiguous data) and enforcement `0006_multi_branch_enforce` (NOT
    NULL Owner, three profile checks, `user_one_developer`, deferred
    `*_role_relationships` triggers with the user-row lock) applied to dev
    and verified; re-running 0005 changed no row. Production order (now
    0004–0011 in one run, then the code deploy, with role and staff changes
    paused): see [rollout](rollout.md#current-application-migrations-29-october-2026).
    test/pprd: reset from production afterwards (0006 refuses branches
    without an Owner account).*
  - *Integration tests on dev (`branch-roles.integration.test.ts`, 11;
    `branches.integration.test.ts`, 2) prove the deferred keys inside a
    neon-http batch, stale-snapshot rollback, the one-Receptionist index,
    commit-time rejection, profile reactivation, the shared-Manager write
    skew (one of two concurrent removals commits), the row-lock wait, and
    direct-SQL rejection by the checks, the Developer index and the
    triggers.*
  - *Seeds: `seed-prod.ts` creates missing branches only with
    `SEED_OWNER_EMAIL`; `set-role.ts` only sets `customer` or the first
    `developer`.*
- [x] Add the authoritative branch resolver, typed context, record-scoped query
  interfaces, fresh authorization and classified route inventory gate (R1/R2).
  *29/10: `requireBranchRole` / `branchForPage` re-read role and branch access
  on every call; branch-owned queries take the branch and read other branches'
  records as 404; writes carry the rendered branch (409
  BRANCH_CONTEXT_CHANGED). `route-policy.test.ts` classifies every admin
  route; its `PENDING` list is empty.*
- [ ] Add Developer branch creation/edit/shutdown and atomic role handovers;
  preserve other branch relationships and clear only affected future assignments.
  *Creation, edits, shutdown and delete done (see R1.1 below); handovers go
  through `planBranchRoleChange` / `applyBranchRolePlan` in one guarded
  batch. Still open: clearing only the affected future assignments (R1.7
  durable reassignment work).*
- [x] Rewrite the Developer runbook in `knowledge-base/authentication.md` as one
  transaction that demotes the current Developer before promoting the new one
  (`BEGIN; demote; promote; COMMIT;`). Today it promotes first in separate
  statements, which the single-Developer index will reject. Test both orders
  against the guards in direct SQL.
  *Done: one transaction that demotes, promotes and deletes the old
  Developer's sessions. Checked on dev in direct SQL, rolled back each time:
  demote then promote passes `user_one_developer` and the deferred
  `user_role_relationships` trigger; promote first fails on the index;
  demote alone is refused at `COMMIT`.*
- [ ] Update Users & Roles (Owner and Developer: Manager and Receptionist),
  Staff, schedules, leave and missing-Manager reminders. Remove the active
  toggle; retain historical staff identities. *29/10: Users & Roles
  (`/api/users`, `/api/users/branch-roles`, `users-manager.tsx`) and Staff
  done for the active branch; the active toggle is gone and removed staff
  keep an inactive profile. Schedules and leave are branch-scoped.*
  *29/10: missing-Manager reminder (R1.9) done: `missing-manager-reminder`
  job (10:00 IST, one email per Owner per IST day, stops once a Manager is
  assigned; notification type `branch_manager_missing`, migration 0009 on
  dev) and a dashboard banner with an assign link for the Owner and the
  Developer.*
- [x] Rebuild Add staff on the Staff page (`CreateStaffDialog` in
  `apps/admin/src/app/staff/staff-manager.tsx`, `POST /api/staff`) per R1.11:
  a person search by phone, email or name, Stylist/Therapist designation,
  optional specialization, and one transaction for role, profile, branch and
  audit. *29/10: shared `PersonSearch` (3+ characters, 10 results),
  `GET /api/staff/candidates` (availability from the same planner),
  `POST /api/staff` through `changeBranchRole`.*
- [ ] Add Remove staff and keep staff editing (`PATCH /api/staff/[id]`) for the
  branch's Manager, Owner and Developer, scoped to Stylists and Therapists at
  the active branch; removal reconciles future assignments and revokes sessions.
  *29/10: Remove (`POST /api/staff/[id]/remove`) and scoped editing done;
  sessions are deleted; Managers edit only Stylists and Therapists. Removal
  reports the upcoming bookings that name the person, but doesn't yet create
  durable reassignment work (R1.7, with §4 reassignment flags).*
- [ ] Add branch switcher, explicit form branch identity, cache isolation and
  stale-tab rejection; include two-tab tests and delayed-response tests.
  *29/10: switcher (`/api/me/branch`, HttpOnly cookie, full reload on switch)
  and rendered-branch checks (`assertRenderedBranch`, 409
  BRANCH_CONTEXT_CHANGED) on the people routes. Still open: the other
  branch-owned routes, two-tab and delayed-response tests.*
  *29/10: Playwright specs in `apps/admin/e2e/`: `branch-switcher`,
  `users-roles` (including the stale-branch 409), `staff`, and the opt-in
  `people-writes` (add, edit and remove a Therapist; choose and remove a
  Manager). All pass on dev against `next dev` impersonating the Owner,
  Developer, Manager and Receptionist; the disposable account and its audit
  rows were deleted afterwards. Impersonation skips the edge middleware, so
  §7 still needs the stored-session role fixtures.*
- [x] Developer-only branch creation and edits (R1.1). *29/10: done:
  `POST /api/branches` creates the branch and its Owner in one transaction,
  `PATCH /api/branches/[id]` is Developer-only and can't change the Owner,
  `GET /api/branches` lists only accessible branches.*
  *Closures (R1.8) done: `holiday.branch_id` (null = all branches, Developer
  only; migration 0010) with one closure per date per branch and one
  all-branches closure per date. `GET/POST /api/closures` and
  `DELETE /api/closures/[id]` for the branch's Manager, Owner and Developer;
  one date or a range of up to 31 days, never in the past. A closed day blocks
  online booking, reschedule, gems redemption, walk-ins and approval;
  bookings already on it are listed, not cancelled. Schedule page: closures
  panel and grid markers; availability returns `closure`. Live suite
  `closures.integration.test.ts` (7).*
  *Shutdown and delete (R1.10) done: migration 0011 triggers refuse new
  bookings and invoices at a shut-down branch and refuse the shutdown while a
  Manager, active staff, open bookings, unpaid invoices or open waitlist
  entries remain. `GET /api/branches/[id]/shutdown-check` lists them and the
  editor holds the save until clear; `PATCH` returns 409
  BRANCH_SHUTDOWN_BLOCKED with the list. `DELETE /api/branches/[id]` removes
  a shut-down branch that no record names (409 BRANCH_NOT_EMPTY otherwise);
  an Owner with no other branch returns to Customer in the same transaction
  and loses live updates. Live suite `branch-shutdown.integration.test.ts`
  (7).*
- [x] Scope shared customer projections, spending totals, exports, private notes
  and branch lists. Verify a third Owner cannot infer another branch's money.
  *29/10: identity, visits, tags and gems shared; LTV and average spend from
  the active branch's paid invoices; `total_spent_paise` never leaves the
  database; other branches' visits as date, branch and services only; notes
  with explicit visibility. Memberships sold elsewhere hide the price
  (migration 0007, `selling_branch_id`). Live suites: customers (7),
  memberships (5).*
- [x] Rename all booking/schedule/leave channels, scope token capabilities and
  implement existing-token revocation, retry/audit and legacy-token cutover tests.
  *29/10: branch-qualified channels; tokens cover the person's branches
  only, live 10 minutes and are bound to the user. Role changes write a
  `realtime_revocation` outbox row in their batch (migration 0008); Ably
  revokes now and again after the TokenRequest window; retries through the
  QStash-triggered job plus a daily sweep. Before launch: issue tokens from
  an Ably key with "Revocable tokens" enabled (key cutover, rollout).*
- [x] Send background-job alerts and reports per branch (R7.4, R6.5).
  *29/10: stale-pending and no-show alerts go to the booking's branch front
  desk (Receptionist, and Manager or the Owner without one); lead
  follow-ups to the assignee while they hold a role at the lead's branch,
  else that front desk, one per person per IST day; daily and weekly
  reports per branch to its Owner and Manager, the summary across branches
  to the Developer and Slack only; reminders and review requests name the
  branch and link its own Google listing. `DAILY_REPORT_EMAIL_RECIPIENTS`
  retired. Live suite `branch-jobs.integration.test.ts` (5). Monthly GST per
  branch and issuer stays with §5 (issuer snapshots).*

## 4. Implement scheduling and membership lifecycle

- [ ] Replace instant-completed membership entry with request/confirm/start/
  complete operations and one assignee; introduce actual timestamps and retained
  eligibility/history needed by retrospective entries.
- [ ] Implement reserve/consume/release transactions, state guards, stable
  operation keys, booking-level uniqueness and ledger reconciliation (MS-01–06).
- [ ] Apply membership validity at planned and actual start. Preserve completion
  after a valid start; return no-show holds without extending expiry.
- [ ] Integrate every mutation and lifecycle job with occupancy; test direct SQL
  consistency and races against schedule changes, leave and role removal.
- [ ] Add durable reassignment/overrun flags and manual reception actions. Actual
  start remains blocked even when alerts fail (MS-07–10).
- [ ] Add bounded, authorized retrospective recording/corrections with audit,
  historical time/conflict checks and safe accounting (MS-11–13).

## 4b. Membership sales and tiers (admin portal)

Acceptance: MS-14 to MS-19 and TX-11.

- [ ] Add a Membership tiers screen with create/update APIs beside the current
  GET-only `apps/admin/src/app/api/membership-tiers/` route. Receptionists and
  above edit name, usual hours, usual price, usual validity, active state and
  order; the server lets only the Developer change tax classification.
- [ ] Rework `/memberships/new`
  (`apps/admin/src/app/memberships/new/create-membership-form.tsx`): tier
  prefill, an hours counter in 1-hour steps with a 1-hour minimum, an
  independent agreed-price field, an expiry date picker and payment method.
- [ ] Resolve the selling branch from the authorized active branch. Remove
  `PRIMARY_BRANCH_ID` from `apps/admin/src/app/api/memberships/route.ts` and
  `apps/admin/src/app/api/memberships/[id]/sessions/route.ts`.
- [ ] Store the tier snapshot (name, usual hours and usual price), agreed hours
  and price, seller and selling branch, and issue the purchase invoice from the
  selling branch in the same transaction.
- [ ] Show the agreed price next to the tier's usual price from that snapshot in
  `apps/admin/src/app/memberships/memberships-list.tsx`; leave the usual price
  blank for memberships sold before the snapshot exists.
- [ ] Check customer pages, emails and invoice lines for tier names or usual
  tier prices, and show the membership's own hours, price paid and expiry instead.

## 4c. Cross-branch settlement (memberships and gems)

Acceptance: MS-20 to MS-25, ST-01 to ST-08 and TX-12. Spec:
[settlement.md](settlement.md). Entries must exist from launch; the statement
screen may follow by 31 January 2027.

- [ ] Add `settlement_entry`, `branch_settlement` and `loyalty_allocation`, plus
  a branch on `loyalty_transaction` (additive migration). Keep price paid and
  purchased minutes fixed after sale. Add the share rate (100%) and value per
  gem (₹1.00) as Developer settings.
- [ ] Write each membership session's entry in the statement that consumes its
  minutes: value, GST share and amount owed, 64-bit arithmetic, one entry per
  session booking. Cover concurrent completions, retries and reversing entries.
- [ ] Gems batches: allocate earliest-expiring gems first in both redemption
  paths (`redeemServiceWithGems` and checkout in `admin-bookings.ts`), in the
  statement that deducts the balance. Record entries when the free service is
  completed; return gems when it is rejected, cancelled or missed.
- [ ] Fix `jobGemsAutoExpire` to expire only unspent gems, and add a database
  check that a gems balance never goes below zero.
- [ ] Add a daily, idempotent QStash job (`settlement-close`) that closes every
  ended IST month into per-pair statements with netting and per-branch net
  positions, with a heartbeat.
- [ ] Add a Settlements page and API for the two branches' Owners and the
  Developer: statements, entries, CSV export, and mark paid with date and
  reference (paying branch's Owner or Developer), audited.
- [ ] Show membership and gems amounts delivered, to receive and to pay in each
  branch's monthly report.

## 5. Implement branch settings and invoice integrity

- [ ] Add validated branch booking settings and revisions; route all relevant
  actions/jobs through the branch resolver rather than hardcoded/default policy.
- [ ] Add effective-dated tax versions, per-service/tier SAC mapping, provisional
  seed values and launch-review status (TX-01–04, TX-08–11).
- [ ] Update pure GST calculation to accept resolved rates and preserve paise
  rounding; wire checkout and membership purchases to actual branch settings.
- [ ] Add immutable invoice issuer/item/tax snapshots and transactional branch/FY
  numbering. Cover duplicate submissions, rollback and historic rendering.
- [ ] Update PDF payload/rendering, emails and branch GST/sales reports to read
  stored invoice facts (TX-05–07). Never recompute old tax from today's settings.

## 6. Implement CMS availability, offers and customer flows

- [ ] Enable version history with editor attribution on services, categories
  and offers (design §5). Keep signed-in write access for the Owner, Manager and
  Developer logins, with no CMS roles at launch. Make the SAC field a select
  limited to the reviewed codes.
- [ ] Add category/service All branches or selected branch relationships and
  service SAC fields, including new-branch behavior and available-branch labels.
- [ ] Add the offer record structure (design §5): website card plus an optional
  checkout rule with percentage/flat/combo price, linked services and dates;
  retirement; validated transactional upsert into the app mirror. Add the
  "Show on website" tick (approved 28 October), on by default. Make
  admin Offers read-only with a Payload link only after the CMS ownership cutover
  is ready, and do not migrate admin-created test offers.
- [ ] Add Developer repair/resync with revision checks and parity verification;
  extend detect-only drift monitoring to offers and availability.
- [ ] Enforce offer/customer/IST-day uniqueness under concurrent checkout across
  branches; keep invoice rule snapshots when offers later change.
- [ ] Apply branch availability to booking, walk-in, checkout additions, gems and
  membership sessions. Preserve valid historical/confirmed service snapshots.
- [ ] Update public hours/holidays, contact/footer, booking notifications, leads,
  privacy copy and branch-specific reports/jobs (R3/R4/R7).

## 7. Verify, rehearse and prepare launch

- [ ] Pass focused unit/property tests for pure rules and integration tests on
  disposable infrastructure for constraints, transactions and provider behavior.
- [ ] Pass affected app typechecks/lint/builds and populated Playwright role
  fixtures. Missing/skipped authorization fixtures do not count as a pass.
- [ ] Run the complete two-branch journey and adversarial third-branch access
  suite, existing-token checks and all MS/TX acceptance cases. Close Gate 1.
- [ ] Harden full backup and restore verification, isolate temporary targets and
  validate snapshot manifests, schema, counts, balances and object references.
- [ ] Rehearse migration, rollback/forward repair, CMS cutover and exact test-only
  cleanup from the chosen backup; verify teardown and close Gate 2.
- [ ] Prepare reviewed launch tax/SAC/GSTIN values, genuine operational data,
  deployment evidence, cleanup preview and production recovery runbook.
- [ ] Run the separately authorized production operations with current evidence,
  preserve real records and close Gate 3 before accepting real business activity.

## Launch scope candidates to defer (for phase planning)

The user approved these on 28 October 2026 as recommended: all three move after
launch, as described below. CMS roles also move after launch, to be added
before a branch with a different Owner joins.

- **Retrospective session recording** (MS-11 and
  [retrospective recording](membership-scheduling.md#retrospective-recording)):
  launch with "Record now" only. Until the audited correction workflow exists, a
  session that was not recorded at the time needs a Developer-assisted minute
  adjustment, recorded with reason and actor.
- **A separate durable delivery service:** keep writing outbox rows in the same
  transaction, but retry pending rows from a QStash scheduled job, as the other
  jobs already run on QStash, instead of building new delivery infrastructure.
  Choose the sweep interval within the QStash daily message limit noted in
  `knowledge-base/background-jobs.md`.
- **Journaled, resumable clean-up phases** (rollout clean-up step 9): if the
  clean-up preview shows a small allowlist, run it as one reviewed transaction
  instead.

## Verification boundaries

Use repository-defined Bun scripts and actual Vitest/Playwright configurations.
Do not run live integration suites, seeds, migrations, outbound notifications,
resets or role changes as generic tests. A documentation check does not satisfy
the implementation tasks above. Dates are targets; unresolved gate failures defer
optional scope or launch, not the required checks.
