# Background Jobs — QStash (+ GitHub Actions)

## Architecture Decision: pg_cron → QStash (RATIFIED)

**All scheduled jobs run on QStash** (HTTP → Next.js `/api/jobs/*` routes). pg_cron
is **not used**. Originally 7 jobs were planned on pg_cron inside Neon; they were
migrated to QStash and the hand-written `0001_pg_cron_jobs.sql` migration was
removed.

**Why:** the free-tier prod Neon compute scales to zero after ~5 min idle
(`suspend_timeout_seconds: 0`), and **pg_cron only fires while the compute is
awake**. The migrated jobs run between 11:30 PM–2:30 AM IST — exactly when there
is no customer traffic to keep the DB warm — so pg_cron would silently miss most
nights (silent data drift, worse than an obvious absence). Disabling scale-to-zero
fixes it but costs money and contradicts the project's ₹0 philosophy. QStash POSTs
an endpoint that **wakes** the compute, so each job runs reliably at ₹0.

The migrated job SQL bodies were ported verbatim into typed query functions in
`packages/db/src/queries/jobs.ts` (section 3) and are invoked by these QStash
routes. Every body is idempotent, so QStash at-least-once retries are safe.

| Migrated job | Route | Cron (UTC) | IST |
|---|---|---|---|
| Nightly sales summary | `/api/jobs/nightly-sales-summary` | `0 18 * * *` | 11:30 PM |
| Membership auto-expire | `/api/jobs/membership-auto-expire` | `30 18 * * *` | 12:00 AM |
| Offer auto-expire | `/api/jobs/offer-auto-expire` | `35 18 * * *` | 12:05 AM |
| Gems auto-expire | `/api/jobs/gems-auto-expire` | `40 18 * * *` | 12:10 AM |
| Session cleanup | `/api/jobs/session-cleanup` | `0 21 * * 0` | 2:30 AM Sun |
| Monthly GST summary | `/api/jobs/monthly-gst-summary` | `30 19 1 * *` | 1:00 AM (1st) |

Only **Job 5 (pprd DB sync)** remains off QStash — it runs on **GitHub Actions
cron** (it resets a Neon branch, which is a control-plane op, not in-DB SQL).

## Overview

Royal Glow uses two tools for scheduled and event-driven background work:

| Tool | Runs inside | Use for | Free tier |
|------|------------|---------|-----------|
| **QStash** | Upstash HTTP queue → Next.js `/api/jobs/*` | ALL scheduled + triggered jobs (DB maintenance, email, push, Slack, webhooks) | 500 messages/day |
| **GitHub Actions cron** | GitHub CI | Control-plane ops only (Neon `pprd` branch reset + PII strip — Job 5) | 2,000 min/mo |

**Routing rule:** every scheduled or event-driven job is a QStash message that
POSTs a `/api/jobs/...` route — including the pure-SQL maintenance jobs (which run
their idempotent SQL via `@rgss/db` query functions). The only exception is Job 5,
which manipulates a Neon branch rather than running in-DB SQL.

**All QStash jobs call Next.js API routes** (`POST /api/jobs/...`) which perform DB reads and external service calls. QStash automatically retries on non-2xx responses with exponential backoff (up to 3 retries by default).

**All jobs ping a BetterStack heartbeat URL on success** — silent failure is detected and alerted. See [observability.md](./observability.md) for heartbeat monitor configuration.

**Where they run:** all `/api/jobs/*` routes are hosted in `apps/admin` on AWS Lambda and served from `admin.theroyalglow.in/api/jobs/*`. QStash schedules are registered by `.github/workflows/register-schedules.yml` against the admin origin; triggered jobs are enqueued with a delay against that same origin.

---

## Invoice Email — Not a Job

The customer invoice email is **synchronous** — fired immediately within the API request when the receptionist marks payment received. No cron, no queue.

```
Receptionist clicks "Generate Invoice"
    → POST /api/bookings/:id/complete
    → DB: booking.status = 'completed', invoice row created
    → PDF generated inline
    → Resend API called immediately → invoice + PDF emailed to customer
    → Customer receives invoice within seconds of leaving the counter
```

This is intentional — invoice delivery is time-critical. Customers are still at the counter or walking out.

---

## Gems Earned Push — Synchronous (Not a Job)

When gems are earned on invoice completion, a **push notification fires synchronously** in the same API request — no cron, no queue.

```
Receptionist clicks "Generate Invoice"
    → POST /api/bookings/:id/complete
    → DB: gems earned, loyalty_transaction inserted with expires_at = created_at + 365 days
    → web-push sent immediately: "You earned X gems! Use them within 1 year."
    → Customer receives push within seconds of payment
```

This mirrors the invoice email pattern: both are fired in-request because the customer is still at the counter.

---

## Re-engagement Email — Brevo Automation (Not a Job)

Inactive-customer re-engagement is handled inside **Brevo automations**, not by `pg_cron` or QStash.

```
Customer becomes inactive in synced CRM attributes
  → Brevo segment rule matches (inactive 60+ days)
  → Brevo workflow applies wait / suppression rules
  → Re-engagement email is sent from Brevo
```

