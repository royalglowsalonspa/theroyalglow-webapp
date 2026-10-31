# Route and policy inventory (28 October 2026)

Phase 0 input for tasks §1–§3 and design §2. Built from the current code:

- every `route.ts` under `apps/admin/src/app/api` (73, including 22 jobs) and
  `apps/web/src/app/api` (22);
- pages and libraries that read the database directly;
- the realtime publishers.

"Today" is the role check in the handler. No handler checks branch access yet.
Phase 2 turns this table into a policy map in code, with a test that fails on
any unclassified route.

Policy classes:

- **branch:** branch-owned records. Needs `requireBranchRole`, and queries
  scoped by record and branch together.
- **shared:** the same for all branches. No branch money in the response.
- **shared + money:** a shared record whose money and history are limited to
  the active branch (R3.2).
- **people:** role and staff administration (R1.5, R1.11).
- **developer:** Developer only, across all branches.
- **self:** the signed-in user's own data.
- **public:** anonymous. Where relevant, the branch is validated input.
- **job:** signed. Branch scope comes from the payload, or the job runs once
  per branch.
- **auth**, **health**, **retired:** as named.
- **settlement:** statements between two branches, for the Owners of the two
  branches and the Developer; 404 for anyone else (R10, settlement.md).

## Admin API

