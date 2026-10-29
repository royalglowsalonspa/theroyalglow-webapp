# Design: multi-branch support v6

Status: proposed implementation design. Read [Requirements](requirements.md),
[Membership and scheduling](membership-scheduling.md), and
[Tax and branch settings](tax-settings.md) alongside this document.

## 1. Fixed role relationships with database enforcement

Use branch.owner_user_id (required) and branch.manager_user_id (nullable).
Reference the existing user identity with restrictive deletion behavior. Owner
may own multiple branches, Manager may manage multiple branches, and the two
holders at any branch must differ. Do not add a second branch_member authority.

Each user has one current role. This scalar is not itself a cross-table
constraint. The migration must prevent, for example, a user marked Owner being
referenced as Manager at another branch. The proposed mechanism is role-qualified
composite foreign keys, validated in a database spike before adopting the DDL:

1. Add a non-deferrable unique key on user(id, role).
2. Branch Owner references (owner_user_id, owner_role), where owner_role is
   constrained to owner, and both values are required. Manager uses the equivalent
   manager witness with a nullable user reference. Both reference user(id, role).
3. Use deferrable NO ACTION foreign-key checks for role changes that must finish
   atomically at commit; never cascade a role change into a witness column.
   Reject deletion of a referenced user.
4. Active staff profiles carry a constrained role witness matching their current
   user role and an appropriate designation. Active Receptionist/Staff require a
   branch; Managers derive branches from branch.manager_user_id and have no sole
   authority-bearing profile branch. Inactive historical profiles retain identity
   but do not grant roles, require a current performing role, or reserve capacity.
5. A partial unique index limits active Receptionists per branch. A profile remains
   unique per user; never create one profile per branch for a shared Manager.
6. A partial unique index prevents multiple Developers. A deferred database
   final-state guard also requires exactly one Developer, rejecting deletion or
   demotion of the last one even through direct SQL. The partial index is checked
   immediately and the exactly-one guard at commit, so replacing the Developer is
   one transaction that demotes the current Developer before promoting the new
   one (`BEGIN; demote; promote; COMMIT;`). The runbook in
   `knowledge-base/authentication.md` promotes first, in separate statements, and
   must change before the guard ships. The migration deliberately
   establishes the selected Developer before enabling that guard; no temporary
   bootstrap bypass remains available to runtime writers. Deferred guards also
   require active Owner/Manager/Receptionist/Staff roles to have their required
   relationship/profile; test direct SQL, not only API validation.

This design rejects simultaneous conflicting role assignments through database
constraints and row locks. A same-row owner != manager check alone is insufficient.
If the spike cannot prove these guarantees, resolve the constraint design before
implementing APIs; do not weaken requirements to UI-only checks.

Role changes lock affected users/branches in deterministic ID order, compare the
expected current holder, update references and current roles, create/reactivate
the performing profile when needed, reconcile assignments/schedules, invalidate
sessions, and record audit/outbox events in one transaction. Replacement preserves
roles at other branches; Customer fallback occurs only with no remaining role.
Changing role family requires resolving all incompatible references in that same
transaction. Reject attempts that silently affect another Owner's branch.

Add staff and Remove staff on the Staff page call this same role-change
operation for the Staff role (Stylists and Therapists). The server checks that
the actor is the Manager or Owner of the active branch, or the Developer; a
Manager cannot change a Manager, Receptionist, Owner or Developer. The person
search behind Add staff returns a minimal identity projection (name, email,
phone and eligibility) under the branch-context rules in section 2.

## 2. Authoritative branch context

One server-side resolver reads current role and branch relationships from the
database and returns the allowed branch IDs and effective role. A protected
operation receives an explicit context containing actor, branch and role; it does
not accept an arbitrary string as proof of access. user.role remains a coarse
edge/sidebar hint. Shared global endpoints use explicit separate authorization.

requireBranchRole(minRole, requestedBranch) authenticates the session, reads
current authority, validates branch status/action eligibility and returns context.
Detail/mutation queries constrain both record ID and context branch ID. Shared
customer identity reads use a separate minimal projection; branch histories and
money never become shared merely because they are joined to a shared customer.