This is marketing automation, so it is **not counted** in the background-job inventory below.

---

## Jobs 1-6 — Core Nightly Operations

Jobs 1-4, 6 and 7 are the migrated maintenance jobs — they now run as **QStash
scheduled** HTTP jobs (see the Architecture Decision above), each POSTing its
`/api/jobs/...` route which executes the idempotent SQL via a `@rgss/db` query
function. The "Type" rows below still name `pg_cron` for historical context, but
the live implementation is QStash at the same UTC time. Job 5 (`pprd DB Sync`)
runs via GitHub Actions cron, then applies SQL anonymisation on the target Neon
branch.

All times are UTC. Salon operates IST (UTC+5:30). All jobs run in the early hours IST when traffic is zero.

### Job 1 — Nightly Sales Summary

| Field | Value |
|-------|-------|
| **Schedule** | `0 18 * * *` UTC = 11:30 PM IST |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_NIGHTLY_SALES` |

**What it does:** Aggregates the day's invoices into the `daily_sales_summary` table — Salon revenue, SPA revenue, membership purchases, total paise, invoice count. Runs after the salon closes so the full day is captured.

**Why:** Owner opens `/admin/reports` in the morning and sees yesterday's numbers instantly — pre-aggregated, not computed on page load across JOIN-heavy queries.

```sql
INSERT INTO daily_sales_summary (date, branch_id, salon_revenue_paise, spa_revenue_paise,
                                  membership_revenue_paise, total_revenue_paise, invoice_count)
SELECT
  CURRENT_DATE - INTERVAL '1 day',
  i.branch_id,
  SUM(CASE WHEN i.invoice_type = 'service' AND b.service_type = 'salon' THEN i.total_amount_paise ELSE 0 END),
  SUM(CASE WHEN i.invoice_type = 'service' AND b.service_type = 'spa'   THEN i.total_amount_paise ELSE 0 END),
  SUM(CASE WHEN i.invoice_type = 'membership_purchase'                  THEN i.total_amount_paise ELSE 0 END),
  SUM(i.total_amount_paise),
  COUNT(i.id)
FROM invoice i
JOIN booking b ON i.booking_id = b.id
WHERE i.created_at >= CURRENT_DATE - INTERVAL '1 day'
  AND i.created_at <  CURRENT_DATE
  AND i.payment_status = 'paid'
GROUP BY i.branch_id;
```

---

### Job 2 — Membership Auto-Expire

| Field | Value |
|-------|-------|
| **Schedule** | `30 18 * * *` UTC = 12:00 AM IST |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_MEMBERSHIP_EXPIRY` |

**What it does:** In one transaction, cancels the membership sessions that never started (pending or confirmed) of every membership whose `expires_at` has passed, with the reason "The membership expired before this session started.", then flips `spa_membership.status` from `active` to `expired` for those memberships. Cancelling a session releases the minutes it held (migration 0026). A session already in progress keeps its held minutes and completes later. The route returns `{ expired, cancelledSessions }`.

**Why:** A customer's membership expires at 11:59 PM. At midnight their status flips automatically. If they try to book an SPA session the next day, the system correctly shows them as non-member. A session booked for after the expiry can't start any more, so its minutes are given back; one that started in time still completes (membership-scheduling.md, MS-04 and MS-06). No manual intervention. The job writes no booking status-log entry: it is a system change with no acting person.

```sql
WITH unstarted AS (
  UPDATE booking b
     SET status = 'cancelled', cancellation_reason = 'The membership expired before this session started.',
         cancelled_at = now(), updated_at = now()
   WHERE b.is_membership_session
     AND b.status IN ('pending', 'confirmed')
     AND b.spa_membership_id IN (SELECT m.id FROM spa_membership m
                                  WHERE m.status IN ('active', 'expired') AND m.expires_at < now())
  RETURNING 1
)
SELECT count(*) FROM unstarted;

UPDATE spa_membership
SET status = 'expired', updated_at = NOW()
WHERE status = 'active'
  AND expires_at < NOW();
```

---

### Job 3 — Offer Auto-Expire

| Field | Value |
|-------|-------|
| **Schedule** | `35 18 * * *` UTC = 12:05 AM IST |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_NIGHTLY_SALES` (shared) |

**What it does:** Deactivates offers whose `end_date` has passed.

**Why:** Manager creates "20% off Facials — valid till 31 May". On 1 June, the offer disappears from `/offers` and cannot be applied at checkout. No manual cleanup needed.

```sql
UPDATE offer
SET is_active = false, updated_at = NOW()
WHERE is_active = true
  AND end_date < CURRENT_DATE;
```

---

### Job 4 — Session Cleanup

| Field | Value |
|-------|-------|
| **Schedule** | `0 21 * * 0` UTC = 2:30 AM IST Sunday |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_SESSION_CLEANUP` |

**What it does:** Deletes expired Better Auth session rows.

**Why:** Every customer login creates a `session` row with a 30-day expiry. Without cleanup, the table grows unbounded. Weekly is sufficient — sessions expire after 30 days so no urgency.

```sql
DELETE FROM session WHERE expires_at < NOW();
```