| Route | Methods | Today | Class | Change needed |
| --- | --- | --- | --- | --- |
| `bookings` | GET | receptionist | branch | List the active branch only |
| `bookings/new` | POST | receptionist | branch | Rendered branch id; staff-picker rules; the branch's hours decide the slot and the revision is recorded (*done*); occupancy (*done, §4 slice 2:* one default person for the whole walk-in, skipping anyone on leave or booked then). *Done (§6 slice 1):* 400 naming each service the active branch doesn't offer; 409 `CONFLICT` when the catalogue changed after the check (the database refuses the line, 0034) |
| `bookings/[id]` | GET, PATCH | receptionist | branch | Record must belong to the active branch; assignment checks; branch-qualified realtime. *Done (§4 slice 2):* approve and assign answer 409 when the person has another booking then or is still with another customer (0028) |
| `bookings/[id]/complete` | POST | receptionist | branch | Done (§5): issuer snapshot, each line at the branch's rate in force for its SAC code, branch and financial-year numbering; 409 when a rate or code is missing, the booking stopped being completable or already has an invoice. *Done (§4 slice 1):* `paymentMethod` is required except for a membership session, which completes from in progress only (409 from confirmed), takes no offer or gems (400) and consumes its held minutes with the ₹0 session invoice and the settlement entry |
| `bookings/[id]/noshow` | POST | receptionist | branch | *Done (§4c):* guarded `markBookingNoShow` (confirmed only, 409 on a concurrent change) gives back gems; a session's hold is released by the database (§4 slice 1) |
| `bookings/[id]/start` | POST | receptionist | branch | *New (§4 slice 1):* confirmed → in progress with `started_at` from the database's clock, once; 409 when nobody is assigned or the booking changed; a session whose membership isn't valid at that instant is 409 `MEMBERSHIP_EXPIRED` or `MEMBERSHIP_NOT_STARTED`. *Done (§4 slice 2):* 409 when the lines name different people, and 409 `STAFF_BUSY`, naming the person, while their earlier work runs (the database refuses the start, 0028). *Done (§4 slice 2b):* such a refusal flags the booking "Held up" and tells its front desk once it is more than 10 minutes late; starting it ends the flag (0030). *Done (book ahead):* a booking for a later IST day is 409 until that day (move it to today first); one from an earlier day still starts |
| `bookings/[id]/reschedule` | POST | receptionist | branch | *New (§4 slice 3):* the salon moves a pending or confirmed booking at the active branch (`{ branchId, bookingDate, startTime }`), as the counter books: the branch open that day, the time within its hours on the half-hour grid and still to come, no customer window or lead time. Keeps the length, records the settings revision, isn't counted against the customer's limit; the person stays when they can take the new time, otherwise it waits for someone else (`needsStaff`) |
| `bookings/[id]/cancel` | POST | receptionist | branch | *New (§4 slice 3):* the salon cancels a pending or confirmed booking with a reason (`{ branchId, reason }`), never counted as the customer's late cancellation; gems go back and a session's minutes are released in the same write; 409 once under way |
| `billing`, `billing/[id]` | GET | receptionist | branch | Active branch's invoices; 404 for others |
| `waitlist`, `waitlist/[id]` | GET, PATCH | receptionist | branch | Add a branch to waitlist rows |
| `leads`, `leads/[id]`, `leads/[id]/notes` | GET, POST, PATCH | receptionist | branch | Branch from the ad link; audited cross-branch move |
| `leave`, `leave/[id]` | GET, PATCH | receptionist | branch | Active branch's staff; leave for a shared Manager needs an Owner of one of their branches or the Developer (R5.10) |
| `schedule` | GET, PUT | manager | branch | Schedule per branch per day; a shared Manager is at one branch each day; GET carries the branch's own business hours (*done*). *Done (§4 slice 3):* PUT takes the person off the bookings still to come the new week no longer covers, at every branch, in the same transaction, and answers how many now need someone (`reassignments`) |
| `reports` | GET | manager | branch | Aggregate the active branch only |
| `staff` | GET | receptionist | branch | Picker lists the active branch's eligible people. *Done (§4 slice 2b):* `?booking=<id>` (the booking's own slot; another branch's booking is 404) or `?minutes=<n>&kind=<salon\|spa>` (a slot starting now) adds each person's busy reason: on leave, booked then, or still with a customer. *Done (§4 slice 3):* or not scheduled then (`off_schedule`). *Done (book ahead):* `&date=<YYYY-MM-DD>&start=<HH:MM>` with minutes and kind asks about that slot instead of one starting now |
| `staff` | POST | manager | people | Rebuilt Add staff: search; Stylist or Therapist only; active branch; one transaction (R1.11) |
| `staff/all`, `staff/[id]` | GET, PATCH | manager | people | Branch-scoped; Managers edit Stylists and Therapists only |
| `staff/[id]/services` | PUT | manager | people | Branch-scoped |
| `users` | GET, POST | owner | people | The Owner of the branch, or the Developer, assigns its Manager and Receptionist; writes the branch relationships |
| `branches` | GET | owner | shared | Return only branches the user can access |
| `branches` | POST | owner | developer | Developer-only branch creation (R1.1) |
| `branches/[id]` | PATCH, DELETE | owner | developer | Developer-only details, hours and status; the Owner changes only by handover. Shutdown only once nothing is open (409 with the list); delete only a shut-down branch no record names (R1.10) |
| `branches/[id]/shutdown-check` | GET | (new) | developer | What is still open before a shutdown (R1.10) |
| `closures`, `closures/[id]` | GET, POST, DELETE | (new) | branch | The branch's Manager, Owner and Developer maintain its closures; all-branches closures are Developer only (R1.8) |
| `settings` | GET, PUT | manager | branch (Developer) | *Done:* the active branch's `businessHours` and `bookingRules` as revisions, `requireBranchRole('developer')`; a save names the branch (409 `BRANCH_CONTEXT_CHANGED`) and the revision it was edited from (409 `SETTINGS_CHANGED`); `invoicing.live` stays shared; the `gst` section is gone (§5) |
| `tax-versions` | GET, POST | (new) | branch | Done (§5): the active branch's rates per SAC code with their state, issuer and mode; POST adds a rate (a change starts on a future date); Developer only (`requireBranchRole('developer')`); audited |
| `tax-versions/[id]` | PATCH | (new) | branch | Done (§5): records a rate's launch review once; another branch's rate is not found; Developer only; audited |
| `customers` | GET | receptionist | shared + money | Lifetime value, spend and sorting per active branch |
| `customers/[id]` | GET, PATCH | receptionist, manager | shared + money | Minimal shared identity; history money per branch; private notes |
| `customers/[id]/notes` | POST | receptionist | shared + money | Shared or branch-private visibility (R3.1) |
| `customers/[id]/tags`, `.../tags/[tagId]` | POST, DELETE | receptionist | shared | None |
| `tags` | GET, POST | receptionist, manager | shared | None |
| `memberships`, `memberships/[id]` | GET | receptionist | shared + money | Usable at every branch; see gap 5 for money |
| `memberships` | POST | receptionist | branch | Selling branch is the active branch; remove `PRIMARY_BRANCH_ID`; new sale form (§4b) |
| `memberships/[id]/cancel` | POST | manager | shared | See gap 5. *Done (§4 slice 1):* cancels the unstarted sessions with the membership and reports `cancelledSessions`; 409 while a session is in progress (MS-13) |
| `memberships/[id]/sessions` | POST | receptionist | branch | Performing branch is the active branch. *Done (§4 slice 1):* "Record now" starts the session (in progress, minutes held) on today's IST date and answers `invoice: null`; completion issues the invoice; 409 `MEMBERSHIP_NOT_STARTED` before the membership's start. *Done (§4 slice 2):* one person does it (`staffId`, or the same person on every line; 400 otherwise); 409 `STAFF_BUSY` when they have another booking now or are still with another customer. *Done (book ahead):* with `startTime` (and the then required `bookingDate`) it books a confirmed session for that slot, as the counter books (open day, branch hours, half-hour grid, still to come), validity checked at the planned start, the settings revision recorded. *Done (§6 slice 1):* 400 naming each service the active branch doesn't offer, 409 `CONFLICT` on a catalogue change after the check; the dialog lists only the active branch's SPA services |
| `membership-tiers` | GET, POST | receptionist | shared | Done (§4b): GET returns `{ tiers, canEditTax }` (every tier, retired ones too); POST adds a tier; only the Developer sends a SAC code; audited at the active branch |
| `membership-tiers/[id]` | PATCH | receptionist | shared | Done (§4b): edits name, usual values, active state and order; a SAC change is Developer-only (an unchanged code is allowed); no DELETE, a tier is retired |
| `offers`, `offers/[id]` | GET, POST, PATCH | manager | shared | Read-only after the Payload cutover (R4.6) |
| `services/all` | GET | manager | shared | *Decided (§6 slice 1): unchanged.* It feeds the staff skills picker, which lists every service: a person can work at several branches, and availability limits only what a branch books |
| `services`, `services/[id]`, `service-categories`, `service-categories/[id]` | writes | 410 | retired | Keep 410. *Done (§6 slice 1):* `GET services` carries each service's `availableBranchIds` (null = every branch), and the session dialog lists only the active branch's |
| `settlements`, `settlements/[id]` | GET | (new) | settlement | *Done (§4c):* `requireSettlementViewer()` re-reads the role and owned branches; the Developer reads every pair, an Owner the pairs with a branch they own, anyone else gets 404; `?month=YYYY-MM`; `settlements/[id]?format=csv` downloads the statement (R10.4) |
| `settlements/[id]/paid` | POST | (new) | settlement | *Done (§4c):* the paying branch's Owner or the Developer records the date and reference once (403 for the receiving branch's Owner, 409 when paid or nothing is owed, no future date); an internal transfer only between one Owner's branches; audited (R10.5, MS-25) |
| `settlements/entries/[id]/reverse` | POST | (new) | developer | *Done (§4c):* the Developer's correction, with a reason, lands in the open month; an entry is reversed once; audited (MS-24) |
| `reports` (settlement block) | GET | manager | branch | *Done (§4c):* the active branch's minutes and gems across branches for the range; the money only for its Owner and the Developer |
| `ably/token` | POST | receptionist | branch | Capabilities for allowed branches only; branch-qualified names; bound `clientId`; 10-minute TTL; revocation (design §3) |
| `notifications` | GET, PATCH | staff | self | None |
| `me/leave`, `me/leave/[id]`, `me/schedule` | GET, POST, DELETE | staff | self | Show each day's branch |
| `integrations`, `logs` | GET | developer | developer | None |
| `auth/[...all]` | all | Better Auth | auth | None |
| `health` | GET | none | health | None |

