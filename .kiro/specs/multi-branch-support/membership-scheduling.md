# Membership minutes and staff scheduling (v6)

Status: implementation specification, 27 October 2026. No migration or live change is authorized by this document.
Read with [requirements](requirements.md), [design](design.md) and [tasks](tasks.md).

## Decisions and engineering defaults

- **User decision:** SPA memberships work at every branch. The selling branch receives the purchase payment and owes each other branch the value of the sessions it delivers to its members, settled monthly (see [Cross-branch settlement](#cross-branch-settlement)).
- **User decision:** the delivering branch issues the session invoice; one person performs the whole booking.
- **User decision:** SPA work cannot overlap any other service for the same person; hair may overlap hair.
- **User decision:** when a session overruns, reception chooses whether the next customer waits or another eligible person takes the booking. Nothing moves automatically.
- **User decision:** no-show reservations return to the membership for reuse only within its original validity. Expiry is never extended.
- **Engineering default:** reserve minutes at confirmation and consume that reservation at completion; pending requests reserve nothing.
- **Engineering default:** missed/cancelled/rejected sessions release unused reservations; this defines minute accounting, not a refund policy.
- **Engineering default:** expiry eligibility uses the service start instant. A validly started session may complete after expiry.
- **Engineering default:** elapsed overruns do not silently increase charged minutes; the booked service minutes are the reserved and consumed quantity.
- Cash refunds, membership extensions and new cancellation penalties are outside this scope.

## Minute accounting and transaction boundary

Purchased/session quantities are positive integer minutes; consumed, reserved and available totals can be zero. A membership exposes these totals separately.
`available = purchased - consumed - reserved`; both consumed and reserved are non-negative and their sum never exceeds purchased.
An expired membership may retain an accounting remainder, but its currently usable minutes are zero.
Keep an immutable accounting trail identifying membership, booking, branch, quantity, operation, actor and occurrence time.
Each reservation belongs to exactly one booking and moves from held to consumed or released exactly once.
Database uniqueness permits only one reservation identity and one consumption per membership-session booking.
A booking cannot consume another booking's reservation, even when the customer or membership matches.

Confirmation is one database transaction that:

1. Locks/serializes the membership accounting row and the booking's current lifecycle version.
2. Verifies membership ownership, usable status, validity, remaining unreserved minutes and service availability at the delivering branch.
3. Verifies the assignee's role, branch schedule, leave and time conflicts for the whole service duration.
4. Creates the hold and staff occupancy, updates the booking to confirmed and writes its audit event.
5. Commits everything together, or changes nothing when any guard fails.

Completion consumes the existing hold, marks the booking completed, closes actual occupancy and creates the session invoice in one transaction.
It does not run a new purchase-balance check that could refuse an already funded, validly started session.
It verifies that the hold still exists, the session genuinely started validly and the booking has not already completed.
An expiry job changing the membership's status to expired does not invalidate such a session's held minutes.
A zero-row conditional update must abort the whole transaction; it must not leave a booking or invoice without its accounting write.
Use database-supported locking/conditional writes compatible with the selected driver; separate preflight reads are advisory only.

Each mutation accepts an idempotency key bound to actor, operation, booking and request payload.
The same key and payload return the original result; reusing a key with a different payload returns a conflict.
Different keys cannot bypass booking-level uniqueness or the lifecycle transition guard.
Notifications and realtime events are delivered after commit through retryable delivery; delivery failure cannot duplicate accounting.

## Lifecycle and release rules

| Operation | Booking state | Membership minutes | Staff occupancy |
| --- | --- | --- | --- |
| Request | Pending | None held | None reserved |
| Confirm | Confirmed | Hold booked minutes | Reserve planned interval |
| Start | In progress | Keep hold | Acquire actual service occupancy |
| Complete | Completed | Convert hold to consumed once | Close actual interval; retain history |
| Cancel/reject before start | Terminal | Release hold, if present | Release planned reservation |
| No-show before start | No-show | Release hold, if present | Release planned reservation |
| Reschedule before start | Preserve pending/confirmed | Retain or atomically resize hold | Replace/revalidate planned interval |

Starting requires a confirmed booking, exactly one valid assignee and an active hold of the booked quantity.
"Record now" performs confirm and start atomically with server-recorded actual start; it does not create an already-completed booking.
An in-progress session cannot be marked no-show or rejected through ordinary actions.
Exceptional corrections require an authorized, audited correction path; do not silently delete accounting history or invoices.
Changing services/duration before start atomically adjusts the hold and reservation, or preserves the original booking on failure.
Changing the assignee does not charge minutes again. Moving an appointment does not restart membership validity.
Removing an assignee because a future appointment is invalid keeps its minute hold and flags the booking for reassignment.
Such a booking cannot start until reassigned; cancellation/no-show/expiry reconciliation releases its unused hold.

Membership cancellation is refused while there are unresolved reservations or an in-progress session.
A cancellation workflow may cancel eligible unstarted bookings and release all their holds in the same transaction before cancelling the membership.
It must show the affected bookings; it cannot cancel a running service or imply a cash refund.

## IST validity and no-show boundary

Preserve the existing end-of-day IST calculation in `packages/business/src/membership/validity.ts`.
Store UTC instants; display business dates and times in Asia/Kolkata. Never derive validity from the server's local timezone.
The valid start interval is `startsAt <= serviceStart <= expiresAt`, including the stored expiry millisecond.
Current generated expiry is 23:59:59.999 IST. At 00:00:00.000 IST on the next day, a new session is invalid.
Confirmation requires an unexpired, uncancelled membership and a planned start within that interval.
Start rechecks the actual instant, so a session delayed beyond expiry cannot start using an earlier reservation.
An already-started valid session may finish later; record both actual start and completion rather than extending `expiresAt`.
Expiry processing never consumes unused holds. It cancels/flags unstarted expired reservations for release and leaves active-session holds intact.

No-show always closes the reservation as released so the accounting trail remains correct.
If processed before expiry, those minutes become available until the original expiry, subject to other reservations.
At exactly `expiresAt`, the existing inclusive validity check still applies; after that instant, released minutes cannot be reused.
A delayed job may release a pre-expiry no-show after expiry; it restores accounting remainder only and does not reactivate the membership.
No-show retries, expiry reconciliation and cancellation racing each other must release the same hold at most once.
A late no-show job must recheck booking state; a booking already started or completed cannot lose its reservation or consumed minutes.

## Planned reservations, actual work and overruns

Use half-open planned intervals `[start, end)` so exactly back-to-back appointments do not overlap.
Conflict identity is the person across all branches, not a branch-local staff identifier.
At least one SPA interval in a pair makes overlap forbidden; two hair intervals may overlap.
The planned occupancy table has one row per assigned booking and stores the person, branch, type and full service interval.
Database exclusion constraints enforce SPA/SPA and SPA/hair conflicts; prove the actual DDL on disposable infrastructure before rollout.
Keep planned reservations distinct from actual execution; an overrun must not overwrite a previously accepted next reservation.
Serialize actual-start and completion operations per person. An unfinished SPA blocks any new actual start; unfinished hair blocks a SPA start.
The start endpoint enforces this rule even if the UI is stale or an alert was missed.

At an overrun conflict, flag the affected next booking and notify its branch's reception/Manager with eligible replacement suggestions.
The dashboard keeps the conflict visible until resolved; alerts are idempotent and retryable.
Waiting preserves the booking and hold but cannot start service until the previous actual work permits it.
Reassignment rechecks eligibility and reservations in the committing transaction; a suggestion is not a resource lock.
Actual start must also account for later planned work. If a delay creates new planned conflicts, reception resolves those before starting.
No automatic movement, fabricated completion or automatic additional minute charge is allowed.
Completed actual intervals remain available for audit and retrospective clash checks.

## One assignee, schedule changes and database consistency

SPA candidates: Therapists, Manager, Receptionist. Hair candidates: Stylists, Manager, Receptionist. Owners are never candidates.
The person must work at that branch for the entire interval, within working hours, and have no approved leave.
Receptionists/Staff have one branch; a Manager's day belongs to the branch in their schedule.
Server checks repeat at confirmation, reassignment, rescheduling and actual start.
Staff pickers show unavailable candidates with a reason; filtering alone is never the enforcement boundary.

Schedule/leave changes, branch closures and role removals must enumerate affected future bookings before committing.
Revalidate them atomically: preserve valid assignments, unassign invalid ones, release their staff reservations and create durable reassignment flags.
Retain membership minute holds until the booking is cancelled, no-showed or made unusable by expiry; do not silently cancel a customer's appointment.
Changes cannot erase or move an active service. Historical bookings retain their assignee and actual times.
Concurrent confirmation and leave/schedule changes serialize so neither can commit an invalid assignment unseen by the other.

Booking state, assignee, interval and occupancy must commit together on every mutation path.
Cover customer/admin creation, walk-ins, confirmation, reassignment, reschedule, cancellation, rejection, no-show, completion, staff removal and membership sessions.
Database consistency enforcement must reject an active assigned booking without matching occupancy or a stale occupancy projection.
Use authoritative assignment data plus database constraints/triggers; exclusions on an optional second-table write alone are insufficient.
All booking service lines agree on the single assignee; reject conflicting per-service staff IDs rather than accepting the first one.
Historical service snapshots and invoices remain immutable when current staff/branch details change.

## Retrospective recording

This is an explicit authorized correction workflow, separate from "Record now"; require reason, actor and recording timestamp.
Capture real start and end instants, delivering branch, single assignee and services; require start < end <= recording time.
Reject sessions before membership start, after its valid start boundary or conflicting with retained actual SPA/hair history.
Validate the staff's historical assignment/eligibility using retained history; if evidence is missing, require reviewed correction rather than guessing from today's role.
An expired status alone does not reject proven service delivered within validity; a cancelled membership requires reviewed reconciliation, not automatic charging.
Reserve and consume the available accounting remainder atomically without stealing holds already committed to other bookings.
Persist a completed historical interval, never a live busy lock. Booking-level uniqueness prevents duplicate recording.
Corrections use explicit audited adjustments with invoice handling defined by the billing specification; no silent row replacement.

## Selling a membership

User decisions recorded in v6.1:

- Tiers are internal starting templates kept in the admin portal, not in Payload. Customers never see tier names or usual tier prices.
- Customers negotiate at the counter, mostly with a Receptionist or Manager. Receptionists, Managers, Owners and the Developer can sell memberships and edit tiers; a custom deal needs no approval.
- What is sold is a pool of SPA hours, such as 8 hours for ₹10,000 or 10 hours for ₹10,000. One tier list serves all branches, and every membership is usable at every branch.
- The admin memberships list shows each membership's agreed price next to the tier's usual price. Customers never see the usual price.

Sale flow at the seller's active branch:

1. Choose the customer.
2. Choose a tier; it prefills the usual hours, price and expiry date.
3. Adjust hours with the − and + buttons.
4. Type the agreed price. Changing hours never recalculates the price.
5. Pick the expiry date. The start date defaults to today in IST.
6. Record payment by cash, UPI or card.
7. One transaction creates the membership and its purchase invoice from the selling branch, using that branch's tax version and invoice numbering.

Engineering defaults:

- The counter moves in 1-hour steps with a 1-hour minimum. The server accepts whole hours only and stores the pool as minutes.
- The agreed price is typed in rupees, stored as integer paise and must be greater than zero. Like catalogue prices, it includes GST.
- The expiry date must be later than the start date. It is stored as 23:59:59.999 IST on the picked date, using the IST helper in `packages/business/src/membership/validity.ts` rather than the host timezone.
- The membership records the tier, a snapshot of the tier's name and usual hours and price at sale time, the agreed hours and price, the seller and the selling branch. The admin list's usual price comes from this snapshot, so a later tier edit does not change it; memberships sold before the snapshot exists show no usual price.
- The server resolves the selling branch from the seller's authorized active branch; neither a constant nor an unauthorized request value decides it.
- Only the Developer changes a tier's tax classification.
- Customer pages, emails and invoice lines describe the purchased hours, price paid and expiry, not the tier.

`apps/admin/src/app/memberships/new/create-membership-form.tsx` and `POST /api/memberships` already accept custom hours, price and validity.
The new work is the hours counter, the expiry date picker, independent price entry, a tiers screen with write APIs (`/api/membership-tiers` is GET-only today) and branch resolution in place of `PRIMARY_BRANCH_ID`.

## Cross-branch settlement

User decision (28 October 2026): members use their hours at any branch. The selling branch receives the full price up front, so it owes each other branch the value of the sessions that branch delivers to its members, settled monthly.

Valuing a session:

- The rate is the membership's own price per minute: the price paid divided by the purchased minutes. A negotiated deal is valued at what that customer paid. ₹10,000 for 10 hours is ₹1,000 per hour, so a 1-hour session at another branch is worth ₹1,000 to that branch.
- Each session's value is the price share for all minutes used so far, minus the share already given to earlier sessions. In paise: `value = floor(P × (c + n) / T) − floor(P × c / T)`, where P is the price paid, T the purchased minutes, c the minutes used before this session and n its minutes. Rounding never builds up: once every minute is used, the values add up to exactly P. ₹10,000 for 9 hours gives eight sessions of ₹1,111.11 and a last one of ₹1,111.12.
- The same formula applied to the GST on the purchase invoice gives each value's GST share: the part the selling branch already collected and paid. Both figures are stored, so either settlement basis in [Tax and branch settings](tax-settings.md) works without recalculating.
- Price paid and purchased minutes are fixed after the sale, because they define every session's value. Extensions stay out of scope.
- Calculate in 64-bit integers: price × minutes can exceed the 32-bit range (₹1,00,000 × 6,000 minutes).

Recording:

- The settlement entry is written by the same statement that consumes the minutes, which locks the membership row. Two sessions finishing at once can't start from the same minutes-used figure, and a retried completion adds nothing: the entry is unique per session booking.
- Every consumed session gets an entry. Sessions at the selling branch are marked internal and never appear on a statement. For each membership, the entries add up to `floor(P × minutes used / T)`.
- No-shows, cancellations and rejections consume nothing and create no entry. Minutes unused when a membership expires stay with the selling branch.

Settling:

- The performing branch is owed the session's value minus its GST share (user decision, 28 October 2026: settle without GST). For the first hour of a ₹10,000, 10-hour membership at 5%, that is ₹1,000.00 − ₹47.61 = ₹952.39. Once every minute is used, the amounts owed add up to the purchase invoice's taxable value.
- The share paid to the performing branch is 100%, a Developer setting stored on each entry. Monthly statements, netting, payment and who can see them work the same way for memberships and gems: see [Cross-branch settlement](settlement.md).

Alternatives considered:

- Paying the performing branch the service's catalogue price: memberships sell below catalogue prices, so the selling branch could pay out more than it received.
- Using the tier's usual price per hour: this ignores the negotiated deal.

## Implementation design (31 October 2026)

Engineering decisions for tasks §4, on the neon-http driver (spike results §5): every
mutation is one HTTP batch or one guarded statement, and the database keeps the
totals and projections, so direct SQL can't leave them inconsistent either.

### Slices, in order

1. **Minute holds and the session lifecycle** (MS-01 to MS-06, MS-12, MS-13): this section.
2. **Staff occupancy**: the planned projection, actual work and start serialization, overrun flags (MS-07, MS-08, MS-10).
3. **Schedule, leave and role changes** revalidating future assignments (MS-09).
4. **Retrospective recording** (MS-11).

### Minute accounting (slice 1)

- `spa_membership.used_hours_minutes` stays the consumed total; `reserved_minutes` (new, default 0) is the held total. `CHECK (reserved_minutes >= 0 AND used_hours_minutes + reserved_minutes <= total_hours_minutes)`. Available = total − used − reserved; usable minutes are zero once the membership is expired or cancelled.
- `membership_hold`: one row per membership-session booking (`booking_id` unique), with the membership, the delivering branch, the minutes (> 0) and a state: `held`, `consumed` or `released`, each with its instant. Holds carry no actor: the booking's status log records who changed the booking.
- The application writes bookings, never holds. A trigger on `booking` derives each session booking's hold from its status: confirmed or in progress → held; completed → consumed; cancelled, rejected, no-show or rescheduled → released. Triggers on `membership_hold` keep the totals: a new `held` row adds to `reserved_minutes`; held → consumed moves the minutes from reserved to used; held → released takes them off reserved. A row inserted as `consumed` (a retrospective entry) adds to used. Consumed and released are final; the membership, booking and branch of a hold never change, and its minutes change only before the session starts; holds aren't deleted (except test fixtures under `rgss.ledger_fixture`). The membership UPDATE takes its row lock, so concurrent holds and consumptions serialize, and the CHECK refuses an overcommit at the database (MS-01). A deferred check refuses, at commit, totals that differ from the holds, whatever wrote them.
- Rejected: holds written by the application (the spike's approach). Direct SQL on a booking could then leave its hold behind.
- A new hold requires an active membership and a planned start within `[starts_at, expires_at]`; the trigger refuses anything else, so no path can reserve minutes outside validity. Consumption needs no balance or validity check: the minutes were reserved and the start was checked (MS-06).

### The lifecycle of a session booking

| Action | Who | Booking | Hold | Notes |
| --- | --- | --- | --- | --- |
| Book a session | Receptionist+ at the delivering branch | confirmed, one assignee | held | Advance booking. Validity at the planned start |
| Record now | Receptionist+ | in_progress, `started_at = now()` | held | Replaces today's instant completed booking: confirm and start together, validity at now |
| Start | Receptionist+ | confirmed → in_progress, `started_at = now()` | stays held | Needs the hold and the assignee; validity rechecked at now |
| Complete | Receptionist+ | in_progress → completed, `completed_at = now()` | consumed | The ₹0 session invoice and the settlement entry move here, in the same batch |
| Cancel, reject, no-show | as today | terminal | released | Same batch as the status change |
| Membership expires | job | unstarted confirmed sessions → cancelled ("The membership expired before this session started") | released | Started sessions keep their hold and complete later (MS-04, MS-06) |
| Cancel membership | Manager+ at the selling branch | — | — | Refused while it has an in-progress session; otherwise cancels its unstarted sessions and releases their holds in the same batch (MS-13) |

- A membership session completes from `in_progress` only: it must have genuinely started. Ordinary bookings keep completing from `confirmed` or `in_progress`.
- Completion is guarded like today's: the booking must still be in progress at its branch and its hold still held; a retry with the same idempotency key replays, a different key finds nothing to complete (MS-02).
- Customers still don't book membership sessions online; reception books, records and completes them.
- Settlement: the completion batch consumes the hold (which locks and updates the membership), then writes the entry from the membership's used minutes after consumption, so `used_before = used − minutes` is exact under concurrency.

### Slice 1 as built

Migrations 0025 (schema) and 0026 (functions, triggers, backfill), applied to Neon dev.

- **Record now:** `POST /api/memberships/[id]/sessions` writes an in-progress booking with `started_at = now()` on today's IST date; the database holds its minutes in the same batch. A body `bookingDate` other than today is 400: recording a past session waits for the audited workflow (MS-11). The response has `invoice: null`; a retry with the same idempotency key replays the session, with its invoice once completed.
- **Start:** `POST /api/bookings/[id]/start` starts any confirmed booking that has an assignee, ordinary or session, from the database's clock, once (a double submit is 409). The database rechecks a session's validity at that instant; a refusal answers 409 `MEMBERSHIP_EXPIRED` or `MEMBERSHIP_NOT_STARTED` with the date. Ordinary bookings may still complete straight from confirmed.
- **Complete:** a session completes from in progress only (confirmed is 409 "Start this session before you complete it."), with no payment method, offer or gems (400 for an offer or gems). The ₹0 session invoice isn't emailed and no post-service follow-up is queued, as before.
- **Cancel membership:** cancels the unstarted sessions with a status-log entry by the person cancelling, then the membership, in one batch; 409 while a session is in progress.
- **Expiry job:** cancels the unstarted sessions of the memberships it expires, with no status-log entry (a system change), and reports `{ expired, cancelledSessions }`.
- **Moves:** rescheduling a session outside its membership's validity is 409 `MEMBERSHIP_EXPIRED`; the session keeps its slot.
- **Reads:** a membership's sessions are those confirmed, in progress or completed. The admin membership and customer pages, the memberships list and the customer profile show held minutes, and free minutes are total − used − held. A membership sold to start later refuses Record now with 409 `MEMBERSHIP_NOT_STARTED`.
- **Old code fails closed:** the previous release recorded a session as a completed booking plus a direct `used_hours_minutes` update. Against 0026 the inserted booking already consumes its minutes, so the extra update fails the balance check at commit (or the overcommit CHECK) and the whole write rolls back; a stale deployment can't double-count minutes.
- **Since built:** booking a session ahead from the admin portal; see [Booking a session ahead](#booking-a-session-ahead-as-built).

### Slice 2 as built: staff occupancy

Migrations 0027 (the two tables, generated) and 0028 (btree_gist, functions, exclusion constraints, backfill, triggers), applied to Neon dev.

- **Projections the database keeps.** `staff_occupancy` has one row per confirmed or in-progress booking whose service lines name one assignee: the person (staff profile, one per person), branch, kind (`service_type`) and the planned interval `[start, end)` from the booking's IST date and times. An end before the start runs into the next day. `staff_work` has one row per booking that started with one assignee: `[started_at, ∞)` while it runs, `[started_at, completed_at)` once completed, and closed at the cancellation, rejection or update instant if it ended another way. Triggers on `booking` (status, date, times, the start, completion, cancellation and rejection instants, branch, kind) and on `booking_service` (staff, booking) recompute a booking's rows. A direct write to either table is refused (`staff_projection_derived`; test fixtures under `rgss.ledger_fixture` excepted). Deleting a booking or a staff profile cascades.
- **Exclusions** (btree_gist, on both tables): for one person at any branch, a SPA interval overlaps no other interval of theirs, SPA or salon; two salon intervals may overlap. Intervals are half-open, so back-to-back bookings don't overlap (MS-07). On `staff_work` the same rule serializes starts: a running SPA blocks the person's next start, and a running salon service blocks a SPA start, until it completes, whatever reached reception (MS-08).
- **A start doesn't move the plan.** A booking in progress keeps its planned interval. Rejected: moving it to `[started_at, started_at + length)` and refusing a start that runs into the person's next booking. A few minutes' delay into a back-to-back booking is normal, and `staff_work` already blocks the next start while this one runs.
- **One assignee.** Once a booking is confirmed or in progress, every service line names the same person. Deferred constraint triggers check it at commit (`booking_one_assignee`), so one transaction may rewrite every line. Pending web bookings keep their tentative per-line staff until approval assigns one person.
- **What reception reads** (`assigneeRefusal`, `assigneeRefusalMessage`): approving or assigning someone booked then is 409 "That staff member has another booking at that time. Choose someone else."; assigning someone still with another customer to a running booking is 409 "That staff member is still with another customer. Choose someone else." Start refuses lines naming different people before writing, and a start the database refuses is 409 `STAFF_BUSY` "{name} is still with another customer. Complete that booking first, or assign someone else to this one." A reschedule onto a time the assignee is booked was 409 `BOOKING_SLOT_UNAVAILABLE` "That time isn’t free any more. Choose another time."; since slice 3 the move goes ahead without them, and that answer remains only for a race.
- **Walk-ins** take one default person for the whole booking (`getDefaultStaffForBooking`): whoever performs most of its services, then a Stylist or Therapist, then anyone who works at the branch. It skips anyone on approved leave that day and anyone whose bookings then clash with the slot.
- **Record now** needs the person doing it: a top-level `staffId`, or lines that all name the same person; anything else is 400. When the database refuses them, the answer is 409 `STAFF_BUSY` (booked then, or still with another customer) or `CONFLICT` (on leave, or no longer at the branch). The panel has one required "Who is doing it" picker.
- **Backfill**, oldest booking first: a confirmed booking that would clash with an earlier one of the same person loses its assignee and gets an open reassignment flag with reason `overrun` (the person is busy then), instead of failing the migration. A started booking that clashes keeps its assignee and gets no row. Bookings whose lines name different people get no rows. The migration's notice counts all three.
- **Old code fails closed:** the previous walk-in release gave each service its own default person. Against 0028, a confirmed walk-in whose lines name different people fails at commit (`booking_one_assignee`) and nothing is written.
- **Tests:** `packages/db/src/queries/staff-occupancy.integration.test.ts` runs every rule above against Neon dev.

### Slice 2b as built: held-up bookings and busy candidates

Migrations 0029 (enum values `booking_reassignment_resolution.started` and `notification_type.staff_overrun`, generated) and 0030 (trigger `booking_reassignment_close_on_start`, hand-written; the new value appears only in its function body, because of the enum trap), applied to Neon dev.

- **Held up.** A confirmed booking is held up when it starts within 15 minutes and hasn't ended, and its person has open work that conflicts with it (a SPA booking with any work, salon with SPA) and is expected to start it more than 10 minutes late. The work is expected to end at its actual start plus its planned length, and at least now. Grace and lead are `OVERRUN_GRACE_MINUTES` and `OVERRUN_LEAD_MINUTES` in `packages/db/src/queries/staff-occupancy.ts`. Rejected: flagging every late minute. Back-to-back bookings often run a few minutes over, and an alert for each would be ignored.
- **The flag** is open reassignment work with reason `overrun` that keeps the assignee (`flagStaffOverruns`: one statement that locks the bookings it flags, so a booking started meanwhile isn't flagged, and is idempotent through the open-entry unique index). Reception waits for the person or assigns someone else; the database refuses the start until the earlier work completes either way (MS-08). The flag ends as `started` when the booking starts (0030), `reassigned` when someone is assigned, and `booking_ended` when the booking is moved (the reschedule batch) or ends (0013). Lists and the booking detail show it as "Held up" (`heldUp`: an overrun entry whose booking still names that person); the 0028 backfill's overrun entries cleared the assignee and stay "Needs staff".
- **Who raises it:** `POST /api/jobs/staff-overrun-check` every 15 minutes from 07:30 to 22:15 IST (`*/15 2-16 * * *` UTC, Job 26), and a start refused with `STAFF_BUSY`, for that booking once it is due (lead 0, same grace), so a hold-up outside the job's hours is flagged too. A failure to flag or alert never changes the refusal.
- **Who is told:** the held-up booking's branch front desk (`alertBranchFrontDesk`: its Receptionist, and its Manager or, without one, its Owner), one `staff_overrun` push per person per booking, so each run retries the people not yet told. The text names the person, the booking's time, branch and date, what to do, and up to three people free for the slot who may do that kind of work (`replacementSuggestions` in `packages/business/src/scheduling/assignee.ts`: Therapists for SPA, Stylists for salon, the Manager or Receptionist for either; those who perform the booking's services first). A suggestion is not a lock; assigning rechecks everything in the write.
- **Busy candidates in pickers:** `GET /api/staff?booking=<id>` (the booking's own slot at the active branch; another branch's booking is 404) or `?minutes=<n>&kind=<salon|spa>` (a slot starting now, for Record now) adds `busy` to each person: `on_leave`, `booked` with the clashing booking's IST times, or `working` since its start (`getStaffAvailability`). Pickers show everyone, with the reason beside a busy person. They disable someone on leave or booked then, and someone still with a customer only when the work starts now (a booking in progress, or Record now); otherwise reception may assign them and wait. The session panel asks again as its minutes change and holds Record Session while the chosen person can't do it. Filtering is never the enforcement: the database decides when the booking is written.
- **Not built:** moving a running booking to another person moves its whole actual interval to them from its start. The database then refuses the move if that person did other work since, as "still with another customer". This is rare and refused safely, not recorded wrongly; slice 4's retrospective corrections revisit it.
- **Tests:** live `staff-overruns.integration.test.ts` (flag, grace, salon, due-now, reschedule, availability, `heldUp`); unit: the job route (real helper and alerts), the start and staff routes, `assignee.test.ts`, `content.test.ts`, `lib/admin/bookings.test.ts`, `booking-detail.test.tsx`, `ReassignmentPanel.test.tsx`.

### Slice 3 as built: schedule, leave and closure changes

Migrations 0031 (enum value `booking_reassignment_reason.off_schedule`, generated) and 0032 (function `staff_off_schedule`, the replaced assignee guard and the deferred trigger `booking_assignee_recheck`, hand-written; the new value appears only in the application's statements, because of the enum trap), applied to Neon dev.

- **The weekly schedule limits planned work.** When a person has a weekly row for a weekday, it says whether and where they work that day. A confirmed booking of theirs must fall on a working day, at that day's branch, within its hours (`staff_off_schedule(staff, branch, date, start, end)`; time past midnight is outside any hours). Without a row the person works the branch's opening hours. Rejected: requiring a row. Nobody on dev has one, so every assignment would be refused.
- **Only planned work.** The schedule limits confirmed bookings. Start, Record now and reassigning a booking under way are never refused for it, because the person is there. Rejected: checking bookings in progress too.
- **Where the database checks.** The line guard (0014's `assert_booking_assignee`, replaced) refuses an off-schedule assignee on a confirmed booking (`booking_assignee_off_schedule`). The new deferred constraint trigger `booking_assignee_recheck` runs when a booking becomes confirmed or a confirmed booking moves (date, times or branch). At commit it checks that every person the booking names works at its branch, isn't on approved leave that day and is scheduled then. Because it is deferred, approval can confirm and assign in one transaction, and a move can take its person off the booking in the same transaction. Rejected: an immediate trigger, which would check a pending booking's tentative staff in the middle of an approval.
- **Saving a week** (`upsertStaffSchedule`, `PUT /api/schedule`) takes the person off the bookings still to come that the new week no longer covers, at every branch, in the same transaction (`releaseAssignmentsOffScheduleStatement`). A confirmed booking gets an open reassignment flag `off_schedule`, made by the person saving. A pending booking only loses its tentative assignee, and a booking under way keeps its person. The person's profile is locked first, as every assignment and leave approval locks it. A racing assignment either commits first and is released, or waits and is checked against the new week. The response's `reassignments` says how many bookings now need someone, and the grid points to the dashboard. When one branch claims a shared Manager's day, the Manager is taken off the other branch's bookings that day, and that branch lists them.
- **Approving leave** already took the person off that day's bookings (R5.8, reason `unavailable`). The recheck now also refuses a confirmed booking moved onto its person's leave.
- **Moves.** `rescheduleBooking` keeps the person when they can take the new time. Otherwise the move goes ahead without them, and the booking waits for someone else, in the same batch (`releaseAssigneeForMoveStatement`). The reason is `unavailable` (leave that day), `off_schedule` (not scheduled then) or `overrun` (booked then). Only a confirmed booking holds its person; a pending one keeps its tentative assignee for approval to replace. Rejected: refusing the customer's move, since customers don't pick staff. A refusal is now only a race. If someone took the person for that time meanwhile, the answer is 409 `BOOKING_SLOT_UNAVAILABLE`. If their schedule or leave changed while it moved, it is 409 "This booking changed while you were rescheduling it." The move locks the people it names first, like the schedule and leave writes.
- **Closures** never cancel or move a booking, and have no database guard. Customers can't book a closed day, and approving a booking on one is refused (R1.8, as before). The bookings still to happen on a day their branch is now closed form a derived list (`getBookingsOnClosedDays`): pending and confirmed, today or later in IST, each naming the branch's own closure before an every-branch one. The dashboard shows them (`ClosedDayBookingsPanel`: up to 8, then "And N more.") until reception moves, cancels or rejects each one. Rejected: a `branch_closed` reassignment reason, or a trigger on closures.
- **The salon moves or cancels a booking** (admin, Receptionist or above at the active branch, route policy `branch`):
  - `POST /api/bookings/[id]/reschedule` with `{ branchId, bookingDate, startTime }` moves a pending or confirmed booking. The branch must be open that day; the closure message adds how to remove the closure. The time must be within the branch's hours, on the half-hour grid and still to come, as the counter books, without the customer's window or lead time. The booking keeps its length and records the settings revision. The move doesn't count against the customer's reschedule limit (`countsTowardLimit: false`). It answers `{ booking, needsStaff }`.
  - `POST /api/bookings/[id]/cancel` with `{ branchId, reason }` (1–500 characters) cancels a pending or confirmed booking. It is never counted as the customer's late cancellation. Gems the booking was made with go back, and a session's held minutes are released, in the same write.
  - The booking detail offers "Move booking" (date and half-hour start time) for pending and confirmed bookings, and "Cancel booking" (with a reason) for confirmed ones. A pending booking is rejected instead.
  - Customer notifications for salon changes aren't built. The customer sees the change on their booking page, and the realtime event is published.
- **Pickers and the default pick.** A person not scheduled then reads "Not scheduled then" (`busy.reason = 'off_schedule'`). Pickers disable them for work planned ahead, never for work starting now (`staffBusyBlocks`). Leave is reported first. With a slot, `getDefaultStaffForBooking` skips anyone not scheduled then.
- **What reception reads:** assigning or approving someone not scheduled then is 409 "That staff member isn’t scheduled to work then. Choose someone else." A booking that the person's new week took them off reads "{name} isn’t scheduled to work then."
- **Old code fails closed:** the previous release's reschedule has no release statement. Against 0032, moving a confirmed booking onto a day or time its person can't take is refused at commit, and nothing moves. Its schedule saves release nothing, so its assignments keep working until someone saves a week with the new code: nobody has weekly rows yet.
- **Tests:** live `schedule-revalidation.integration.test.ts` (schedule saves at every branch, the line guard and the deferred recheck, moves and their reasons, availability, the default pick and the closed-day list). `staff-occupancy.integration.test.ts` now expects a move onto a booked time to go ahead without the person. Unit: the admin cancel, reschedule and schedule routes, `reassignments.refusal.test.ts`, `lib/admin/bookings.test.ts`, `booking-detail.test.tsx`, `ClosedDayBookingsPanel.test.tsx` and `closed-day-bookings.test.ts`.

### Booking a session ahead (as built)

No migration: the slice 1 triggers already hold a confirmed session's minutes and check validity at its planned start.

- **API.** `POST /api/memberships/[id]/sessions` with a `startTime` (`HH:MM`, IST) books the session ahead for `bookingDate`, which is then required (400 without it). Without `startTime` it is Record now, as before. A booking ahead is confirmed for that slot at the active branch, with one assignee and the branch settings revision that accepted it; the database holds its minutes in the same write.
- **Slot.** As the counter books: the branch open that day (409 with the closure's name and how to remove it), the time within the branch's hours on the half-hour grid, and still to come ("That time has passed. Choose a later time, or record the session now."). The customer's booking window and lead time don't apply.
- **Membership.** It must be active now and valid at the planned start, inclusive (`assertSessionBookable` in `packages/business/src/membership/hours.ts`): 409 `MEMBERSHIP_NOT_STARTED` "This membership starts on {date}. Choose a time from then.", 409 `MEMBERSHIP_EXPIRED` "This membership expires on {date}. Choose a time before then.", or 409 `MEMBERSHIP_INSUFFICIENT_HOURS` when the minutes aren't free now (a booked session holds them from now).
- **Person.** The database refuses someone booked then, on leave that day or not scheduled then (0028, 0014, 0032), as 409 with the reason; someone still with a customer now may still take a later session.
- **Panel.** The membership's session panel has a "When" choice: Now (Record Session) or Book ahead (date, a half-hour start, Book Session). Its staff picker asks `GET /api/staff?minutes=<n>&kind=spa&date=<YYYY-MM-DD>&start=<HH:MM>` for that slot, and disables whom the database would refuse for planned work. Changing the time starts a new idempotency attempt.
- **Start on its day.** `POST /api/bookings/[id]/start` refuses a booking for a later IST day (409 "This booking is for {date}. Start it on that day, or move it to today first."); one from an earlier day that runs late still starts. The booking detail disables Start and says so. A session booked ahead is moved, cancelled or started from its booking like any other.
- **Tests:** unit `hours.test.ts` (`assertSessionBookable`), the sessions route (slot, closure, validity at the planned start, refusals, replay), the staff route (date and start), the start route (later day), `membership-detail.test.tsx` and `booking-detail.test.tsx`; live `membership-holds.integration.test.ts` (confirmed, held, refused past expiry, starts and completes); E2E `membership-sessions.spec.ts` (book ahead, the start held until its day, cancel gives the minutes back).

## Acceptance criteria

- **MS-01:** two branches concurrently request 60 minutes from one available 60-minute balance; exactly one confirmation/hold succeeds, with no orphan booking or occupancy.
- **MS-02:** completion retried with the same or different request keys produces one consumption and one session invoice; changed payload with the original key conflicts.
- **MS-03:** cancellation/rejection/no-show and expiry retries release a hold once; a stale no-show action cannot alter a started/completed session.
- **MS-04:** before expiry, no-show release makes minutes reusable; after expiry, including a delayed job, it restores only accounting remainder and never changes `expiresAt` or reactivates status.
- **MS-05:** test starts exactly at `startsAt`, exactly at `expiresAt`, and one millisecond after; only the last is invalid, independently of host timezone and job timing.
- **MS-06:** a valid actual start completes after expiry successfully; an unstarted appointment delayed past expiry cannot start and has its unused hold released.
- **MS-07:** SPA/SPA and SPA/hair concurrent overlaps fail globally across branches; hair/hair and exact planned back-to-back appointments succeed.
- **MS-08:** an overdue SPA prevents the next actual start even with missed alerts; reception can wait or atomically reassign, with no automatic schedule change.
- **MS-09:** schedule/leave/closure/removal racing confirmation cannot preserve an invalid future assignee; affected bookings retain holds and durable reassignment flags.
- **MS-10:** each lifecycle path and direct SQL consistency probe cannot leave missing/stale occupancy, disagreeing service assignees or negative/overcommitted minute balances.
- **MS-11:** retrospective sessions require real times and audit evidence, check historical conflicts, consume once and never mark the person currently busy.
- **MS-12:** failed accounting, occupancy or invoice writes roll back the entire mutation; failed notification delivery remains retryable without repeating financial effects.
- **MS-13:** membership cancellation with unresolved holds is refused unless eligible bookings and holds are cancelled together; in-progress sessions block cancellation.
- **MS-14:** a sale whose hours and price differ from the tier stores the agreed minutes and paise on the membership and its purchase invoice, with the tier snapshot, seller and selling branch; the tier row is unchanged.
- **MS-15:** the counter moves in whole hours and stops at 1 hour; changing hours leaves the typed price unchanged, and the server rejects a pool that is below 1 hour or not a whole number of hours.
- **MS-16:** a picked expiry date is stored as 23:59:59.999 IST on that date regardless of host timezone; an expiry date on or before the start date is rejected; the start date defaults to today in IST.
- **MS-17:** editing or retiring a tier changes later sales only; existing memberships keep their hours, price and expiry. No customer page, email, customer API response or invoice line shows a tier name or usual tier price.
- **MS-18:** Receptionists and above create and edit tiers and sell only at an active branch they are authorized for; only the Developer changes a tier's tax classification, including through direct API calls.
- **MS-19:** the admin memberships list shows the agreed price next to the sale-time usual price; editing the tier afterwards changes neither value; a membership without a snapshot shows no usual price, and no customer surface shows it.
- **MS-20:** a ₹10,000.00, 10-hour membership sold at RS whose first session is 60 minutes at MH records a value of ₹1,000.00 with a GST share of ₹47.61 at 5%, so RS owes MH ₹952.39. Each later 60-minute session records ₹1,000.00 with ₹47.62, so ₹952.38 is owed; the shares add up to the invoice's ₹476.19 and the amounts owed to its ₹9,523.81 taxable value.
- **MS-21:** using every minute of a ₹10,000.00, 9-hour membership in 60-minute sessions gives eight values of ₹1,111.11 and one of ₹1,111.12, adding up to the price exactly; the GST shares also add up to the purchase invoice's GST exactly.
- **MS-22:** sessions at the selling branch record internal entries that no statement includes; no-shows, cancellations and minutes unused at expiry record nothing.
- **MS-23:** two sessions of one membership completing at once at different branches get consecutive values from distinct minutes-used figures; a retried or duplicated completion records no second entry.
- **MS-24:** closing a month twice changes nothing; an entry recorded after the close lands in the next month; a correction posts a reversing entry and never edits a closed statement; for every membership, the entries add up to `floor(P × minutes used / T)`.
- **MS-25:** only the two branches' Owners and the Developer can read a statement, including through direct API calls; marking it paid needs a date and a reference, is audited, and is limited to the paying branch's Owner and the Developer; the CSV matches the statement totals.

Implementation touchpoints: `packages/db/src/schema/{booking,membership,schedule}.ts`, `packages/db/src/queries/{bookings,admin-bookings,memberships,schedule}.ts`, `packages/types/src/{booking,admin-booking,membership}.ts`, and the admin booking/membership/schedule/leave routes.
The current membership route invents a start time and writes a completed booking; replace that contract, not merely its picker. Add forward migrations and focused database/concurrency tests before enabling the new lifecycle.
Membership selling also touches `apps/admin/src/app/memberships/new/create-membership-form.tsx`, `apps/admin/src/app/api/membership-tiers/` and the two membership routes that still use `PRIMARY_BRANCH_ID`.