---

### Job 5 — pprd DB Sync

| Field | Value |
|-------|-------|
| **Type** | GitHub Actions cron + SQL anonymisation |
| **Schedule** | `30 19 * * *` UTC = 1:00 AM IST |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_PPRD_SYNC` |

**What it does:** Resets the `pprd` Neon branch from `prod`, then anonymises copied customer data so UAT has realistic records without exposing real PII.

**Why:** Pre-production validation needs realistic booking patterns, scheduling edge cases, and membership scenarios. It must never expose real customer phone numbers or emails.

```sql
-- Run on pprd branch after data copy:
UPDATE customer_profile SET
  phone = 'XXXXX' || SUBSTRING(phone, -5),
  utm_campaign = NULL,
  utm_source   = NULL;

UPDATE "user" SET
  email = 'anon_' || id || '@dev.theroyalglow.in',
  name  = 'Test User ' || SUBSTRING(id, 1, 6);
```

---

### Job 6 — Monthly GST Summary

| Field | Value |
|-------|-------|
| **Schedule** | `30 19 1 * *` UTC = 1:00 AM IST on the **2nd** of every month (19:30 UTC on the 1st); it summarises the previous IST month |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_MONTHLY_GST` |

**What it does:** Rebuilds the previous IST month's `monthly_gst_summary` rows: one per branch, issuer GSTIN and SAC code (multi-branch R6.5), with taxable value, GST, CGST, SGST and the number of invoices with a line under the code. It sums the lines each invoice stored when it was issued (paid `service` and `membership_purchase` invoices whose tax point falls in the month), never today's rates. An invoice from before the issue snapshots counts under SAC 999721 with its header amounts. Code: `buildMonthlyGstSummary` in `packages/db/src/queries/jobs.ts`.

**Why:** each branch files GST under its own GSTIN; the Owner or CA needs taxable value and tax per GSTIN and SAC code per month. A pre-aggregated table avoids recomputing at filing time.

**Idempotent:** one transaction deletes the month's rows and inserts them again from the invoices, so a QStash retry gives the same rows (ids are `md5(month:branch:gstin:sac)`) and an invoice that is no longer paid drops out. A duplicate delivery running at the same time updates the first one's rows instead of failing.

```sql
-- Previous IST month, e.g. '2026-10', computed in the job.
DELETE FROM monthly_gst_summary WHERE month = :month;
INSERT INTO monthly_gst_summary (id, month, branch_id, issuer_gstin, sac_code,
  taxable_value_paise, gst_amount_paise, cgst_paise, sgst_paise, invoice_count)
SELECT md5(...), :month, branch_id, issuer_gstin, sac_code,
       sum(taxable), sum(tax), sum(cgst), sum(sgst), count(DISTINCT invoice_id)
  FROM (lines of snapshotted invoices UNION ALL headers of older ones) l
 GROUP BY branch_id, issuer_gstin, sac_code
ON CONFLICT ON CONSTRAINT monthly_gst_summary_month_branch_issuer_sac_unique DO UPDATE ...;
```

---

### Job 7 — Gems Auto-Expire

| Field | Value |
|-------|-------|
| **Type** | QStash scheduled (was pg_cron) |
| **Schedule** | `40 18 * * *` UTC = 12:10 AM IST |
| **Endpoint** | `POST /api/jobs/gems-auto-expire` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_GEMS_EXPIRE` |

**What it does (`expireLapsedGems` in `packages/db/src/queries/gems-ledger.ts`, multi-branch ST-03, ST-04):** in one transaction,

1. gives back the gems of any redemption whose booking ended (rejected, cancelled, no-show) without them being returned: a `returned` row per redemption, its allocations released;
2. expires each lapsed batch's **unspent** gems only, never gems already spent on a free service: one `expired` row per batch naming it in `batch_id`, described "Expired: gems earned on DD/MM/YYYY", recorded at the batch's branch;
3. takes the expired total off each balance.

Unspent = earned − active allocations + earlier expiries (`loyalty_batch_unspent`). The database refuses an expiry that removes more than that (trigger `loyalty_expiry_guard`). The earning branch keeps the value of expired gems; no settlement entry is made. Answers `{ batches, gems, returned }`.

**Why it changed:** the original job expired every earned row in full, so gems a customer had already spent were deducted a second time; with spending tracked per batch (`loyalty_allocation`) only what is left can expire. Idempotent: a rerun finds nothing unspent, so QStash retries expire nothing twice.

**Customer sees:** Gems balance reduced on `/gems` page. A push notification fires (Job 15 handles expiry warning — this job handles the actual deduction silently).

---

## QStash Scheduled Jobs (8) — HTTP → Next.js API Routes

### Job 8 — Appointment Reminders

| Field | Value |
|-------|-------|
| **Schedule** | Every 15 minutes, 8:00 AM–10:00 PM IST only |
| **Endpoint** | `POST /api/jobs/appointment-reminders` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_REMINDERS` |

**What it does:** Finds `confirmed` bookings starting in exactly the next 24h window or 1h window with no matching `notification` row already sent for `reminder_24h` / `reminder_1h`. Fires push notification (web-push) + email (Resend) to the customer, then writes a `notification` log row for idempotency.