The active-branch cookie is a preference, not authorization. Mutations include the
rendered branch ID and reject mismatched active context or record ownership.
Error messages name another selected branch only if the user can access it.
Client query/cache keys include actor and branch; branch switch invalidates stale
loads and subscriptions, and late responses cannot populate the new branch view.

Inventory APIs, page loaders, server actions, exports, jobs and realtime issuance.
Classify each as branch, shared, Developer-global, self-service, auth, health or
signed job. Static inventory coverage supplements behavioral isolation tests.
Signed jobs have no browser cookie; derive trusted branch scope from their job
record/payload and validate signatures before doing work.

## 3. Financial isolation and realtime revocation

Keep global customer counters only for authorized internal uses. Profile/list
DTOs calculate financial values for the active authorized branch. Combined Owner
views remain deferred. Shared visit/gems history cannot include private invoice
amounts, purchase documents or notes by incidental joins or exported fields.

Use branch-qualified realtime channels, including booking:{branchId}:{bookingId},
and list only authorized branch capabilities. Rename every publisher/subscriber;
no legacy booking:* or admin:bookings:* wildcard remains in issued admin tokens.
Shared Manager membership permits access across managed branches but the UI
subscribes to its current context. Self-service subscriptions expose only permitted
staff data, not entire branch financial streams.

