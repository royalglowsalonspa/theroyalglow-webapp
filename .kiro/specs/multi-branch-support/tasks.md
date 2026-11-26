# Implementation tasks: multi-branch support v6

An ordered work plan. A checked item records completed work; italic notes
record the verification environment and any remaining release steps. Read
[requirements](requirements.md), [design](design.md),
[membership/scheduling](membership-scheduling.md), [tax/settings](tax-settings.md)
and [rollout](rollout.md) before selecting work.

## 1. Establish the release baseline

- [x] Inventory current uncommitted admin/CRM/Next changes and their checks; keep
  unrelated work separate from feature commits. *22/11: the draft PR branch
  matched its remote before work resumed. The untracked handoff stayed local.
  The Next.js 16.4.5 dependency update is separate from the feature changes.*
- [x] Add `experimental.turbopackFileSystemCacheForDev: false` to
  `apps/web/next.config.ts` and `apps/cms/next.config.ts`, matching
  `apps/admin/next.config.ts`; restart each dev server twice and confirm the
  page no longer reloads repeatedly. *22/11: browser checks on Next.js 16.4.5
  covered two restarts of each app. Web and admin made at most one follow-up
  navigation per startup. The CMS login made none once the database had a
  synthetic user.*
- [x] Map APIs, server pages/actions, exports, queries, jobs, realtime publishers,
  invoice paths and settings readers to branch/shared/self-service policies.
  *28/10: [route inventory](route-inventory.md); its six gaps feed §3.*
- [x] Record migration heads and compatible application/CMS versions; do not
  infer live state or successful deployment from a workflow file. *22/11:
  the isolated copy of Neon dev reported PostgreSQL 18.7, Drizzle migration
  `0036_invoice_offer_snapshot_guard` (37 entries) and Payload migration
  `20261121_114423_offer_checkout_rules` (7 entries). The app manifests pin
  Next.js 16.4.5 and Payload 3.91.0. Production deployment evidence belongs to
  Gate 3.*
- [x] Isolate and fix the existing membership-balance/idempotency defect with
  actual concurrent-write tests before introducing the larger lifecycle change.
  The fix can work with today's neon-http driver, as one guarded statement or a
  batch in which a database check fails the whole write, so it need not wait for
  the §2 driver decision. *28/10: implemented (guarded deduction in the batch,
  optional idempotency key with replay); SQL verified on a disposable branch
  ([spike results](spike-results.md) §1). Typecheck, Biome and unit tests pass
  (`session-request.test.ts`, `memberships.test.ts`, sessions
  `route.test.ts`). 22/11: parallel writes on disposable Neon proved that one
  branch wins the final reservation and one duplicate operation key creates one
  booking and one hold. A replay is scoped to the original branch.*

## 2. Prove the database invariants first

- [x] Decide the database driver for transactional writes (design §4): a Neon
  WebSocket `Pool` through drizzle-orm/neon-serverless, node-postgres over TCP,
  or single statements and HTTP batches with raising guards. Prove rollback on a
  failed guard, connection handling on Lambda and cold-start cost before the
  prototypes below depend on it. *28/10: decided, confirmed by the user: stay
  on neon-http with guarded statements and batches
  ([spike results](spike-results.md) §5). 22/11: the guarded batches passed
  rollback and concurrency checks on disposable Neon. Three fresh Node
  24.21.0 processes imported and initialized the HTTP driver in 17–22 ms,
  and their first query against the disposable Neon compute took 1.11–1.44 s.
  These measurements were local. Regression tests distinguish failures before
  connection from ambiguous write results. A Lambda rehearsal tool correlates
  health requests with CloudWatch reports and checks the expected rehearsal
  alias. The local SST candidate takes dedicated domains, auth settings and
  provider inputs for `rehearsal-*` stages. Mocked SST wiring checks preserved
  the production configuration, and the built web app returned both legacy
  redirects to the configured rehearsal admin origin. 23/11: the private
  Singapore ARM64 Node 24 Lambda called the candidate admin health handler
  against a separate synthetic Neon database. CloudWatch reported 154.25 ms
  cold initialization and a 371.28 ms cold invocation. Three warm invocations
  took 41.11–67.83 ms on the same revision. All four invocations proved that
  the failed database guard rolled back the preceding insert. The temporary
  Lambda and its role and log group were removed.*
