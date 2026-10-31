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
- [x] Add Developer branch creation/edit/shutdown and atomic role handovers;
  preserve other branch relationships and clear only affected future assignments.
  *Creation, edits, shutdown and delete done (see R1.1 below); handovers go
  through `planBranchRoleChange` / `applyBranchRolePlan` in one guarded
  batch. The same batch now takes everyone the change touched off the
  bookings still to come at branches where they no longer work, and lists
  the confirmed ones for reassignment (R1.7, migrations 0012–0015; see the
  Remove staff item below). A shared Manager taken off one branch keeps the
  other branch's bookings.*
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
- [x] Add Remove staff and keep staff editing (`PATCH /api/staff/[id]`) for the
  branch's Manager, Owner and Developer, scoped to Stylists and Therapists at
  the active branch; removal reconciles future assignments and revokes sessions.
  *29/10: Remove (`POST /api/staff/[id]/remove`) and scoped editing done;
  sessions are deleted; Managers edit only Stylists and Therapists.*
  *Reassignment work (R1.7) done: the removal's own transaction takes the
  person off their bookings still to come (pending or confirmed, from now in
  IST); pending ones only lose the tentative assignee, confirmed ones get an
  open `booking_reassignment` entry (migration 0012), and bookings that
  should already have started keep them. The response reports the count; the
  dashboard lists the open work, the bookings list marks it "Needs staff",
  and the booking detail assigns someone else, which closes the entry.
  Ending the booking closes it too (trigger, 0013). Completion with nobody
  assigned is refused. Approving leave does the same for that day's
  bookings (R5.8). The database refuses an assignee who doesn't work at the
  branch, or who is on approved leave on a confirmed booking's day (0014,
  0015). Live suite `reassignments.integration.test.ts` (5).*
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
  branch, issuer GSTIN and SAC code: done with the issuer snapshots (§5).*

## 4. Implement scheduling and membership lifecycle