### Jobs (all QStash-signed)

| Job | Scope needed |
| --- | --- |
| `daily-sales-report`, `weekly-report` | One report per branch to its recipients; Developer may get a summary (R7.4) |
| `nightly-sales-summary`, `monthly-gst-summary` | Per branch and issuer, from stored invoice amounts (R6.5). Done (§5) for the GST summary: rows per month, branch, issuer GSTIN and SAC code from the stored lines, rebuilt in one transaction |
| `appointment-reminders`, `post-service-followup`, `noshow-check`, `stale-booking-alert`, `pending-booking-closeout` | Per booking: real branch details in messages; alerts go to that branch; no-show releases holds |
| `lead-followups` | The lead's branch |
| `invoice-pdf` | Render from the invoice's issuer snapshot (R6.1). Done (§5): `buildPdfPayload`, template v2 per-line SAC and rate; older invoices render as before |
| `membership-auto-expire`, `membership-expiry`, `membership-expired-notice`, `membership-usage-nudges` | Shared memberships; expiry releases unstarted holds and never extends expiry (MS-04, MS-06). *Done (§4 slice 1):* `membership-auto-expire` cancels the unstarted sessions of the memberships it expires, which releases their holds, leaves sessions in progress to complete, and returns `{ expired, cancelledSessions }` |
| `gems-auto-expire`, `gems-expiry-reminder`, `birthday-emails` | Shared customer data; no branch. *Done (§4c):* the expiry gives back gems held by bookings that ended, then expires only each lapsed batch's unspent gems; the reminder counts unspent gems only (ST-04) |
| `customer-stats-reconcile` | Shared counters stay internal and never reach shared responses (R3.2) |
| `offer-auto-expire` | Shared; Payload offer dates may replace it after the cutover |
| `service-drift-reconcile` | Extend to availability and offers (R4.7). *Done for availability (§6 slice 1):* also compares SAC codes, "all branches" and the branch lists; offers remain |
| `session-cleanup` | Global |
| New: missing-Manager reminder | 10:00 IST daily per operational branch without a Manager (R1.9) |
| `settlement-close` | *Done (§4c):* daily at 00:30 IST and idempotent: closes every ended IST month into per-pair statements for memberships and gems, with each branch's net position; heartbeat `SETTLEMENT_CLOSE` (R10.3) |
| `staff-overrun-check` | *New (§4 slice 2b):* every 15 minutes, 07:30–22:15 IST. Flags bookings held up more than 10 minutes by their person's earlier work, keeping the assignee, and tells the booking's own branch front desk with up to three free candidates; heartbeat `STAFF_OVERRUN` (MS-08) |