Configure revocable issuing keys before rollout, explicitly set a 10-minute TTL,
and bind clientId to the authenticated user. After a role mutation commits, revoke
old tokens and require fresh authorization before renewal. Record the revocation
intent durably in the mutation transaction and retry failed external calls; show
failure rather than claiming immediate completion. External Ably operations cannot
be part of the PostgreSQL transaction. Test the residual exposure/failure path and
do not treat TTL as a substitute for successful revocation. Legacy non-revocable
tokens must expire or be invalidated through a reviewed key cutover before launch.
See [Ably token revocation](https://ably.com/docs/auth/revocation).

## 4. Schema responsibilities

| Entity | Intended change and invariant |
| --- | --- |
| branch | Role-qualified Owner/Manager refs; legal identity, GSTIN/state validation, weekly hours and immutable unique numbering code |
| staff_profile / staff_schedule | Add branch references; one identity per user; active single-branch Staff/Receptionist; shared Manager schedule points only to a managed branch |
| assignment/eligibility history | Retain effective role, branch and schedule evidence for service-time audit and retrospective recording; do not infer history from current rows |
| branch settings | Unique branch/section key, validated settings, revision and audit; tax versions are separate effective-dated records |
| holiday | Branch/date uniqueness; separate uniqueness for Developer-only global closures with null branch |
| lead / waitlist / customer_note | Branch reference; notes have explicit shared/private visibility |
| spa_membership | Selling branch, seller, tier snapshot (name, usual hours and usual price at sale time) and agreed hours and price, independent of the tier and fixed after sale (they define settlement values); reserved-minute accounting and lifecycle ledger; usage belongs to the session's performing branch |
| spa_membership_tier | Admin-portal starting templates shared by all branches: name, usual hours, price and validity, tax classification, active state and order. Receptionists and above edit; tax classification is Developer-only. Not synced to Payload and never shown on customer surfaces |
| settlement_entry | Insert-only ledger for [cross-branch settlement](settlement.md). Kind: membership session, gems redemption or reversal. Each entry records the owing and owed branch (equal for internal entries), the source (membership and session booking, or redeemed gems and their batch), signed minutes or gems, value, GST share and amount owed in paise, the share rate and value per gem used, the IST posting month and, once closed, the statement. Unique per session booking and per gems allocation. Written by the statement that consumes the minutes or completes the free service, using 64-bit arithmetic |
| branch_settlement | One row per pair of branches per closed IST month: membership and gems amounts each way, the net amount and direction, entry count, close time, and the paid date, payment reference and who marked it; plus each branch's net position for the month. Totals never change after close |
| loyalty_transaction | Branch of every gems transaction. An earned transaction is a batch with its expiry; its unspent gems = earned − allocated − expired, never below zero |
| loyalty_allocation | Which batches each redemption used: redemption, batch, gems, written in the statement that deducts the balance. Reversed when the free service doesn't happen; expiry only expires unspent gems |
| booking / occupancy | One assignee; planned reservations and actual execution linked transactionally through every mutation |
| service/category availability | All-branches flag plus unique entity/branch join rows; category/service intersection |
| offer mirror | Stable CMS identity, rule snapshots/history, linked services and retry-safe synchronization |
| invoice / invoice_item | Immutable issuer/tax/SAC snapshots and transactional issue key; retain history |
| invoice_sequence | Unique branch/financial-year counter; issue transaction owns allocation |
| monthly_gst_summary | Branch, period and issuer identity/version; reconcile to issued invoices |
| audit / outbox | Branch attribution, actor, before/after or event detail; durable delivery for essential reassignment/revocation work |

Shared monetary computations stay pure in packages/business; packages/db owns
transactions and constraints. HTTP handlers validate, authorize and orchestrate.
Use integer paise and minutes. Data-modifying SQL or a transactional driver must
actually support abort-on-failed-guard behavior: a batch does not automatically
abort because a guarded UPDATE returned zero rows.

Database driver decision, the first task of the database work: packages/db uses
drizzle-orm/neon-http only. HTTP queries cannot hold a lock while application
code runs between statements, and an HTTP batch commits unless a statement
errors. Choose one option and prove it before the Section 2 prototypes in
[tasks](tasks.md):

- A Neon WebSocket `Pool` through drizzle-orm/neon-serverless for booking,
  membership, invoice and role-change transactions, keeping simple reads on HTTP.
  On Lambda, create, use and close the pool inside each request, and confirm the
  runtime's WebSocket support and connection limits.
- node-postgres over TCP, which Lambda supports, with the same per-request
  connection discipline against Neon's pooled endpoint.
- Single SQL statements (data-modifying CTEs) or HTTP batches whose guards raise
  an error when a required row was not changed, so the whole write rolls back.

## 5. Catalogue, offers and CMS authorization

Payload authentication remains separate from Better Auth. The CMS runs on Render
at cms.theroyalglow.in, and the Owner, Manager and Developer each have their own
Payload login. Launch adds no CMS roles: adminsWrite stays Boolean(req.user), so
every CMS login can edit prices, availability, offers and SAC codes. The Users
collection overrides only unlock, so every CMS login can also create, edit and
delete other CMS logins. Until roles exist, only the Owner or Developer should
create or remove CMS logins, by agreement rather than enforcement. Revisit CMS
roles before a branch with a different Owner joins; that Owner could otherwise
change prices for all branches. Validation still applies to every login: the SAC
field is a select limited to the reviewed codes in
[Tax and branch settings](tax-settings.md).

Enable versions on Service, Service Category and Offer with editor attribution.
If Payload's version records do not identify the editor, add a field that a
beforeChange hook sets from req.user so every saved version carries it. Historic
version restoration must pass the same validation and sync rules as an ordinary
edit. Retirement, not deletion, preserves referenced financial history.

One Payload offer holds the website card content and an optional checkout rule:
percentage, flat or combo price, linked services and start/end dates. Only
offers with a valid rule sync into the application's offer mirror for checkout.
A "Show on website" tick, on by default, lets a rule exist without a public card
for counter-only discounts (approved 28 October 2026). The admin Offers
page becomes read-only with a link to Payload. Offers created in the admin
portal before the cutover are test data and are not migrated.

Normal saves require a shared request transaction for CMS/public writes and
validated upsert to recreate absent mirrors. Enforce that the intended mirror row
exists after the operation. Disabling sync must visibly suspend financial rule
publication rather than publish offers the application cannot honor.

Developer resync selects bounded records, validates dependencies, runs retry-safe
transactions, records actor/result and verifies parity. Serialize against live
edits or use revision checks so an old repair cannot overwrite a newer save.
Drift monitoring reports differences and links to this repair path; it never
silently deletes rows or repairs data. Checkout revalidates current offer status,
branch service availability and per-customer daily redemption under concurrency.

## 6. Required architecture evidence

Before shipping, demonstrate cross-table role constraints under concurrent SQL,
old-token denial, all-entry-point isolation, stale-tab rejection, no private money
in shared DTOs, same-person scheduling across branches, and identical invoice
rendering after branch edits. The [task list](tasks.md) records implementation
order; [rollout gates](rollout.md) define the release evidence.