**Customer experience:**
- Booking at Wednesday 4:00 PM
- **Tuesday 4:00 PM:** "Your appointment at Royal Glow is tomorrow at 16:00" — push + email
- **Wednesday 3:00 PM:** "Your appointment at Royal Glow starts in 1 hour" — push + email

Only sends if `appointment_reminders_enabled = true` on the customer profile.

---

### Job 9 — Membership Expiry Alerts

| Field | Value |
|-------|-------|
| **Schedule** | Daily `0 19 * * *` UTC = 12:30 AM IST |
| **Endpoint** | `POST /api/jobs/membership-expiry` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_MEMBERSHIP_EXPIRY` |

**What it does:** Finds active memberships expiring in exactly 30 days, 7 days, or 1 day. Sends push + email to the customer. Only fires if `membership_alerts_enabled = true` on customer profile.

This is the **expiry notification** job. It is separate from the randomized membership-usage nudge job below.

**Customer experience:**
- 30 days out: "Your SPA membership expires in 30 days. 6.5 hours remaining — book your sessions!"
- 7 days out: "Urgent: Expires in 7 days. Book your remaining hours!"
- 1 day out: "Last chance: Expires tomorrow. Unused hours will be forfeited."

---

### Job 10 — Birthday Emails

| Field | Value |
|-------|-------|
| **Schedule** | Daily `0 4 * * *` UTC = 9:30 AM IST |
| **Endpoint** | `POST /api/jobs/birthday-emails` |

**What it does:** Finds customers whose date_of_birth matches today (month + day). Sends a birthday offer email via Brevo and a birthday notification. Only fires if `marketing_consent = true`.

**Customer experience:** "Happy Birthday [Name]! Treat yourself today — enjoy 20% off all services. Valid today only." Sent by email and notification on the birthday itself.

---

### Job 11 — Membership Usage Nudges

| Field | Value |
|-------|-------|
| **Schedule** | Daily `30 5 * * *` UTC = 11:00 AM IST |
| **Endpoint** | `POST /api/jobs/membership-usage-nudges` |

**What it does:** Runs a daily randomized batch across active SPA memberships that still have unused time left. Each run picks a random subset of eligible members, sends their remaining hours summary by email + push notification, and skips members who were nudged recently so the same person is not contacted on every run.

**Why randomised:** This is a utilisation campaign, not an expiry milestone. Different members should hear from us on different days so the nudges feel occasional and help bring customers back to use their SPA time.

**Customer experience:** "You still have 3 hrs 30 min left in your SPA membership. Book your next session and enjoy it before it sits unused."

Only fires if `membership_alerts_enabled = true` on customer profile.

---

### Job 12 — Lead Follow-up Reminders

| Field | Value |
|-------|-------|
| **Schedule** | Daily `30 5 * * *` UTC = 11:00 AM IST |
| **Endpoint** | `POST /api/jobs/lead-followups` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_LEAD_FOLLOWUPS` |

**What it does:** Finds leads with `status = 'follow_up'` and `last_contacted_at` older than 48 hours. Each lead goes to its own branch (multi-branch R7.4):

- to the person it is assigned to, while they still hold a role at the lead's branch (the Developer acts at every branch);
- otherwise to the branch's front desk: its Receptionist, and its Manager or, without one, its Owner.

Each person gets one push per IST day covering all their stale leads. A lead without a branch is skipped and counted in the response (`unrouted`), never sent elsewhere.

**Receptionist sees:** "A follow-up with Priya at Rayasandra is due." With several: "3 leads at Rayasandra need a follow-up", or "4 leads need a follow-up: 3 at Rayasandra, 1 at Marathahalli".

---

### Job 13 — Daily Sales Report

| Field | Value |
|-------|-------|
| **Schedule** | Daily `0 17 * * *` UTC = 10:30 PM IST |
| **Endpoint** | `POST /api/jobs/daily-sales-report` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_NIGHTLY_SALES` (shared) |
| **Recipients** | Each branch's Owner and Manager (email); the Developer (summary by email and Slack) |

**What it does:** Reads today's paid invoices and bookings **per branch** (multi-branch R6.5, R7.4) and formats one report per branch. Every operational branch gets a report; a branch that isn't operational gets one only when it had activity.

- Each branch's Owner and Manager receive that branch's report. Someone with several branches gets one email with a section per branch. Nobody receives a branch where they hold no role, so a franchise Owner never sees Royal Glow's figures, and the reverse.
- The Developer alone receives the summary across branches: one block per branch plus the total. The same summary is posted to `SLACK_WEBHOOK_URL`, which must therefore be a channel only the Developer reads.
- Receptionists receive no sales report.
- Recipients come from branch roles. `DAILY_REPORT_EMAIL_RECIPIENTS` is retired: a fixed address list can't follow who may see which branch.
- The job answers 500 only when reading fails, before anything is sent. Sends never throw, so a QStash retry never resends reports.

New and returning customers are counted per branch: a customer is new where their first-ever booking falls in the period; at any other branch they are returning.

**Report format (one branch):**
```
📊 Royal Glow Rayasandra — Daily Sales Report
Date: DD/MM/YYYY (Weekday)
─────────────────────────────────────

