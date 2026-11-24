# Requirements: multi-branch support v6

Status: proposed specification, 27 October 2026. Acceptance criteria below are
requirements, not completed test results. Latest explicit user decisions override
v5 defaults. Engineering defaults are identified where the implementation needs
precise behavior not previously specified.

## R1. Branches and operational ownership

Launch branches are Rayasandra (RS, #1) and Marathahalli (MH, #2). Subsequent
branches, Owners and Managers must be configurable without application changes.

- **R1.1** Only the Developer creates branches, edits legal/contact details,
  weekly opening hours, status, booking settings and GST configuration, changes
  the Owner, shuts down a branch, or deletes an eligible empty branch.
- **R1.2** Every branch has exactly one Owner, including a new or inactive branch.
  Each branch has at most one Manager and one Receptionist; Staff are unlimited.
  Owners and Managers may cover several branches. Receptionists and Staff belong
  to one branch. An Owner cannot hold a performing role at any other branch.
- **R1.3** There is one Developer account. Owner and Manager at a branch are
  distinct people. Direct database writes must not bypass these invariants.
- **R1.4** Owner/Manager replacement confirms the previous holder and rejects a
  concurrent stale replacement. Removing a branch relationship preserves other
  valid relationships; the person becomes Customer only after the last is removed.
- **R1.5** Only the Owner for that branch and the Developer assign and remove
  the Manager and the Receptionist, through Users & Roles. The branch's Manager,
  its Owner and the Developer add, edit and remove Staff (Stylists and
  Therapists) on the Staff page (R1.11). Nobody changes their own role. Removal
  replaces the independent active toggle, which is not exposed.
- **R1.6** Staff assignment asks for title and optional specialization (up to 200
  characters). Manager/Receptionist profiles also support specialization. An
  active shared Manager has one staff profile, with branch-specific schedules.
- **R1.7** Removing a person clears their future assignments at that branch,
  preserves historical records, and creates durable reassignment work for
  reception/management. Membership reservations remain tied to the customer's
  confirmed booking until it is reassigned, cancelled or otherwise resolved.
- **R1.8** Owner and Manager can maintain their branch's holidays and one-off
  closures. Only Developer can create a closure for all branches.
- **R1.9** Operational branches without a Manager show a dashboard banner and send
  a deduplicated daily reminder to the Owner at 10:00 IST, stopping once assigned.
  Owner can cover administration but cannot be assigned to perform services.
- **R1.10** Shut-down branches reject new bookings and financial activity while
  retaining authorized history access. Shutdown must enumerate and resolve future
  bookings and staff assignments. Delete is available only when no retained
  operational/financial references remain; audit history is preserved.
- **R1.11** Add staff (user decision, v6.1): search existing accounts by phone
  number, email or name; pick the person; choose the designation (Stylist or
  Therapist); add an optional specialization; confirm. One transaction makes the
  person Staff at the active branch: role, staff profile, branch and audit entry.
  Re-adding a removed person reactivates their earlier profile.
  Engineering defaults: search needs at least 3 characters and returns at most
  10 people with name, email and phone, never financial data. Anyone holding a
  role other than Customer is shown as not available, without naming a branch
  the actor cannot access. A person without an account is asked to sign in once
  at theroyalglow.in. Editing covers designation, specialization, phone and bio;
  a designation change reconciles future assignments as in R5.8. Removing staff
  deactivates the profile, returns the person to Customer, clears future
  assignments at that branch as in R1.7 and invalidates sessions; the account,
  customer data and history are kept. User decision: Managers add and remove
  only Stylists and Therapists; the Receptionist stays with the Owner and
  Developer.

## R2. Authorization and branch context

- **R2.1** The Developer can access every branch. Owners/Managers can access their
  assigned branches; Receptionists/Staff only their own. The launch UI operates
  on one active branch at a time, with a switcher for multi-branch users.
- **R2.2** Every page loader, API, server action and branch query obtains fresh
  server-side authorization. Global user.role is only a coarse entry/navigation
  hint; it never substitutes for authorization on the requested branch.
- **R2.3** Queries on branch-owned records require branch context, including
  detail lookup, mutations, exports and aggregates. A record from an unauthorized
  branch returns not found. Request-supplied branch IDs grant no permissions.
- **R2.4** Forms carry the branch for which they were rendered. A stale tab cannot
  write into a newly selected branch. Client cache keys and live subscriptions
  include branch identity and are reset appropriately on a switch.
- **R2.5** Auth, health and signed jobs have explicit separate authorization;
  genuinely shared/Developer-only endpoints have explicit policy classifications.
  A route inventory check rejects unclassified entry points. Tests verify actual
  behavior rather than just searching for a helper import.
- **R2.6** Tokens authorize only allowed branch feeds, including per-booking
  updates. Role removal/handover invalidates sessions and already-issued realtime
  tokens; short token TTL alone is not considered immediate revocation. Failed
  external revocation is visible and retried durably.
- **R2.7** A third-branch Owner cannot read, mutate or subscribe to RS/MH data by
  guessing IDs, altering cookies, calling APIs directly, or retaining old tokens.

## R3. Shared customers and private financial information

- **R3.1** Customer accounts, contact details, consents, preferences, tags, gems
  and memberships are shared across Royal Glow branches, including franchises.
  Notes are explicitly shared or branch-private. Existing notes default private
  to RS during backfill; no implicit publication of historical notes.
- **R3.2** Shared visit history exposes date, branch and services. Financial values
  are restricted to the authorized branch context. Customer lists, profile LTV,
  average spend, sorting, exports and APIs obey the same rule as invoice history.
  Internal customer-wide spending counters must not leak through shared DTOs.
- **R3.3** Branch-owned data includes bookings, waitlists, leads, invoices, payment
  records, reports, closures, operational audit events and live updates.
- **R3.4** Privacy/onboarding language describes sharing across Royal Glow
  branches. Shared profile lookup must not expose another branch's purchase
  invoice or private note.

## R4. Service availability and offer authority

- **R4.1** Payload is the single source of truth for categories, services, prices,
  durations, gems costs, SAC codes, branch availability, website offer cards and
  checkout discounts. Prices are fixed rather than negotiated, and prices and
  offers are common to all branches. The Owner, Manager and Developer each edit
  through their own Payload login. Launch adds no CMS roles and keeps the current
  signed-in write access; version history records who made each edit. Revisit
  CMS roles before a branch with a different Owner joins. SPA membership tiers
  are not in Payload (R9).
- **R4.2** Category and service availability each have All branches (default) or
  selected branch IDs. All branches includes future eligible branches. Effective
  availability is the intersection of service and category availability.
- **R4.3** Booking, walk-in, checkout additions, gems redemption and membership
  session selection filter on branch availability, with identical server checks.
  Existing financial snapshots never change when the catalogue changes.
- **R4.4** Engineering default: removing availability blocks new selections and
  lists affected future bookings for staff resolution; it does not silently
  delete or reprice their services. Checkout may honor an existing confirmed
  snapshot, while new lines must pass current availability checks.
- **R4.5** Offer percentage/flat/combo rules and linked services sync into the
  app database. One offer per customer per IST day is enforced across all branches
  atomically, including simultaneous checkout requests.
- **R4.6** Admin Offers is read-only and links to Payload. Previously used offers
  are retired rather than deleted. Version history includes actor identity.
- **R4.7** Normal saves atomically update CMS/application data. Missing mirror rows
  are repaired through validated upsert. The Developer has a bounded, audited,
  retry-safe resync action. Drift monitoring detects discrepancies and does not
  silently perform repairs; recovery is explicit.
- **R4.8** One Payload offer holds the website card and an optional checkout
  rule: percentage, flat or combo price, linked services and start/end dates.
  The application keeps a synced copy of the rule for checkout. A "Show on
  website" tick, on by default, lets a rule exist without a public card for
  counter-only discounts (approved 28 October 2026). Offers created in the admin portal
  before the cutover are test data; they are not migrated and are removed only
  through the clean-up allowlist.

## R5. Scheduling and SPA memberships

- **R5.1** SPA accepts Therapists, Managers and Receptionists; hair accepts
  Stylists, Managers and Receptionists. Owners never appear as assignees. One
  person performs all services in a booking, including a membership booking.
- **R5.2** Assignment checks branch/day, working hours, leave and conflicts for
  the whole appointment. SPA cannot overlap any assigned booking; hair can overlap
  hair but cannot overlap SPA. Back-to-back planned slots are allowed.
- **R5.3** Busy checks use one person identity across branches and are enforced
  under concurrent requests and direct database mutations. Planned reservations
  and actual session execution have distinct semantics.
- **R5.4** Session steps, minutes accounting, expiry boundaries and retrospective
  recording follow [Membership and scheduling](membership-scheduling.md).
- **R5.5** No-show releases reserved minutes; it does not consume them. Reuse is
  possible only while the original membership remains valid. Late processing
  releases accounting holds without reopening expired access or extending expiry.
- **R5.6** If a SPA session overruns, reception chooses wait/reassign/reschedule.
  Starting the next booking with that still-busy person is blocked on the server
  even if the alert is missed or delivery fails.
- **R5.7** Rescheduling into conflict/leave/off-shift clears the assignment and
  alerts the branch rather than failing solely because that person is unavailable.
  Membership expiry/balance, branch opening hours and booking-policy checks still
  apply and may reject the requested new time without changing the booking.
- **R5.8** Leave approval and schedule/role changes reconcile affected future
  assignments atomically; they cannot leave silently invalid assignments.
- **R5.9** Memberships may be used at any branch. The selling branch receives
  the purchase payment; the performing branch records the session and its
  zero-charge document. The selling branch owes the performing branch the value
  of each session, settled monthly (R10). The system records what is owed; it
  does not move money.
- **R5.10** Managers can maintain schedules and approve ordinary branch staff
  leave. Leave for a Manager shared across branches requires an Owner of one of
  their assigned branches or Developer; all affected branches receive the result.
  The weekly schedule assigns that Manager to one branch per day. One-day branch
  overrides remain deferred unless explicitly added to scope.

## R6. Billing, tax and settings

- **R6.1** Branch legal name/GSTIN/address and applied tax details are snapshotted
  when an invoice is issued. Rendering later reads that snapshot, not live branch
  or catalogue settings. Item descriptions, prices and SAC codes are snapshotted.
- **R6.2** Invoice numbers use a transactional branch/financial-year counter,
  stable unique branch code and a bounded format such as RS/2627/000123. Concurrent
  issuance and retries cannot duplicate a number or invoice; a failed transaction
  cannot commit a detached invoice. Production issued numbers are never reused.
- **R6.3** Branch booking settings apply immediately to subsequent actions, with
  no automatic rewrite of existing appointments. Record the settings version used
  for auditable decisions. GST has an effective-dated history.
- **R6.4** Billing reads the resolved branch tax configuration; no hardcoded 18%
  calculation remains on checkout, membership purchase, PDF or report paths.
  Provisional rates/classifications and launch verification are defined in
  [Tax and branch settings](tax-settings.md).
- **R6.5** Monthly GST, daily and weekly sales reporting are scoped by branch and
  issuer identity. Reports aggregate stored invoice amounts, not current tax rates.

## R7. Customer website and background work

- **R7.1** The booking flow chooses a branch and then its available services,
  hours and holidays. Public slots remain a request grid rather than a guarantee
  of available staff. A receptionist confirms staffing.
- **R7.2** Common services pages label restricted availability. Contact/footer,
  booking views, confirmations, reminders and invoice emails use actual branch
  details. Gems redemption uses the branch selector, not PRIMARY_BRANCH_ID.
- **R7.3** Leads read the branch from an ad link with a validated main-branch
  fallback. Cross-branch lead movement checks destination eligibility and writes
  an audit record without exposing its private lead list to the source operator.
- **R7.4** Daily/weekly reports and operational alerts go to the affected branch's
  appropriate recipients; Developer may receive a summary. Jobs carry trusted
  branch context, signatures and deduplication. Missing Manager reminders use IST.
- **R7.5** Review every existing job against new invariants. Membership expiry,
  no-show and cancellation release holds correctly; occupancy is reconciled with
  lifecycle changes. Catalogue drift covers availability/offers and customer stats
  preserve financial isolation. No blanket assumption that remaining jobs need no change.

## R8. Launch scope and completion

- **R8.1** Follow additive schema, backfill, application switch and constraint
  enforcement stages. App/Payload migration ownership remains separate.
- **R8.2** Complete the three release gates in [Rollout](rollout.md), including
  concurrent writes, isolation and a verified full restore. A green skipped job
  or an unasserted row count is not evidence of a pass.
- **R8.3** Before pre-launch cleanup, identify test records explicitly and prove
  no real invoice/payment/member balance is included. Preserve real launch CMS
  offers, accounts, staff, branches, catalogue and settings.
- **R8.4** Deferred: combined branch views, location landing pages, per-branch
  prices, extra Receptionists, public staffing-capacity slots, split assignees and
  per-service staff skill matching. Membership settlement entries are recorded
  from launch; the statement screen may follow by 31 January, before the first
  monthly statement is due (R10.7).

## R9. SPA membership sales

User decisions recorded in v6.1, with engineering defaults marked. Details and
acceptance cases MS-14 to MS-19 are in
[Membership and scheduling](membership-scheduling.md#selling-a-membership).

- **R9.1** Membership tiers (Silver, Gold, Platinum and any added later) are
  internal starting templates in the admin portal, not in Payload. Customers
  never see tiers or their usual prices; customer pages, emails and invoices show
  their own membership's hours, price paid and expiry.
- **R9.2** Receptionists, Managers, Owners and the Developer can sell a
  membership at their active branch. Receptionists and Managers make most sales.
  Hours and price are negotiated with the customer; a custom deal needs no
  approval.
- **R9.3** Sale flow: choose the customer; choose a tier, which prefills the
  usual hours, price and expiry; adjust hours with − and + buttons; type the
  agreed price; pick the expiry date; record payment by cash, UPI or card. One
  transaction creates the membership and its purchase invoice from the selling
  branch. Changing hours never recalculates the price.
- **R9.4** A Membership tiers screen lets Receptionists and above create and
  edit a tier's name, usual hours, usual price, usual validity, active state and
  order. Engineering default: only the Developer changes a tier's tax
  classification. Tier edits affect future sales only.
- **R9.5** One tier list serves all branches. A membership sold at any branch is
  usable at every branch (R5.9).
- **R9.6** What is sold is a pool of SPA hours, such as 8 hours for ₹10,000 or
  10 hours for ₹10,000. Engineering defaults: the counter moves in 1-hour steps
  with a 1-hour minimum, and the pool is stored as integer minutes. Sessions
  deduct booked minutes as defined in
  [Membership and scheduling](membership-scheduling.md).
- **R9.7** User decision: the admin memberships list shows each membership's
  agreed price next to the tier's usual price. Engineering defaults: the usual
  price comes from the sale-time snapshot, so later tier edits don't change it,
  and memberships sold before the snapshot exists show no usual price. Customers
  never see the usual price (R9.1).

## R10. Cross-branch membership settlement

User decision (28 October 2026): the selling branch receives a membership's full
price and owes each other branch the value of the sessions that branch delivers
to the membership's customer, settled monthly. Details and acceptance cases MS-20
to MS-25 are in
[Membership and scheduling](membership-scheduling.md#cross-branch-settlement).

- **R10.1** A session's value is the membership's own price per minute times the
  session's minutes, rounded so that the values for all purchased minutes add up
  to exactly the price paid. ₹10,000 for 10 hours makes a 1-hour session worth
  ₹1,000. User decision: the performing branch is owed the value minus its GST
  share, ₹952.39 for the first hour at 5%.
- **R10.2** The value and its GST share are recorded once per session, in the
  same transaction that consumes the minutes, including sessions at the selling
  branch (marked internal). Price paid and purchased minutes are fixed after sale.
- **R10.3** Monthly statements per pair of branches, by IST calendar month, close
  automatically after the month ends. Closed statements never change; later
  entries and corrections go into the next open month.
- **R10.4** Money moves outside the system. Engineering default: the paying
  branch's Owner or the Developer marks a statement paid with a date and a
  payment reference, audited.
- **R10.5** Engineering default: only the two branches' Owners and the Developer
  see statements and their entries. CSV export for the accountant.
- **R10.6** No-shows and cancellations create nothing. Minutes unused at expiry
  stay with the selling branch.
- **R10.7** Entries are recorded from launch. The statement screen may follow by
  31 January 2027, before the first monthly statement is due.
- **R10.8** Decided on 28 October 2026: settle without GST; pay only the net
  difference between two branches; the performing branch receives 100% of the
  amount, a Developer setting stored on each entry. R10.4 and R10.5 are
  confirmed as written.
- **R10.9** Gems settle the same way. Each earned transaction is a batch tied to
  the earning branch. Redemptions take the earliest-expiring gems first; when
  the free service is completed, the earning branch owes the redeeming branch
  gems × value per gem (₹1.00 by default, Developer setting).
- **R10.10** Gems for a redemption that doesn't happen (rejected, cancelled or
  no-show) return to their batches. Gems from batches that expired in the
  meantime expire at once. Expiry removes only unspent gems.
- **R10.11** With three or more branches under different Owners, each branch
  settles one net amount through the franchisor's account. The ledger supports
  this from launch. Details and ST-01 to ST-08:
  [Cross-branch settlement](settlement.md).