- [x] Prototype role-qualified references and deferred guards on a disposable
  database: mandatory Owner, one Manager/Receptionist, shared Manager, global
  Owner/performer exclusion, preserved inactive history and protected Developer.
- [x] Prototype planned SPA/SPA and SPA/hair exclusions plus actual-start
  serialization; cover back-to-back, hair/hair, direct SQL and concurrent writes.
- [x] Prototype minute holds and exactly-once consumption with the chosen driver;
  prove zero-row guard failure rolls back booking/invoice/occupancy changes.
  *28/10: all three prototypes above passed every case run one transaction at
  a time ([spike results](spike-results.md) §2–4). 22/11: parallel conflicts,
  exactly-once hold consumption and rollback passed on disposable Neon.
  `multi-branch-schema.integration.test.ts` also checked the installed deferred
  foreign keys, exclusion constraints and triggers.*
- [x] Generate/review additive Drizzle schema, SQL, snapshots and fingerprints,
  then compatible Payload migrations with explicit ordering. No schema push.
  *28/10: first slice applied to dev as `0004_multi_branch_people`:*
  - *a `user (id, role)` key;*
  - *branch Owner and Manager references with role witnesses, deferrable;*
  - *staff profile branch and role witness, with one Receptionist per branch;*
  - *a branch on staff schedules, waitlist, leads, customer notes (with
    shared or private visibility) and the audit log.*

  *All of it stays inactive until the backfill. The SQL was hand-reordered and
  made deferrable; the drift reference is regenerated; typecheck, db tests and
  `drizzle-kit check` pass. The subsequent slices are recorded in the
  [migration table](rollout.md). On 22/11 the normal Drizzle and Payload CLIs
  applied 42 and seven migrations respectively to synthetic PostgreSQL 18.6.
  CI's drift check passed with the regenerated fingerprint.*
