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

## Admin API

| Route | Methods | Today | Class | Change needed |
| --- | --- | --- | --- | --- |
| `bookings` | GET | receptionist | branch | List the active branch only |
| `bookings/new` | POST | receptionist | branch | Rendered branch id; staff-picker rules; occupancy |
| `bookings/[id]` | GET, PATCH | receptionist | branch | Record must belong to the active branch; assignment checks; branch-qualified realtime |
| `bookings/[id]/complete` | POST | receptionist | branch | Issuer snapshot, branch tax version, branch and financial-year numbering |
| `bookings/[id]/noshow` | POST | receptionist | branch | Release membership holds |
| `billing`, `billing/[id]` | GET | receptionist | branch | Active branch's invoices; 404 for others |
| `waitlist`, `waitlist/[id]` | GET, PATCH | receptionist | branch | Add a branch to waitlist rows |
| `leads`, `leads/[id]`, `leads/[id]/notes` | GET, POST, PATCH | receptionist | branch | Branch from the ad link; audited cross-branch move |
| `leave`, `leave/[id]` | GET, PATCH | receptionist | branch | Active branch's staff; leave for a shared Manager needs an Owner of one of their branches or the Developer (R5.10) |
| `schedule` | GET, PUT | manager | branch | Schedule per branch per day; a shared Manager is at one branch each day |
| `reports` | GET | manager | branch | Aggregate the active branch only |
| `staff` | GET | receptionist | branch | Picker lists the active branch's eligible people |
| `staff` | POST | manager | people | Rebuilt Add staff: search; Stylist or Therapist only; active branch; one transaction (R1.11) |
| `staff/all`, `staff/[id]` | GET, PATCH | manager | people | Branch-scoped; Managers edit Stylists and Therapists only |
| `staff/[id]/services` | PUT | manager | people | Branch-scoped |
| `users` | GET, POST | owner | people | The Owner of the branch, or the Developer, assigns its Manager and Receptionist; writes the branch relationships |
| `branches` | GET | owner | shared | Return only branches the user can access |
| `branches` | POST | owner | developer | Developer-only branch creation (R1.1) |
| `branches/[id]` | PATCH, DELETE | owner | developer | Developer-only details, hours and status; the Owner changes only by handover. Shutdown only once nothing is open (409 with the list); delete only a shut-down branch no record names (R1.10) |
| `branches/[id]/shutdown-check` | GET | (new) | developer | What is still open before a shutdown (R1.10) |
| `closures`, `closures/[id]` | GET, POST, DELETE | (new) | branch | The branch's Manager, Owner and Developer maintain its closures; all-branches closures are Developer only (R1.8) |
| `settings` | GET, PUT | manager | developer | `businessHours`, `gst` and `bookingRules` become per branch and Developer-only; GST becomes effective-dated versions |
| `customers` | GET | receptionist | shared + money | Lifetime value, spend and sorting per active branch |
| `customers/[id]` | GET, PATCH | receptionist, manager | shared + money | Minimal shared identity; history money per branch; private notes |
| `customers/[id]/notes` | POST | receptionist | shared + money | Shared or branch-private visibility (R3.1) |
| `customers/[id]/tags`, `.../tags/[tagId]` | POST, DELETE | receptionist | shared | None |
| `tags` | GET, POST | receptionist, manager | shared | None |
| `memberships`, `memberships/[id]` | GET | receptionist | shared + money | Usable at every branch; see gap 5 for money |
| `memberships` | POST | receptionist | branch | Selling branch is the active branch; remove `PRIMARY_BRANCH_ID`; new sale form (§4b) |
| `memberships/[id]/cancel` | POST | manager | shared | See gap 5 |
| `memberships/[id]/sessions` | POST | receptionist | branch | Performing branch is the active branch; remove `PRIMARY_BRANCH_ID`; lifecycle (§4) |
| `membership-tiers` | GET | receptionist | shared | Add create and update; tax class Developer-only (§4b) |
| `offers`, `offers/[id]` | GET, POST, PATCH | manager | shared | Read-only after the Payload cutover (R4.6) |
| `services/all` | GET | manager | shared | Add branch availability |
| `services`, `services/[id]`, `service-categories`, `service-categories/[id]` | writes | 410 | retired | Keep 410; reads add availability |
| New: `settlements`, `settlements/[id]` | GET, PATCH | none yet | branch pair | Owners of the two branches and the Developer read statements, entries and CSV; the paying branch's Owner or the Developer marks paid (R10.4, R10.5) |
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
| `nightly-sales-summary`, `monthly-gst-summary` | Per branch and issuer, from stored invoice amounts (R6.5) |
| `appointment-reminders`, `post-service-followup`, `noshow-check`, `stale-booking-alert`, `pending-booking-closeout` | Per booking: real branch details in messages; alerts go to that branch; no-show releases holds |
| `lead-followups` | The lead's branch |
| `invoice-pdf` | Render from the invoice's issuer snapshot (R6.1) |
| `membership-auto-expire`, `membership-expiry`, `membership-expired-notice`, `membership-usage-nudges` | Shared memberships; expiry releases unstarted holds and never extends expiry (MS-04, MS-06) |
| `gems-auto-expire`, `gems-expiry-reminder`, `birthday-emails` | Shared customer data; no branch |
| `customer-stats-reconcile` | Shared counters stay internal and never reach shared responses (R3.2) |
| `offer-auto-expire` | Shared; Payload offer dates may replace it after the cutover |
| `service-drift-reconcile` | Extend to availability and offers (R4.7) |
| `session-cleanup` | Global |
| New: missing-Manager reminder | 10:00 IST daily per operational branch without a Manager (R1.9) |
| New: `settlement-close` | Daily and idempotent: closes every ended IST month into per-pair statements for memberships and gems (R10.3) |