🛎️ Services Performed
   8x Haircut                     ₹6,000.00
   ── sorted by revenue, highest first ──

💰 Revenue
   Salon services:        ₹20,400.00
   SPA services:          ₹16,000.00
   Membership purchases:  ₹15,000.00
   Total collected:       ₹51,400.00

📅 Bookings
   Completed:   18
   No-shows:     2
   Cancelled:    1
   Walk-ins:     4

👥 Customers
   New today:    3
   Returning:   15

💳 SPA Membership sessions: 3
```

**Summary format (Developer only):** "📊 Royal Glow — Daily Summary, All Branches", then per branch: total collected, completed, no-shows, cancelled and new customers, then the same lines for all branches together.

Queries: `getDailyBranchReports` / `getWeeklyBranchReports` in `packages/db/src/queries/jobs.ts` (four grouped reads in one `db.batch()`); recipients: `getBranchPeople` (`branch-recipients.ts`) and `planReportDeliveries` (`packages/business/src/branch/recipients.ts`).

---

### Job 14 — Weekly Summary Report

| Field | Value |
|-------|-------|
| **Schedule** | Weekly `30 2 * * 1` UTC = Monday 8:00 AM IST |
| **Endpoint** | `POST /api/jobs/weekly-report` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_NIGHTLY_SALES` (shared) |
| **Recipients** | As Job 13 |

**What it does:** The daily format over the last 7 IST days, per branch, with each branch compared with its own previous 7 days ("📈 Week-over-week: +₹500.00 (+50%)"). The Developer's summary adds each branch's and the total's week-over-week change.

---

### Job 15 — Gems Expiry Reminder

| Field | Value |
|-------|-------|
| **Type** | QStash scheduled |
| **Schedule** | Daily `0 5 * * *` UTC = 10:30 AM IST |
| **Endpoint** | `POST /api/jobs/gems-expiry-reminder` |

**What it does:** Finds customers with gems batches expiring in exactly 7 days and counts only each batch's **unspent** gems (`loyalty_batch_unspent`), so gems already spent on a free service aren't announced as expiring. Sends a **push notification only** (no email per design). Groups by customer so a customer with multiple expiring batches gets one combined notification; a customer whose expiring batches are fully spent gets none.

**Customer receives (push only):**
> "⏰ Your **X gems** expire in 7 days on DD/MM/YYYY. Book a service before then to use them!"

**Why push only, no email:** Gems are an engagement mechanic, not a critical transactional alert. A push notification is sufficient and less intrusive than an email.

---

## QStash Triggered Jobs (4) — Event-driven, Delayed

These are not on a schedule. They are enqueued by API routes with a delay when a specific business event occurs.

### Job 16 — Post-Service Follow-up Email

| Field | Value |
|-------|-------|
| **Trigger** | `booking.status` → `completed` |
| **Delay** | +24 hours |
| **Endpoint** | `POST /api/jobs/post-service-followup` |

**What it does:** 24 hours after a service is completed, sends a post-service follow-up email that names the branch and links that branch's own Google Maps listing (`branch.google_maps_url`, used only when it is a valid https URL). Only fires if `marketing_consent = true`. The implementation sends through Resend; the email text is escaped.

**Why 24h delay:** The visit is still fresh in the customer's mind, but the ask is no longer happening at the counter. That gives enough breathing room without waiting so long that response intent drops.

**Customer receives:** "How was your [Service] at Royal Glow? Help us grow — leave a review: [Google Maps link]"

---

### Job 17 — Stale Pending Booking Alert

| Field | Value |
|-------|-------|
| **Trigger** | Booking created with `status = 'pending'` |
| **Delay** | +2 hours |
| **Endpoint** | `POST /api/jobs/stale-booking-alert` |

**What it does:** If a booking is still `pending` 2 hours after creation, sends a push notification to that booking's branch: its Receptionist, and its Manager or, without one, its Owner (multi-branch R7.4; `alertBranchFrontDesk` in `apps/admin/src/lib/jobs/branch-alerts.ts`). Nobody at another branch is told, and the Developer isn't paged. The branch comes from the booking row, never the payload. Each person is told once per booking, so a QStash retry after a partial fan-out tells only those not yet told.

**Why:** Receptionist gets busy and misses a new booking request. Customer is left waiting and confused. This ensures no booking falls through the cracks.

**Receptionist sees:** "⚠️ Booking from Priya Sharma (3:00 PM today) has been pending for 2 hours — review now."

**Alert only.** The earlier "auto-reject after 24 hours" branch was removed (25/10/2026): this job is enqueued once at +2h, so that branch never ran in practice, and it contradicted the end-of-day rule. A booking nobody actions is closed by Job 21 (pending → `no_show` once its appointment has ended).

---

### Job 18 — No-Show Check

| Field | Value |
|-------|-------|
| **Trigger** | Booking `end_time` reached |
| **Delay** | +15 minutes after `end_time` |
| **Endpoint** | `POST /api/jobs/noshow-check` |