- [x] Design an idempotent backfill with preview/conflict report and preservation
  of existing explicit branches and historical identity/tax evidence.
  *22/11: `preview-multi-branch-backfill.sql` reports projected row counts and
  conflicts before the one-time `0005` migration. It found no pending updates
  or conflicts on the disposable dev copy. Rehearsal against the selected
  backup remains in Gate 2.*

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
    paused): see [rollout](rollout.md#application-migrations).
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
- [x] Update Users & Roles (Owner and Developer: Manager and Receptionist),
  Staff, schedules, leave and missing-Manager reminders. Remove the active
  toggle; retain historical staff identities. *29/10: Users & Roles
  (`/api/users`, `/api/users/branch-roles`, `users-manager.tsx`) and Staff
  done for the active branch; the active toggle is gone and removed staff
  keep an inactive profile. Schedules and leave are branch-scoped.*
  *29/10: missing-Manager reminder (R1.9) done: `missing-manager-reminder`
  job (10:00 IST, one email per Owner per IST day, stops once a Manager is
  assigned; notification type `branch_manager_missing`, migration 0009 on
  dev) and a dashboard banner with an assign link for the Owner and the
  Developer. 22/11: concurrent runs claim one reminder per Owner and IST day.
  A designation change releases incompatible future assignments and leaves
  completed work in the original history. Disposable PostgreSQL verified
  the assignment guard, staff edit and reassignment flag.*
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
- [x] Add branch switcher, explicit form branch identity, cache isolation and
  stale-tab rejection; include two-tab tests and delayed-response tests.
  *29/10: switcher (`/api/me/branch`, HttpOnly cookie, full reload on switch)
  and rendered-branch checks (`assertRenderedBranch`, 409
  BRANCH_CONTEXT_CHANGED) on the people routes. 22/11: branch-scoped admin
  responses use `private, no-store`. With a stored Owner session, Playwright
  verified that a real third branch is refused, a stale tab gets 409, and a
  delayed lead response cannot repaint the old branch after switching.*
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
  *22/11: customer and salon reschedules queue a no-show check for the new
  slot. The signed receiver checks the booking's current IST end time plus
  15 minutes and claims one notification per recipient and slot.*

## 4. Implement scheduling and membership lifecycle

- [x] Replace instant-completed membership entry with request/confirm/start/
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
  a booking for a later day can't start before its day. Completed work
  retains its actual interval and a retained profile. The retrospective
  workflow records any reviewed evidence with the affected visit.*
- [x] Implement reserve/consume/release transactions, state guards, stable
  operation keys, booking-level uniqueness and ledger reconciliation (MS-01–06).
  *0025 adds `membership_hold` (one per session booking, held → consumed or
  released, never deleted), `spa_membership.reserved_minutes` with the CHECK
  `used + reserved ≤ total`, and `booking.started_at`. 0026 derives each hold
  from its booking's status by trigger, keeps the totals by trigger and checks
  at commit that they equal the holds, whatever wrote them. The session creation
  key stays on the booking (`booking_redemption_key_uidx`). On the local release
  candidate, 0042 records the completion key and response data in the same
  transaction as the invoice and debit. The browser receives the original
  response when it repeats the request and a conflict when it changes the
  request under the same key. Older clients can still complete a session once
  without a key. Cancelling a membership cancels unstarted sessions and is
  refused while one is in progress (MS-13). Live suite
  `membership-holds.integration.test.ts` (18).*
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
- [x] Add bounded, authorized retrospective recording/corrections with audit,
  historical time/conflict checks and safe accounting (MS-11–13).
  *22/11: Developers can record an omitted visit with reviewed historical
  eligibility evidence. A disposable Neon test verified duplicate races,
  expired-but-valid visits, staff overlap rollback, the closed work interval,
  and one audited invoice and settlement. The approved correction workflow
  links a signed, append-only adjustment to the issued invoice. The database
  updates the balance, audit and cross-branch settlement together. The
  membership and invoice pages display the correction history. Disposable
  Neon verified the immutable original invoice and hold, the updated balance
  and settlement, branch/role refusal, and duplicate correction races.*

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
  GSTIN and SAC code from the stored lines. 22/11: Daily and weekly sales
  emails break each branch's stored totals down by invoice issuer. Weekly
  reports include issuers and branches that had activity only in the
  comparison period.*

## 6. Implement CMS availability, offers and customer flows

- [x] Enable version history with editor attribution on services, categories
  and offers (design §5). Keep signed-in write access for the Owner, Manager and
  Developer logins, with no CMS roles at launch. Make the SAC field a select
  limited to the reviewed codes.
  *31/10: done for services and categories ([as built](catalogue-availability.md#as-built-31-october-2026-neon-dev)):
  every version kept, a read-only `editedBy` set from the CMS login on each
  save and restore, the SAC select limited to `REVIEWED_SAC_CODES` (required on
  a category). 21/11: offers too, with their new structure (below).*
- [x] Add category/service All branches or selected branch relationships and
  service SAC fields, including new-branch behavior and available-branch labels.
  *31/10: app 0033 (`all_branches`, `service_branch`, `service_category_branch`)
  and 0034 (`service_available_at`, trigger
  `booking_service_availability_guard`), Payload migration
  `catalogue_tax_versions_availability` (branch picker from
  `/api/catalogue-branches`). All branches includes branches added later; a
  service is offered where its category is too. Labels: "Only at …" on
  `/services` and `/services/[slug]` (R7.2).*
- [x] Add the offer record structure (design §5): website card plus an optional
  checkout rule with percentage/flat/combo price, linked services and dates;
  retirement; validated transactional upsert into the app mirror. Add the
  "Show on website" tick (approved 28 October), on by default. Make
  admin Offers read-only with a Payload link only after the CMS ownership cutover
  is ready, and do not migrate admin-created test offers.
  *21/11 ([as built](offers.md#as-built-21-november-2026-neon-dev)): Payload
  `offer` holds the card, "Show on website" and a "Checkout rule" group,
  validated on save against active salon services and mirrored in the save's
  transaction to `cms_offer_<id>` (0035: `cms_id`, `show_on_website`,
  `offer_cms_rule_check`; Payload migration `offer_checkout_rules`). A rule
  removed retires the mirror. While sync is off, a save with a rule is
  refused. Admin Offers is read-only (`POST`/`PATCH` answer 410) and labels
  the admin-made rows as test offers; they are not migrated. Checkout lists
  the offers that apply (`GET /api/bookings/[id]/offers`) and the discount
  covers only the linked lines.*
- [x] Add Developer repair/resync with revision checks and parity verification;
  extend detect-only drift monitoring to offers and availability.
  *31/10: drift now compares SAC codes and availability; a normal save
  upserts, so it recreates a missing service or category mirror (R4.7).
  21/11: offers drift too (each CMS rule against its mirror, no timestamps;
  a rule-free offer's mirror must be inactive). 21/11
  ([as built](catalogue-resync.md#as-built-21-november-2026-neon-dev)):
  Integrations → Catalogue sync lists the drift by record; the Developer's
  resync (`POST /api/catalogue-sync`, at most 25) copies each CMS row into its
  mirror in its own transaction, only while the CMS row is at the revision the
  report showed (`FOR UPDATE`; else 409 `CATALOGUE_CHANGED`), checks
  dependencies first, audits every attempt and reports what a fresh read still
  finds. Job 20 stays detect-only. Live suite
  `catalogue-resync.integration.test.ts` (6).*
- [x] Enforce offer/customer/IST-day uniqueness under concurrent checkout across
  branches; keep invoice rule snapshots when offers later change.
  *21/11: the redemption is written in the completion batch only while the
  offer is live on the IST day (else 409 `OFFER_EXPIRED`), and the unique
  `(customer_id, redeemed_date)` refuses a second one at any branch, even at
  the same moment (409 `OFFER_NOT_APPLICABLE`); either way the invoice rolls
  back. 0036 fixes the invoice's offer snapshot. Live suite
  `offers.integration.test.ts` (7).*
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
- [x] Update public hours/holidays, contact/footer, booking notifications, leads,
  privacy copy and branch-specific reports/jobs (R3/R4/R7).
  *22/11 ([implementation notes](customer-flows.md)): The website reads the
  branch directory with a short cache and a Rayasandra fallback. Contact lists
  branch hours and upcoming closures and routes enquiries to the selected
  branch. The booking flow shows the selected day's hours, and booking views
  show the appointment location. Reception can move an open lead to another
  branch in one audited write that keeps the notes and clears the assignee.
  Lead and report views use the existing authorized branch switcher. Booking
  change and reminder emails use branch contact details. Invoice emails use
  the recorded issuer details and include the PDF when available. The
  privacy policy and onboarding already explain data sharing across
  branches. Launch verification remains in §7.*

## 7. Verify, rehearse and prepare launch

The Owner selected the existing production services for deployed validation.
Local and disposable-database evidence closes implementation readiness.
[Gate 2](rollout.md#gate-2-exact-production-backup-and-recovery-readiness) still
uses an empty quarantined database to verify the selected backup.
[Gate 3](rollout.md#gate-3-production-gono-go) covers production smoke tests and
go/no-go.

- [x] Pass focused unit/property and disposable-database integration tests for
  constraints, transactions and provider contracts. Record live checks for
  the production window.
  *22/11: Lead transfer, duplicate booking approval and branch job/report
  checks ran on disposable Neon branches. The settlement suite passed all 10
  cases and the branch-role, invoice and offer suites passed 29 cases. Both
  live Payload suites passed all 19 cases against local PostgreSQL 18.6 with
  synthetic data, including rollback across schemas, fixture teardown and an
  idempotent catalogue seed. Eight live suites on a disposable Neon copy with
  all 42 migrations passed 87 cases across membership, invoice, settlement,
  staff and branch settings. Two suites affected by the default five-second
  remote-query allowance passed all 23 cases on rerun with a 30-second
  allowance. The real QStash Receiver accepted both synthetic
  rotation keys and rejected a changed request body. A QStash rehearsal script
  checks the invoice handler's unsigned rejection and the exact signed delivery
  log without an invoice ID. The built admin app returned HTTP 401 unsigned and
  200 for the locally signed request. Local tests verified that the signed
  handler returns without database, render, email or heartbeat work. The script
  also compares stage schedules against the canonical UTC crons through a
  read-only list.
  Ably response tests verify the application keeps unconfirmed revocations
  pending. An isolated Ably canary is ready, and its missing-configuration
  guard passed locally. The deployed handover test is collected by Playwright
  and refused a production origin before opening fixture sessions. All 43
  focused realtime and role API unit tests passed. Seven focused suites passed
  on the disposable Neon copy with migration `0042`. The invoice suite passed
  all 12 cases after adding the TX-04 boundary check. The admin PDF payload
  and invoicing render suites passed all 18 cases. The built invoicing process
  returned 401 for a changed signed body, rendered the signed invoice, and
  reused its exact saved PDF bytes against a loopback S3 fixture. Live provider
  delivery and existing-token revocation evidence remain open. The local DB,
  business and types suites passed all 770 unit cases. 23/11: a fresh native
  PostgreSQL 18.6 database received 43 Drizzle and seven Payload migrations.
  The local SQL adapter verified successful batches and rollback when the
  final statement failed. The focused checkout, membership and tax unit suite
  passed all 101 cases. The loopback QStash probe used the real SDK to publish
  one message with zero retries and read its matching delivery event. The
  admin handler accepted both synthetic rotation keys and rejected unsigned
  and tampered requests. The Ably canary verifies the rehearsal key's app ID
  and requires provider code `40141` from the existing connection. The four
  rehearsal secrets loaded into SST. The separate Ably app attached a
  synthetic subscriber, then returned `40164`; its key has revocable tokens
  disabled. The staged QStash token returned HTTP 401 in both regions. These
  observations are historical. The bounded [live provider checks](rollout.md#verify-live-providers-during-the-production-window)
  use the deployed production configuration during Gate 3.*
- [x] Pass affected app typechecks/lint/builds and populated Playwright role
  fixtures. Missing/skipped authorization fixtures do not count as a pass.
  *22/11: PR #312 passed CI lint, typecheck, unit tests, CodeQL and the web
  and admin builds. Seven web browser tests passed locally. On a disposable
  Neon branch, a receptionist moved a lead and lost access to it, and an
  Owner saw it at the destination and switched between distinct branch report
  totals using development impersonation. The stored-session branch switcher,
  RBAC, Staff and Users & Roles suites then passed all 36 applicable cases
  across the main run and targeted reruns. Four switch scenarios were
  inapplicable to a Receptionist with one branch. The updated admin app also
  passed its CI lint, typecheck, tests and build. The strict dependency audit
  passed locally and in CI. The local path-rule change passed for this feature
  and rejected the same mixed diff under explicit redesign scope. PR #312
  reported no failed or pending checks at `29bdde8`. The local candidate passed
  DB and admin typechecks and the admin production build. The invoicing bundle,
  typecheck and lint passed locally. The image check remains deferred. Gate 1
  also requires the remaining release write journeys. A full Windows unit run
  with loopback and junction access passed all 3,241 tests.*
- [x] Run the local two-branch journeys, adversarial third-branch checks and
  membership/tax validation. Record the deployed checks for Gate 3.
  *22/11: a stored Owner session transferred a lead from branch A to branch B,
  lost read and write access from A, and verified the lead at B. It could
  neither switch to the third branch C nor read C's fixture. The test moved the
  lead back. Previously stale tabs were denied after a branch switch. The
  signed-session browser run on the full Drizzle release schema passed all
  three Developer membership cases, including record/complete and book/cancel,
  and five Developer/Owner tax cases. The disposable clone's fixture branches,
  leads, users and sessions were removed and retained branch and user counts
  were unchanged. A second disposable clone with local migration 0042 passed
  the signed-session completion and replay journey and 18 live membership
  cases, including atomicity across booking, invoice and settlement. An opt-in
  handover test now checks an attached subscriber during Owner removal and
  verifies denial of a fresh token from the old session. On the disposable
  database, TX-04 persisted the expected invoice rate and tax point one
  millisecond before, at and one millisecond after IST midnight. For TX-05,
  the rendered PDF showed the saved issuer, GSTIN, invoice number, IST date,
  SAC, discount, GST split and total. Its currency label now reads `INR` on
  line items and totals. A template test for TX-07 verifies the zero-charge
  session label, its saved SAC and rate, and no balance due. 23/11: the signed
  Owner test passed again on the native rehearsal with Rayasandra and
  Marathahalli accessible and Whitefield excluded. TX-03 saved a scheduled 12%
  SAC version in Rayasandra, confirmed its former 5% version still applied
  before the effective date, and checked checkout and membership purchase
  amounts after the change against Marathahalli's separate 18% rate. A signed
  Manager handover against the built loopback app denied page access, lead reads
  and writes, and fresh token requests after removal. Restoring the assignment
  left the old session invalid. A native PostgreSQL route test proved a late
  visit against an expired membership records one audited zero-charge invoice.
  It verified branch and role denial, replay, and a signed settlement adjustment
  with the original invoice preserved. Existing-token and deployed browser
  verification run during Gate 3. Two concurrent
  signed renders now return the same first-stored PDF. The real AWS SDK
  exercised the conditional write and read fallback against a loopback S3
  fixture. The private PDF route is included in the branch policy inventory.
  All 239 focused policy and billing tests and 11 invoicing tests passed.
  A fresh PostgreSQL 18.6 cluster applied all 43 Drizzle migrations and
  passed three tax and 11 settlement integration cases. TX-05 rebuilt an
  identical invoice payload after issuer, SAC and rate changes. TX-08 refused
  checkout and membership sales with invalid launch configuration. The
  rejected actions created no invoice, membership or sequence entry.
  MS-25 blocked a former paying Owner after branch handover, as well as an
  unrelated Owner, receiving Owner and customer. A two-connection test blocked
  the former Owner when payment was attempted during an in-flight handover.
  MS-18 proved that a Manager's
  concurrent tier edit cannot restore a Developer's previous SAC. TX-09
  refreshed cancellation and rescheduling terms at confirmation and
  preserved the preceding recorded revision. The two-branch route regression
  passed with mocked persistence. The synthetic databases were removed.*
- [x] Harden full backup and restore verification, isolate temporary targets and
  validate snapshot manifests, schema, counts, balances and object references.
  *22/11: capture and verification scripts use the same PostgreSQL snapshot
  for the dump and manifest, verify hashes and restore into a container with
  networking disabled. A real PostgreSQL 18.6 synthetic round trip into a
  second local cluster verified schema, manifest, amounts, object-reference
  digests and teardown. It rejected changed counts and a corrupt dump.
  The Linux PR check also passed the round trip in a network-isolated container.
  The 26/11 restore later verified the named production database backup.
  Recovery of its R2 assets remains part of Gate 2.*
- [ ] Restore the selected production backup and its referenced assets in
  quarantine. Recheck migration, CMS cutover, forward repair and exact cleanup
  against the restored copy, verify teardown and close Gate 2.
  *22/11: local synthetic PostgreSQL proved the migration order, catalogue
  cutover and idempotence, and exact cleanup of CMS drafts and public mirror
  fixtures. The Neon clone was forward-migrated from `0036` through `0041`.
  Browser and settlement fixtures were removed from Neon, and the local CMS
  test database was removed. On 22/11 Neon still reported the two staging
  branches archived, and the latest production backup and restore workflows
  had failed. A second disposable clone passed the exact-ID preview
  and cleanup of a synthetic CMS offer, its version and public mirror. It
  refused an unreviewed dependency and preserved an unrelated offer. 23/11:
  the offline asset verifier binds the reviewed inventory to the selected
  database manifest and checks the recovered file sizes and SHA-256 digests.
  Synthetic tests passed, including mismatched manifests and altered bytes.
  An exact native capture and restore of the realistic fixture matched both
  ledgers, the schema hash, three branches and four paid invoices totaling
  2,210,000 paise. Drizzle and Payload migration replay kept both migration
  counts. The preview approved a single synthetic lead ID. A rollback kept
  the lead, then the committed trial at the restored target removed that
  lead while retaining two leads, three branches and four invoices. The
  local database cluster, browser session and scratch backups were removed.
  The private `rgss-backups` bucket now exists and GitHub has the account ID.
  The workflows preflight S3 access with separate capture and restore keys.
  The later native round trip included a rendered private invoice. The restored
  database had the exact reference and the recovered 4,360-byte PDF matched the
  SHA-256 recorded in the inventory for that backup. A further PostgreSQL 18.6
  restore verified eight manifest-bound invoice and media references across
  five fixture objects, including URL and filename aliases. Removing one
  object and its file failed verification. The default manifest output
  matched the previous query. The private `rgss-backups` R2 REST path then
  returned the exact 426,707-byte synthetic archive, manifest, and fixture
  image. The recovered archive passed the empty PostgreSQL 18.6 restore with
  43 Drizzle and seven Payload migrations, matching schema and facts. The
  media checksum and its two database references passed. All nine objects
  under that rehearsal prefix and the local cluster were removed. At that point
  the live bucket had no weekly manifests or pre-migration objects. On 26/11, the
  scoped S3 capture and restore credentials worked for the exact
  candidate-bound production database backup. The isolated restore matched its
  manifest and removed the temporary target. The verified database restore
  leaves R2 byte recovery and the candidate migration, CMS cutover, forward
  repair, and cleanup preview on the selected restore open. See
  [the recovery record](rollout.md#launch-and-recovery-record).*
- [ ] Prepare reviewed launch tax/SAC/GSTIN values, genuine operational data,
  deployment evidence, cleanup preview and production recovery runbook.
  *22/11: the [runbook](rollout.md#launch-and-recovery-record) names the release
  evidence, owners and recovery checkpoints. The read-only launch preview ran
  against the complete release schema and reported the four branch-field null
  checks and the fixture issuer/rate gaps. The three branch-job heartbeat
  secrets are wired into admin. The [cleanup preview](rollout.md#read-only-cleanup-preview)
  checks the selected manifest checksum and reports reviewed IDs, retained
  references, financial effects and external follow-up. 23/11: the approved
  synthetic fixtures for branch locations, hours, staff, provisional rates
  and catalogue are applied on native disposable PostgreSQL. The launch
  preview reported zero null branch fields at the four required columns and
  correctly reported the fixture rates as provisional. Cloudflare now serves
  the 11 copied media files and health object at `media.theroyalglow.in` from
  `rgss-uploads`. The AWS workflow variables are set. A synthetic signed job
  exercised the built admin and PDF services together. The authorized branch
  received exactly the stored PDF while another branch received 404 and an
  anonymous request was refused. On 26/11, production deployment evidence
  covers web, admin and CMS. The current database had zero missing branch
  references across the four launch fields. Both non-shutdown branches have
  settings and one is operational. The Owner approved the website branch
  hours and synthetic staffing for this rollout, and deferred standalone
  invoicing. Reviewed genuine operating data, invoicing tax approval and the
  manifest-bound cleanup preview remain open. See
  [the recovery record](rollout.md#launch-and-recovery-record).*
- [ ] Run the separately authorized production operations with current evidence,
  preserve real records and close Gate 3 before accepting real business activity.
  *On 26/11, the Owner waived the maintenance window and write and CMS auto-deploy
  pauses for this rollout. The exact candidate passed promotion, database
  migration and web, admin and CMS deployment checks. Read-only production
  health, catalogue parity and public media checks passed. Sentry returned
  zero unresolved issues in the past 90 days. The signed QStash canary passed
  without issuing an invoice or sending mail. The daily catalogue parity
  schedule is registered. The other 20 schedules, Ably token revocation,
  deployed signed-session handover, exact cleanup preview and go decision
  for real business activity remain open. No application write checks or
  cleanup ran. See
  [the recovery record](rollout.md#launch-and-recovery-record).*

## Launch scope candidates to defer (for phase planning)

The user approved these on 28 October 2026 as recommended: all three move after
launch, as described below. CMS roles also move after launch, to be added
before a branch with a different Owner joins.

- **Retrospective session recording** (MS-11 and
  [retrospective recording](membership-scheduling.md#retrospective-recording)):
  launch initially scoped to "Record now". The omitted-visit workflow and
  Developer-reviewed corrections to issued records now have separate entry
  points and share the membership ledger.
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