## Web API

| Route | Methods | Today | Class | Change needed |
| --- | --- | --- | --- | --- |
| `availability` | GET | none | public | Validated branch: its hours, holidays and service availability |
| `branches` | GET | none | public | Operational branches only |
| `services`, `services/[slug]` | GET | none | public | Branch availability labels (R4.2, R7.2) |
| `offers` | GET | none | public | Payload offers; omit counter-only discounts if you approve them |
| `leads` | POST | rate limit | public | Branch from the ad link, with a validated fallback (R7.3) |
| `contact` | POST | rate limit | public | Default: main branch inbox |
| `bookings` | GET, POST | session, onboarded | self | Book at the chosen branch with its availability and policy |
| `bookings/[id]`, `.../cancel`, `.../reschedule` | GET, POST | session | self | Ownership check exists; use the branch policy resolver and membership holds |
| `gems` | GET | session | self | Shared |
| `gems/redeem` | POST | onboarded | self | Branch from the selector (`RedeemFlow.tsx` sends `PRIMARY_BRANCH_ID`) |
| `membership` | GET | session | self | No tier names or usual prices (R9.1) |
| `notifications`, `profile/preferences`, `push/subscribe`, `onboarding/complete` | GET, PATCH, POST, DELETE | session | self | Onboarding consent copy for sharing across Royal Glow branches (R3.4) |
| `ably/token` | POST | session | self | Customer channels stay per customer |
| `revalidate` | POST | shared secret | job | CMS to web; add availability and offer tags |
| `auth/[...all]` | all | Better Auth | auth | None |
| `health` | GET | none | health | None |

## Pages, libraries and realtime

| File | Class | Change needed |
| --- | --- | --- |
| `apps/admin/src/app/bookings/new/page.tsx` | branch | Load the active branch's services, staff and hours |
| `apps/admin/src/app/customers/[id]/page.tsx` | shared + money | Same projection as the `customers/[id]` API |
| `apps/admin/src/app/me/schedule/page.tsx` | self | None |
| `apps/admin/src/lib/api/audit.ts` | branch | Record the branch on audit entries |
| `apps/admin/src/lib/notifications/dispatch.ts` | branch | Recipients from the record's branch |
| `apps/{admin,web}/src/lib/realtime/` | branch | `booking:{id}` becomes `booking:{branchId}:{bookingId}`; drop `booking:*` and `admin:bookings:*` from admin tokens; branch-qualify `admin:schedule:{date}` and `admin:leave` (design §3) |
| `apps/web/src/app/(customer)/{gems,membership,profile}/page.tsx` | self | Membership page shows no tier or usual price |
| `apps/web/src/app/(customer)/services/[slug]/page.tsx`, `sitemap.ts`, `llms.txt`, `llms-full.txt` | public | Availability labels |
| `apps/web/src/app/(landing)/book/page.tsx` | public | Branch from the ad link |
| `apps/web/src/components/gems/RedeemFlow.tsx` | self | Replace `PRIMARY_BRANCH_ID` with the branch selector |

## Gaps found

Status on 29 October 2026 (Neon dev): gaps 1, 2, 3, 4, 5 and 7 are resolved;
gap 6 is resolved in the admin app only; gaps 8 and 9 wait for gem batches
(§4c). The Jobs table above is
implemented for alerts, lead follow-ups, reports and the missing-Manager
reminder; monthly GST per branch and issuer waits for issuer snapshots (§5).

1. Managers can change business hours, GST and booking rules through
   `PUT /api/settings`. v6 makes all three per branch and Developer-only.
   *Resolved: `GET`/`PUT /api/settings` are Developer-only; the schedule grid
   reads business hours through `GET /api/schedule`. Per-branch settings are
   §5.*
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
   *Admin resolved: sales and sessions use the active branch. Still open:
   `RedeemFlow.tsx` defaults to `branch_rayasandra` (`DEFAULT_BRANCH_ID`)
   instead of a branch selector (R7.2, §6).*
7. `monthly-gst-summary` runs at `30 19 1 * *` UTC, which is 01:00 IST on the
   2nd. Its description in `apps/admin/src/lib/jobs/schedules.ts` says the 1st.
   It still summarises the previous month; only the description is wrong.
   *Resolved: the description says the 2nd.*
8. `gems-auto-expire` deducts a batch's full amount even when the gems were
   already spent, so a balance can go negative. Nobody is affected yet: there
   are no redemptions or redeemable services. Fixed by gem batches
   ([settlement.md](settlement.md)).
9. Rejecting or cancelling a gems redemption booking never returns the gems:
   `bookings/[id]`, web `bookings/[id]/cancel`, `bookings/[id]/noshow` and the
   `pending-booking-closeout` and `stale-booking-alert` jobs need to return them
   (R10.10).