**What it does:** Checks if the booking status is still `confirmed` 15 minutes after the scheduled end time. If yes — it likely means the customer didn't show up and the receptionist hasn't marked it. Sends a push notification to that booking's branch front desk, exactly as Job 17 does.

**Receptionist sees:** "Booking #xxx for [Customer] at 4:00 PM appears to be a no-show. Mark accordingly."

**Why not auto-mark?** A receptionist might have manually extended the session without updating the system. Always alert a human — never auto-mark no-show without verification.

---

### Job 19 — Membership Expired Final Notice

| Field | Value |
|-------|-------|
| **Trigger** | `spa_membership.expires_at` timestamp passes |
| **Delay** | +1 hour after `expires_at` |
| **Endpoint** | `POST /api/jobs/membership-expired-notice` |

**What it does:** Sends a final "Your membership has expired" email via Resend with a renewal prompt and a small incentive.

**Customer receives:** "Your Royal Glow SPA Membership has expired. Unused hours have been forfeited. Renew today and enjoy priority booking for your first session."

---

## Job 20 — Service Catalogue Drift Reconciliation

| Field | Value |
|-------|-------|
| **Type** | QStash scheduled |
| **Schedule** | Daily `45 18 * * *` UTC = 12:15 AM IST |
| **Endpoint** | `POST /api/jobs/service-drift-reconcile` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_SERVICE_DRIFT` |

**What it does:** Compares `cms.service` against `public.service`, and
`cms.service_category` against `public.service_category` — row counts, per-row
`id`, and per-row field values including `updatedAt`. Any divergence is written
as an error-level structured log listing every finding.

**Why:** Payload CMS is the authoring source of truth for the catalogue, and an
`afterChange` hook mirrors each CMS write into `public.*` inside the same
transaction. Two things can still cause divergence: a sync hook that silently
failed (or ran with `SERVICE_SYNC_ENABLED=false`), and a direct DB edit against
`public.*` that bypassed the CMS. This job is the safety net that surfaces both
instead of letting stale prices or durations reach the booking engine.

**Detect only, never repair:** the job is read-only (Requirement 17.5) — a human
reviews the report before anything is mutated. It opens no transaction and takes
no locks, so it never blocks CMS writes.

**Alerting:** the `SERVICE_DRIFT` heartbeat is pinged **only on a clean run**.
Drift — or a failed run — withholds the ping, so the BetterStack heartbeat
monitor trips and alerts. Drift itself returns HTTP 200 (it is a data condition
for a human, not a transient failure worth a QStash retry); only a genuine job
error returns 500 to earn the retry.

**Timestamp comparison uses a tolerance, never exact equality.** Payload's
`cms.*` timestamp columns are `timestamp(3)` while `public.*` keeps microseconds,
so the same logical instant can differ by a fraction of a millisecond. The
comparison allows 1 second of slack; every real sync failure is far larger.

**Schema notes:** `cms.service` stores the category relation as `category_id_id`
(Payload's field name plus the adapter's `_id` suffix) against
`public.service.category_id`, and `cms.service.duration_minutes` is the enum
`cms.enum_service_duration_minutes`, which has no direct cast to integer — the
read uses `::text::int`.

**Layering:** the row-diffing logic is a pure function in
`packages/business/src/jobs/service-drift.ts` (no I/O), the snapshot reads live in
`packages/db/src/queries/service-drift.ts`, and the route is a thin orchestrator.

---

## Job 21 — Pending-Booking Closeout

| Field | Value |
|-------|-------|
| **Type** | QStash scheduled |
| **Schedule** | Daily `30 16 * * *` UTC = 10:00 PM IST (after the 21:00 close) |
| **Endpoint** | `POST /api/jobs/pending-booking-closeout` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_PENDING_CLOSEOUT` |

**Business rule:** a booking the salon has not confirmed, rejected, or cancelled by the end of its day is closed as `no_show`. It must not sit as `pending` in the admin queue or in the customer's My Bookings.

**What it does:** one status-guarded `UPDATE booking SET status = 'no_show'` for every `pending` booking whose IST end instant (`booking_date + end_time`) is at or before now. The end-instant predicate means an early or manual run never closes an appointment that has not happened yet, and the first run also sweeps the backlog of earlier days. It publishes a best-effort realtime `status_changed` event per closed booking.

**Ordering:** runs before the daily sales report (22:30 IST) and the nightly sales summary (23:30 IST), so both count these bookings under no-shows.

**Deliberately not done:** it does not increment `customer_profile.noshow_count` (the salon never confirmed these bookings, so they must not count toward no-show tiers), sends no customer notification, and writes no `booking_status_log` row (`changed_by_id` is a NOT NULL user FK and a system transition has no acting user). Confirmed bookings are untouched: Job 18 alerts a receptionist and a human decides.

**Idempotent:** the `status = 'pending'` guard means a QStash retry matches nothing it already closed.

---

## Job 22 — Customer KPI Reconcile