## Web API

| Route | Methods | Today | Class | Change needed |
| --- | --- | --- | --- | --- |
| `availability` | GET | none | public | Validated branch: its hours, lead time and booking window (*done*, with a `notice` when a day has none, and an optional `durationMinutes`), holidays (*done*). *Decided (§6 slice 1):* slots don't depend on service availability; the booking dialog lists only the chosen branch's services and `bookings` refuses the rest |
| `branches` | GET | none | public | Operational branches only |
| `services`, `services/[slug]` | GET | none | public | Branch availability labels (R4.2, R7.2). *Done (§6 slice 1):* each service carries `availableBranchIds` (null = every branch); `services` adds `availabilityNote` ("Only at Rayasandra", null for every branch), naming public branches only |
| `offers` | GET | none | public | Payload offers; omit counter-only discounts if you approve them |
| `leads` | POST | rate limit | public | Branch from the ad link, with a validated fallback (R7.3) |
| `contact` | POST | rate limit | public | Default: main branch inbox |
| `bookings` | GET, POST | session, onboarded | self | Book at the chosen branch with its policy (*done:* hours, lead time, window, booking limit, revision recorded) and availability (*done, §6 slice 1:* 400 naming each service the branch doesn't offer, 409 `CONFLICT` when the catalogue changed after the check) |
| `bookings/[id]`, `.../cancel`, `.../reschedule` | GET, POST | session | self | Ownership check exists; branch policy resolver *done* (terms on GET, late cancellation counted, reschedule limit and cut-off, revision logged); membership holds (§4). *Done (§4 slice 3):* moving a confirmed booking onto a time its person can't take (booked, on leave, not scheduled) goes ahead without them, and the booking waits for reception to assign someone; 409 `BOOKING_SLOT_UNAVAILABLE` remains only for a race (slice 2 refused the move) |
| `gems` | GET | session | self | Shared |
| `gems/redeem` | POST | onboarded | self | Branch from the selector; the branch's policy decides the slot and the booking limit (*done*). *Done (§6 slice 1):* `RedeemFlow.tsx` has a "Redeem at" picker of the branches taking bookings (the default one preselected) and lists only the rewards that branch offers; 400 naming a reward the branch doesn't offer, 409 `CONFLICT` when the catalogue changed after the check (nothing is spent) |
| `membership` | GET | session | self | No tier names or usual prices (R9.1) |
| `notifications`, `profile/preferences`, `push/subscribe`, `onboarding/complete` | GET, PATCH, POST, DELETE | session | self | Onboarding consent copy for sharing across Royal Glow branches (R3.4) |
| `ably/token` | POST | session | self | Customer channels stay per customer |
| `revalidate` | POST | shared secret | job | CMS to web; add offer tags. *Decided (§6 slice 1):* availability needs no tag of its own: a category or service save sends `service`, and the route also revalidates every path (`revalidatePath('/', 'layout')`) |
| `auth/[...all]` | all | Better Auth | auth | None |
| `health` | GET | none | health | None |

## CMS API

Payload's own collection routes keep Payload authentication. Only the custom
endpoint is listed.

| Route | Methods | Today | Class | Change needed |
| --- | --- | --- | --- | --- |
| `catalogue-branches` | GET | (new) | shared | *New (§6 slice 1):* id, name, code and status of every branch from `public.branch`, in display order, for the availability picker on categories and services; 401 without a CMS login; read-only, `no-store` |

## Pages, libraries and realtime

| File | Class | Change needed |
| --- | --- | --- |
| `apps/admin/src/app/page.tsx` | branch | *New (§6 slice 1):* the dashboard lists the active branch's pending and confirmed bookings, from today on, with a service the branch no longer offers (`getBookingsWithServicesNotOffered`), for reception to keep, cancel or rebook; a derived list, no flags table (R4.4) |
| `apps/admin/src/app/bookings/new/page.tsx` | branch | Load the active branch's services, staff and hours. *Done (§6 slice 1) for services:* only those the branch offers |
| `apps/admin/src/app/customers/[id]/page.tsx` | shared + money | Same projection as the `customers/[id]` API |
| `apps/admin/src/app/me/schedule/page.tsx` | self | None |
| `apps/admin/src/lib/api/audit.ts` | branch | Record the branch on audit entries |
| `apps/admin/src/lib/notifications/dispatch.ts` | branch | Recipients from the record's branch |
| `apps/{admin,web}/src/lib/realtime/` | branch | `booking:{id}` becomes `booking:{branchId}:{bookingId}`; drop `booking:*` and `admin:bookings:*` from admin tokens; branch-qualify `admin:schedule:{date}` and `admin:leave` (design §3) |
| `apps/web/src/app/(customer)/{gems,membership,profile}/page.tsx` | self | Membership page shows no tier or usual price |
| `apps/web/src/app/(customer)/services/[slug]/page.tsx`, `sitemap.ts`, `llms.txt`, `llms-full.txt` | public | Availability labels. *Done (§6 slice 1):* the services list and a service's page, `llms.txt` and `llms-full.txt` say "Only at …" for a restricted service, naming public branches only. *Decided:* `sitemap.ts` unchanged; every active service keeps its page |
| `apps/web/src/app/(landing)/book/page.tsx` | public | Branch from the ad link |
| `apps/web/src/components/gems/RedeemFlow.tsx` | self | Replace `PRIMARY_BRANCH_ID` with the branch selector. *Done (§6 slice 1):* "Redeem at" lists the branches taking bookings; the rewards and slots follow the chosen branch |

## Gaps found

Status on 31 October 2026 (Neon dev): all nine gaps are resolved. The Jobs
table above is
implemented for alerts, lead follow-ups, reports and the missing-Manager
reminder; monthly GST is summed per branch, issuer GSTIN and SAC code from
the stored invoice lines (§5).

1. Managers can change business hours, GST and booking rules through
   `PUT /api/settings`. v6 makes all three per branch and Developer-only.
   *Resolved: `GET`/`PUT /api/settings` are Developer-only; the schedule grid
   reads the active branch's business hours through `GET /api/schedule`.
   Business hours and booking rules are per branch, as revisions (§5,
   30/10).*
2. Branch creation and edits are Owner+ today. They become Developer-only,
   with closures moving to a separate endpoint for Owners and Managers.
   *Resolved: creation and edits are Developer-only; closures have their own
   endpoint for the branch's Manager, Owner and Developer (R1.8); a shutdown
   lists what is still open and the database refuses it until clear, and an
   empty shut-down branch can be deleted (R1.10).*
3. `POST /api/staff` and `PATCH /api/staff/[id]` have no branch scope, and the
   designation list includes Manager and Receptionist.
   *Resolved: active-branch scope; Managers add, edit and remove Stylists
   and Therapists only.*
4. Admin tokens grant `booking:*` and `admin:bookings:*`. `admin:schedule:{date}`
   and `admin:leave` aren't branch-qualified.
   *Resolved: branch-qualified names, capabilities per allowed branch,
   10-minute TTL and the revocation outbox (migration 0008).*
5. Memberships sold at another branch (confirmed 28 October): the price paid
   and agreed-versus-usual prices show only to people who can access the
   selling branch. Everyone else sees hours, expiry and the selling branch's
   name. Cancelling stays with the selling branch's Manager or Owner, or the
   Developer. Settlement statements are the one exception (R10.5).
   *Resolved: `spa_membership.selling_branch_id` (migration 0007) and
   `membership-access.ts`.*
6. `PRIMARY_BRANCH_ID` remains in the `memberships` and
   `memberships/[id]/sessions` routes and in `RedeemFlow.tsx`.
   *Resolved: admin sales and sessions use the active branch, and
   `RedeemFlow.tsx` has a "Redeem at" picker built by
   `buildPublicBranchList`, the default branch preselected (§6 slice 1,
   31/10).*
7. `monthly-gst-summary` runs at `30 19 1 * *` UTC, which is 01:00 IST on the
   2nd. Its description in `apps/admin/src/lib/jobs/schedules.ts` says the 1st.
   It still summarises the previous month; only the description is wrong.
   *Resolved: the description says the 2nd.*
8. `gems-auto-expire` deducts a batch's full amount even when the gems were
   already spent, so a balance can go negative. Nobody is affected yet: there
   are no redemptions or redeemable services. Fixed by gem batches
   ([settlement.md](settlement.md)).
   *Resolved (§4c): the expiry takes only a lapsed batch's unspent gems
   (`expireLapsedGems`).*
9. Rejecting or cancelling a gems redemption booking never returns the gems:
   `bookings/[id]`, web `bookings/[id]/cancel`, `bookings/[id]/noshow` and the
   `pending-booking-closeout` and `stale-booking-alert` jobs need to return them
   (R10.10).
   *Resolved (§4c, §4 slice 3): rejecting, marking a no-show, a customer's or
   the salon's cancellation and the pending closeout give the gems back in
   the same transaction (`returnGemsOfEndedRedemptions`);
   `stale-booking-alert` only alerts, and the nightly expiry gives back any
   gems an ended booking still holds.*