- [ ] Replace instant-completed membership entry with request/confirm/start/
  complete operations and one assignee; introduce actual timestamps and retained
  eligibility/history needed by retrospective entries.
  *Slice 1 done ([implementation design](membership-scheduling.md#implementation-design-31-october-2026)):
  "Record now" (`POST /api/memberships/[id]/sessions`) confirms and starts a
  session in one write, with `booking.started_at = now()`; `POST
  /api/bookings/[id]/start` starts any confirmed, assigned booking from the
  database's clock; completing a session (`POST /api/bookings/[id]/complete`,
  in progress only, no payment method) consumes its minutes and issues the ₹0
  session invoice and the settlement entry in one batch. One assignee per
  booking is done (slice 2, 0028): Record now needs the person doing it.*
  *Booking a session ahead done ([as built](membership-scheduling.md#booking-a-session-ahead-as-built)):
  the sessions endpoint with a `startTime` books a confirmed session for its
  date and time at the active branch, as the counter books, with validity
  checked at its planned start; the session panel has Now or Book ahead, and
  a booking for a later day can't start before its day. Still open: the
  retained history retrospective entries need (slice 4, deferred to after
  launch, see below).*
- [x] Implement reserve/consume/release transactions, state guards, stable
  operation keys, booking-level uniqueness and ledger reconciliation (MS-01–06).
  *0025 adds `membership_hold` (one per session booking, held → consumed or
  released, never deleted), `spa_membership.reserved_minutes` with the CHECK
  `used + reserved ≤ total`, and `booking.started_at`. 0026 derives each hold
  from its booking's status by trigger, keeps the totals by trigger and checks
  at commit that they equal the holds, whatever wrote them. The idempotency key
  stays on the booking (`booking_redemption_key_uidx`). Membership cancel
  cancels the unstarted sessions with it and is refused while one is in
  progress (MS-13). Live suite `membership-holds.integration.test.ts` (14).*
- [x] Apply membership validity at planned and actual start. Preserve completion
  after a valid start; return no-show holds without extending expiry.
  *Validity is checked at `coalesce(started_at, planned IST start)` within
  `[starts_at, expires_at]`, inclusive, on hold, start and move; completion
  has no validity check. The expiry job cancels unstarted sessions of expired
  memberships (`MEMBERSHIP_EXPIRED_SESSION_REASON`) and leaves those in
  progress to complete. A membership sold to start later answers 409
  `MEMBERSHIP_NOT_STARTED`.*
- [x] Integrate every mutation and lifecycle job with occupancy; test direct SQL
  consistency and races against schedule changes, leave and role removal.
  *Slice 2 done ([as built](membership-scheduling.md#slice-2-as-built-staff-occupancy)):
  0027 adds `staff_occupancy` (planned) and `staff_work` (actual); 0028 keeps
  both from `booking` and `booking_service` by trigger on every path, refuses
  direct writes, and enforces SPA/SPA and SPA/salon exclusions per person at
  every branch (MS-07) and one assignee per confirmed booking at commit
  (MS-10). Leave approval and staff removal already clear the assignee
  (0014), which drops the rows in the same transaction. Live suite
  `staff-occupancy.integration.test.ts` (8).
  *Slice 3 done ([as built](membership-scheduling.md#slice-3-as-built-schedule-leave-and-closure-changes)):
  the weekly schedule limits confirmed bookings (0032 `staff_off_schedule`;
  no row means the branch's hours). Saving a week takes the person off the
  bookings still to come it no longer covers, at every branch, flagging the
  confirmed ones `off_schedule` (0031); a move keeps the person or goes
  ahead without them with the reason; a deferred recheck refuses a confirmed
  booking written onto a day or time its person can't take. Bookings on
  closed days are a dashboard list, moved or cancelled from the booking
  (new admin `reschedule` and `cancel` routes). Live suite
  `schedule-revalidation.integration.test.ts` (10), including a save racing
  an assignment.*
- [x] Add durable reassignment/overrun flags and manual reception actions. Actual
  start remains blocked even when alerts fail (MS-07–10).
  *Reassignment part done (see Remove staff in §3): `booking_reassignment`
  with reasons `left_branch` and `unavailable`, the dashboard list, "Needs
  staff" in the bookings list, assign from the booking detail, and
  completion blocked while unassigned. The start action exists and is refused
  while unassigned. A start is refused while the person's earlier work runs
  (0028, `STAFF_BUSY`), and the backfill flags clashing bookings `overrun`.
  *Slice 2b done ([as built](membership-scheduling.md#slice-2b-as-built-held-up-bookings-and-busy-candidates)):
  the `staff-overrun-check` job (every 15 minutes in the salon day) and a
  refused start flag a booking held up more than 10 minutes, keeping its
  assignee ("Held up"), and push its branch front desk with up to three free
  candidates; the flag ends when the booking starts (0029–0030), is
  reassigned, moved or ends. `GET /api/staff` with a booking or a
  starting-now slot gives each person's busy reason, and the pickers show
  it, disabling whom the database would refuse. Live suite
  `staff-overruns.integration.test.ts` (4). Slice 3 adds the schedule
  reason `off_schedule`, and reception moves or cancels a booking from its
  detail page (`POST /api/bookings/[id]/reschedule` and `/cancel`, not
  counted against the customer).*
- [ ] Add bounded, authorized retrospective recording/corrections with audit,
  historical time/conflict checks and safe accounting (MS-11–13).

## 4b. Membership sales and tiers (admin portal)

Acceptance: MS-14 to MS-19 and TX-11.

- [x] Add a Membership tiers screen with create/update APIs beside the current
  GET-only `apps/admin/src/app/api/membership-tiers/` route. Receptionists and
  above edit name, usual hours, usual price, usual validity, active state and
  order; the server lets only the Developer change tax classification.
  Done: `/memberships/tiers` (`tiers-manager.tsx`), `POST /api/membership-tiers`,
  `PATCH /api/membership-tiers/[id]`; tier `sac_code` from migration 0016
  (6-digit check in the database, the reviewed list in Zod); tiers are retired,
  never deleted. GET returns `{ tiers, canEditTax }`.
- [x] Rework `/memberships/new`
  (`apps/admin/src/app/memberships/new/create-membership-form.tsx`): tier
  prefill, an hours counter in 1-hour steps with a 1-hour minimum, an
  independent agreed-price field, an expiry date picker and payment method.
  Done, plus a start date (today in IST by default, at most 60 days ahead) and
  an expiry at most 1095 days after it; the sale sends `hours`, `pricePaise`,
  `startDate` and `expiresOn`.
- [x] Resolve the selling branch from the authorized active branch. Remove
  `PRIMARY_BRANCH_ID` from `apps/admin/src/app/api/memberships/route.ts` and
  `apps/admin/src/app/api/memberships/[id]/sessions/route.ts`.
- [x] Store the tier snapshot (name, usual hours and usual price), agreed hours
  and price, seller and selling branch, and issue the purchase invoice from the
  selling branch in the same transaction.
- [x] Show the agreed price next to the tier's usual price from that snapshot in
  `apps/admin/src/app/memberships/memberships-list.tsx`; leave the usual price
  blank for memberships sold before the snapshot exists.
- [x] Check customer pages, emails and invoice lines for tier names or usual
  tier prices, and show the membership's own hours, price paid and expiry instead.
  Done: the purchase invoice line reads "SPA membership: N hours, valid until
  DD/MM/YYYY"; web `/membership` and `GET /api/membership` use
  `getOwnMemberships`; the expiry job no longer reads the tier name. TX-11:
  *30/10: the purchase invoice is taxed at the selling branch's rate in force
  for the tier's SAC code (§5).*

## 4c. Cross-branch settlement (memberships and gems)

Acceptance: MS-20 to MS-25, ST-01 to ST-08 and TX-12. Spec:
[settlement.md](settlement.md). Entries must exist from launch; the statement
screen may follow by 31 January 2027.

- [x] Add `settlement_entry`, `branch_settlement` and `loyalty_allocation`, plus
  a branch on `loyalty_transaction` (additive migration). Keep price paid and
  purchased minutes fixed after sale. Add the share rate (100%) and value per
  gem (₹1.00) as Developer settings.
  *31/10: four migrations, because drizzle migrate runs every pending file in
  one transaction and the new `returned` enum value can't be used as a literal
  in it. 0021 (generated, additive): `settlement_period`, `settlement_entry`,
  `branch_settlement`, `settlement_position`, `loyalty_allocation`, and
  `branch_id`/`batch_id`/`redemption_id` on `loyalty_transaction`. 0022
  (custom): the guards (an entry's month set by the database, closed months,
  statements and positions unchangeable, allocations fixed once made, price
  paid and purchased minutes fixed after sale by `spa_membership_terms_fixed`),
  the backfill of branches and batches, and the `settlement` setting
  `{ shareBps: 10000, gemValuePaise: 100 }` (the old `gems_value_paise` row is
  removed). 0023 (generated): the checks that need the backfill, including the
  gems balance never below zero. 0024 drops the per-entry `gst_share <= value`
  cap: floors can put the GST share 1 paisa over the value on a membership
  worth under a paisa a minute, and sums stay exact. Settings → Settlement
  edits both values (Developer, audited); unreadable settings are 409
  `SETTLEMENT_SETTINGS_INVALID`, never a default.*
- [x] Write each membership session's entry in the statement that consumes its
  minutes: value, GST share and amount owed, 64-bit arithmetic, one entry per
  session booking. Cover concurrent completions, retries and reversing entries.
  *31/10: inside the `spendMinutes` CTE of `recordMembershipSession`, so the
  membership row lock orders concurrent sessions; the entry stores the share
  it used and who recorded it. Live suite `settlement.integration.test.ts` (9):
  rates adding up to the price and GST, no rounding drift, concurrent
  sessions, internal entries, reversal in the open month. Moves into the
  completion statement with the lifecycle work in §4.*
- [x] Gems batches: allocate earliest-expiring gems first in both redemption
  paths (`redeemServiceWithGems` and checkout in `admin-bookings.ts`), in the
  statement that deducts the balance. Record entries when the free service is
  completed; return gems when it is rejected, cancelled or missed.
  *31/10: `gems-ledger.ts` (FIFO by expiry, then earning time; only batches
  not yet lapsed). `updateBookingStatus` is replaced by guarded
  `rejectBooking`/`markBookingNoShow` (pending only / confirmed only, 409 on a
  concurrent change); customer cancel and the lapsed-pending job return gems
  too; gems of a batch that lapsed meanwhile expire straight away. Live suite
  `gems-ledger.integration.test.ts` (10), including two concurrent
  redemptions. The customer's history shows "Returned".*
- [x] Fix `jobGemsAutoExpire` to expire only unspent gems, and add a database
  check that a gems balance never goes below zero.
  *31/10: `expireLapsedGems`; the reminder counts unspent gems only. New
  expiries read "Expired: gems earned on DD/MM/YYYY"; the old `expired:<id>`
  markers are hidden on `/gems`.*
- [x] Add a daily, idempotent QStash job (`settlement-close`) that closes every
  ended IST month into per-pair statements with netting and per-branch net
  positions, with a heartbeat.
  *31/10: `0 19 * * *` UTC (00:30 IST), heartbeat `SETTLEMENT_CLOSE`. Closing
  marks the months first, which waits for entries still being recorded; only
  the transaction that closed a month can insert its statements and
  positions.*
- [x] Add a Settlements page and API for the two branches' Owners and the
  Developer: statements, entries, CSV export, and mark paid with date and
  reference (paying branch's Owner or Developer), audited.
  *31/10: `/settlements` (route policy `settlement`; 404 for anyone else, so a
  statement's existence isn't disclosed); `GET /api/settlements`,
  `GET /api/settlements/[id]` (`?format=csv`),
  `POST /api/settlements/[id]/paid` (once; not a future date; internal
  transfer only between one Owner's branches) and
  `POST /api/settlements/entries/[id]/reverse` (Developer, with a reason).
  Route tests (50), component test with axe (18).*
- [x] Show membership and gems amounts delivered, to receive and to pay in each
  branch's monthly report.
  *31/10: Reports → "Memberships and gems across branches" for the selected
  range. A Manager sees the minutes and gems only: another branch's membership
  value would reveal its rate.*

## 5. Implement branch settings and invoice integrity

- [x] Add validated branch booking settings and revisions; route all relevant
  actions/jobs through the branch resolver rather than hardcoded/default policy.
  *30/10: `branch_setting` (0019) keeps each branch's business hours and
  booking rules as numbered revisions, the whole document per revision; 0020
  backfills revision 1 from the old shared rows (else the documented
  defaults), gives a new branch the primary branch's current settings, numbers
  revisions without gaps and makes them unchangeable. Bookings record the
  revision that accepted them (composite FK to their own branch); status-log
  entries the revision a cancellation or reschedule used. One resolver
  (`packages/business/src/booking/policy.ts`) decides slots (hours that
  weekday, 30-minute grid; for customers the lead time and booking window),
  the per-branch limit of upcoming bookings, late cancellations (allowed,
  never charged, counted in `late_cancellation_count`) and reschedules (per
  booking, with a cut-off). Availability, booking, gems redemption, walk-ins,
  cancel, reschedule and the booking page all use it; walk-ins only follow the
  hours. Unreadable or missing settings are a 409 `BRANCH_SETTINGS_INCOMPLETE`,
  never defaults; a cancellation still goes through. Settings saves name the
  revision they were edited from (409 `SETTINGS_CHANGED`). No job reads
  booking rules: reminder, close-out and no-show timings are product
  constants, and no-show thresholds stay global because the count is per
  customer. Live suite `branch-settings.integration.test.ts` (13); E2E
  `apps/admin/e2e/settings.spec.ts`.*
- [x] Add effective-dated tax versions, per-service/tier SAC mapping, provisional
  seed values and launch-review status (TX-01–04, TX-08–11).
  *30/10: `branch_tax_version` (0017) per branch and SAC code, integer basis
  points, from 00:00 IST on its date; versions can't change, and one in force
  can't be deleted, only its review recorded (0018 trigger). A first rate may
  start on any date, a change only in the future. 0018 seeds a provisional 5%
  for 999721/2/3/9 at every branch from 22/09/2025, and a new branch copies
  the primary branch's rates in force. SAC codes on categories (seeded by
  slug), services (override) and tiers; the CMS field is §6. Developer-only
  Tax screen at `/settings/tax` (`/api/tax-versions`). The GST setting is gone;
  `invoicing.live` (default off) turns on TX-08 at issue: legal name, GSTIN and
  reviewed rates. No fallback rate: a missing one is a 409
  `TAX_CONFIGURATION_INCOMPLETE` before anything is written.*
- [x] Update pure GST calculation to accept resolved rates and preserve paise
  rounding; wire checkout and membership purchases to actual branch settings.
  *30/10: `packages/business/src/invoicing/tax.ts` (`prepareInvoiceTax`):
  per line, after its largest-remainder share of the discount; taxable value
  rounded half up; CGST half rounded down. Checkout, membership sales and
  sessions use it through `apps/admin/src/lib/api/invoice-tax.ts`. `gst.ts`
  (18%) deleted.*
- [x] Add immutable invoice issuer/item/tax snapshots and transactional branch/FY
  numbering. Cover duplicate submissions, rollback and historic rendering.
  *30/10: every new invoice carries its issuer, tax point, financial year,
  sequence and review status, every line its SAC code, version, rate and
  amounts (0017 checks, 0018 triggers); issued facts can't change. Numbers
  `RS/2627/000123` from `invoice_sequence` in the issuing batch; the prefix is
  fixed once a branch has issued. One invoice per booking; a stale completion
  is a 409. Live suite `invoice-issue.integration.test.ts` (11): concurrent
  numbering, rollback without a used number, the rate and snapshot triggers,
  duplicate booking, fixed prefix, copied and fixed versions, GST summary.*
- [x] Update PDF payload/rendering, emails and branch GST/sales reports to read
  stored invoice facts (TX-05–07). Never recompute old tax from today's settings.
  *30/10: `buildPdfPayload` (template v2: per-line SAC and rate, stored CGST/
  SGST, test-invoice badge, ₹0 session note) with legacy invoices rendered as
  before; the email prints the stored split and issuer; the R2 key keeps
  older numbers' paths. The monthly GST summary is rebuilt per branch, issuer
  GSTIN and SAC code from the stored lines. Sales reports already sum stored
  totals.*

## 6. Implement CMS availability, offers and customer flows

- [ ] Enable version history with editor attribution on services, categories
  and offers (design §5). Keep signed-in write access for the Owner, Manager and
  Developer logins, with no CMS roles at launch. Make the SAC field a select
  limited to the reviewed codes.
  *31/10: done for services and categories ([as built](catalogue-availability.md#as-built-31-october-2026-neon-dev)):
  every version kept, a read-only `editedBy` set from the CMS login on each
  save and restore, the SAC select limited to `REVIEWED_SAC_CODES` (required on
  a category). Offers get versions with their new structure (below).*
- [x] Add category/service All branches or selected branch relationships and
  service SAC fields, including new-branch behavior and available-branch labels.
  *31/10: app 0033 (`all_branches`, `service_branch`, `service_category_branch`)
  and 0034 (`service_available_at`, trigger
  `booking_service_availability_guard`), Payload migration
  `catalogue_tax_versions_availability` (branch picker from
  `/api/catalogue-branches`). All branches includes branches added later; a
  service is offered where its category is too. Labels: "Only at …" on
  `/services` and `/services/[slug]` (R7.2).*
- [ ] Add the offer record structure (design §5): website card plus an optional
  checkout rule with percentage/flat/combo price, linked services and dates;
  retirement; validated transactional upsert into the app mirror. Add the
  "Show on website" tick (approved 28 October), on by default. Make
  admin Offers read-only with a Payload link only after the CMS ownership cutover
  is ready, and do not migrate admin-created test offers.
- [ ] Add Developer repair/resync with revision checks and parity verification;
  extend detect-only drift monitoring to offers and availability.
  *31/10: drift now compares SAC codes and availability; a normal save
  upserts, so it recreates a missing service or category mirror (R4.7).
  Still open: offers drift and the Developer resync.*
- [ ] Enforce offer/customer/IST-day uniqueness under concurrent checkout across
  branches; keep invoice rule snapshots when offers later change.
- [x] Apply branch availability to booking, walk-in, checkout additions, gems and
  membership sessions. Preserve valid historical/confirmed service snapshots.
  *31/10: `assertServicesOfferedAt` in customer bookings, walk-ins, gems
  redemptions and membership sessions (400 naming the service), with the
  0034 trigger refusing any other writer (409 if the catalogue changed in
  between). There is no checkout-additions path to cover. Existing lines keep
  their service; the dashboard lists bookings still to come with a service
  the branch no longer offers (R4.4). The booking dialog, gems ("Redeem at"
  picker, replacing the hard-coded Rayasandra id), walk-in form and session
  panel show only what the branch offers. Live suite
  `catalogue-availability.integration.test.ts` (6); admin E2E
  `catalogue-availability.spec.ts`.*
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