| Field | Value |
|-------|-------|
| **Type** | QStash scheduled |
| **Schedule** | Daily `50 18 * * *` UTC = 12:20 AM IST |
| **Endpoint** | `POST /api/jobs/customer-stats-reconcile` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_CUSTOMER_STATS` |

**What it does:** recomputes the CRM KPIs on `customer_profile` (`total_visits`, `total_spent_paise`, `first_visit_at`, `last_visit_at`) for every customer from the source tables, writing only rows whose values changed.

**Definitions:** a visit is a `completed` booking (service, walk-in, membership session, or gems redemption); the visit instant is `booking_date + start_time` read as IST; LTV is the sum of `paid` invoice totals of every type (membership sessions are ₹0).

**Primary maintenance is in-transaction:** booking completion, membership purchase, and membership session recording each append the same recompute (`refreshCustomerStatsStatement`, `packages/db/src/queries/customer-stats.ts`) to their atomic `db.batch()`. This job is the backfill for profiles written before the KPIs were maintained and the safety net for any drift. Recompute, never increment, so retries cannot double count. `noshow_count` is not derived here: it is a manager-adjustable counter.

---

## Complete Job Inventory

| # | Job | Tool | Schedule / Trigger | External calls |
|---|-----|------|-------------------|----------------|
| 1 | Nightly sales summary | QStash | `0 18 * * *` UTC | None |
| 2 | Membership auto-expire | QStash | `30 18 * * *` UTC | None |
| 3 | Offer auto-expire | QStash | `35 18 * * *` UTC | None |
| 4 | Session cleanup | QStash | `0 21 * * 0` UTC | None |
| 5 | pprd DB sync | GitHub Actions cron | `30 19 * * *` UTC | None |
| 6 | Monthly GST summary | QStash | `30 19 1 * *` UTC | None |
| 7 | Gems auto-expire | QStash | `40 18 * * *` UTC | None |
| 8 | Appointment reminders | QStash | Every 15 min | web-push + Resend |
| 9 | Membership expiry alerts | QStash | Daily 12:30 AM IST | web-push + Resend |
| 10 | Birthday emails | QStash | Daily 9:30 AM IST | Brevo + web-push |
| 11 | Membership usage nudges | QStash | Daily randomized batch | web-push + Resend |
| 12 | Lead follow-up reminders | QStash | Daily 11:00 AM IST | web-push (the lead's branch) |
| 13 | Daily sales report | QStash | Daily 10:30 PM IST | Resend per branch; Developer summary by Resend + Slack |
| 14 | Weekly summary report | QStash | Monday 8:00 AM IST | As Job 13 |
| 15 | Gems expiry reminder | QStash | Daily 10:30 AM IST | web-push only |
| 16 | Post-service follow-up | QStash triggered | +24h after `completed` | Resend (branch review link) |
| 17 | Stale pending booking alert | QStash triggered | +2h after booking created | web-push (the booking's branch) |
| 18 | No-show check | QStash triggered | +15min after `end_time` | web-push (the booking's branch) |
| 19 | Membership expired notice | QStash triggered | +1h after `expires_at` | Resend |
| 20 | Service catalogue drift reconciliation | QStash | `45 18 * * *` UTC | None |
| 21 | Pending-booking closeout | QStash | `30 16 * * *` UTC | Ably (best-effort) |
| 22 | Customer KPI reconcile | QStash | `50 18 * * *` UTC | None |
| 23 | Missing-Manager reminder | QStash | `30 4 * * *` UTC = 10:00 AM IST | Resend (each affected Owner) |
| 24 | Realtime token revocations | QStash triggered + daily sweep `55 18 * * *` UTC | After a role change; 00:25 IST | Ably REST |
| 25 | Settlement close | QStash | `0 19 * * *` UTC = 12:30 AM IST | None |
| 26 | Staff overrun check | QStash | `*/15 2-16 * * *` UTC = every 15 min, 07:30 AM–10:15 PM IST | web-push (the booking's branch) |

**Total: 26 jobs — 21 QStash scheduled (Job 24's daily sweep included) + 4 QStash triggered + 1 GitHub Actions cron (Job 5).** Job 24 is also queued by role changes.

The invoice PDF render (`/api/jobs/invoice-pdf`) is a fifth QStash-triggered route, enqueued at booking completion; it is part of the synchronous invoice flow rather than a numbered job.

---

## Job 23 — Missing-Manager Reminder (multi-branch R1.9)

| Field | Value |
|-------|-------|
| **Schedule** | Daily `30 4 * * *` UTC = 10:00 AM IST |
| **Endpoint** | `POST /api/jobs/missing-manager-reminder` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_MISSING_MANAGER` |

**What it does:** Finds every operational branch without a Manager and emails its Owner, one `branch_manager_missing` notification per Owner per IST day naming all their branches ("Marathahalli has no Manager", or "2 branches have no Manager"). A branch drops out as soon as it has a Manager or stops being operational, so the reminders stop by themselves. The admin dashboard shows the same condition as a banner at that branch, with an "Assign a Manager" link for the Owner and the Developer (the people who can assign one, R1.5).

---

## Job 24 — Realtime Token Revocations (multi-branch R2.6)

