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