| Field | Value |
|-------|-------|
| **Trigger** | A role or branch change that takes away someone's admin access (queued with a delay) |
| **Sweep** | Daily `55 18 * * *` UTC = 12:25 AM IST |
| **Endpoint** | `POST /api/jobs/realtime-revocations` |

**What it does:** Works through the `realtime_revocation` outbox the role change wrote in its own transaction: confirms the revocation with Ably after the TokenRequest window, retries failed calls (500 → QStash backoff), and closes rows older than the token lifetime as `expired`. The daily sweep closes anything a failed enqueue left pending, at one message a day. See [Ably channels](./ably-channels.md#revocation-after-a-role-change-r26).

---

## Job 25 — Settlement Close (multi-branch R10)

| Field | Value |
|-------|-------|
| **Schedule** | Daily `0 19 * * *` UTC = 12:30 AM IST |
| **Endpoint** | `POST /api/jobs/settlement-close` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_SETTLEMENT_CLOSE` |

**What it does (`closeSettlementMonths` in `packages/db/src/queries/settlement.ts`):** closes every ended IST month not closed yet. For each, one statement (`branch_settlement`) per pair of branches with entries that month: what each owes the other for membership sessions and for gems, and the net, so only the difference is paid. Then each branch's net position across its counterparts (`settlement_position`); a month's positions add up to zero. Answers `{ months: [{ month, statements }] }`. See [settlement.md](../.kiro/specs/multi-branch-support/settlement.md).

**Why daily:** a missed run catches up the next night; on most days no month has just ended and nothing changes.

**Safe to repeat:** one transaction marks the months closed first, which waits for any entry still being recorded into them (entries take a share lock on their month), so the statements see every entry. Only the transaction that closed a month can insert its statements and positions, so a QStash retry or a concurrent run closes nothing twice. An entry recorded after its month closed goes to the next open month. A failure answers 500 for QStash to retry, without the heartbeat.

---

## Job 26 — Staff Overrun Check (membership-scheduling.md slice 2b, MS-08)

| Field | Value |
|-------|-------|
| **Type** | QStash scheduled |
| **Schedule** | `*/15 2-16 * * *` UTC = every 15 minutes, 07:30 AM–10:15 PM IST (60 runs a day) |
| **Endpoint** | `POST /api/jobs/staff-overrun-check` |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_STAFF_OVERRUN` |

**What it does (`raiseStaffOverruns` in `apps/admin/src/lib/jobs/staff-overrun.ts`):** finds confirmed bookings due within 15 minutes whose person is still with another customer and is expected to start them more than 10 minutes late (`flagStaffOverruns` in `packages/db/src/queries/staff-occupancy.ts`). "Expected" is the earlier work's actual start plus its planned length, and at least now; a SPA booking clashes with any work, two salon bookings don't. Each such booking gets open reassignment work with reason `overrun`, keeping its assignee, so the dashboard and the bookings list show it as "Held up". Then it tells each held-up booking's branch front desk (its Receptionist, and its Manager or, without one, its Owner) with a `staff_overrun` push: "Asha is still with another customer, so the 11:00 booking at Rayasandra on 31/10/2026 can't start yet. Wait for them or assign someone else. Free then: Lata, Manish." The names are up to three people free for the booking's slot who may do that kind of work: Therapists for SPA, Stylists for salon, the Manager or Receptionist for either; those who perform its services first.

**Why it alerts and never acts:** the database already refuses the held-up booking's start until the earlier work completes (`staff_work`, 0028), whatever reached reception. Reception waits or assigns someone else; nothing is moved, started or reassigned by the job. A suggestion is not a lock: assigning rechecks leave, the branch and the person's other bookings in the write.

**How a flag ends:** starting the booking closes it as `started` (trigger `booking_reassignment_close_on_start`, 0030); assigning someone closes it as `reassigned`; moving the booking or ending it closes it as `booking_ended`.

**Safe to repeat:** one open flag per booking (`booking_reassignment_open_uidx`), and the flagging statement locks the bookings it flags, so a booking started meanwhile isn't flagged. One notification per person per booking: each run tells only the people not yet told, so a failed alert is retried by the next run. A refused start (`POST /api/bookings/[id]/start`, 409 `STAFF_BUSY`) runs the same check for that booking once it is due, so a hold-up outside the job's hours is flagged too. A failure answers 500 for QStash to retry, without the heartbeat.

---

## Env Vars (jobs-specific)

```
# Daily/Weekly reports: the Developer's summary across branches. The channel
# must be one only the Developer reads.
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
# Missing-Manager reminder heartbeat
BETTER_STACK_HEARTBEAT_MISSING_MANAGER=
# Settlement close heartbeat
BETTER_STACK_HEARTBEAT_SETTLEMENT_CLOSE=
# Staff overrun check heartbeat (every 15 minutes in the salon day)
BETTER_STACK_HEARTBEAT_STAFF_OVERRUN=
```

`DAILY_REPORT_EMAIL_RECIPIENTS` is retired: report recipients come from branch roles (each branch's Owner and Manager; the Developer for the summary). See [environment-variables.md](./environment-variables.md).
