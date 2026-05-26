# Background Jobs — pg_cron & QStash

## Overview

Royal Glow uses two complementary tools for all scheduled and event-driven background work:

| Tool | Runs inside | Use for | Free tier |
|------|------------|---------|-----------|
| **pg_cron** | Neon PostgreSQL | Pure SQL — bulk scans, aggregations, status updates | Unlimited |
| **QStash** | Upstash HTTP queue | Anything requiring HTTP calls — email, push, Slack, webhooks | 500 messages/day |

**Split rule:** If the job only touches the database → pg_cron. If the job needs to call Resend, web-push, Slack, Ably, or any external service → QStash.

**All QStash jobs call Next.js API routes** (`POST /api/jobs/...`) which perform DB reads and external service calls. QStash automatically retries on non-2xx responses with exponential backoff (up to 3 retries by default).

**All jobs ping a BetterStack heartbeat URL on success** — silent failure is detected and alerted. See [observability.md](./observability.md) for heartbeat monitor configuration.

---

## Invoice Email — Not a Job

The customer invoice email is **synchronous** — fired immediately within the API request when the receptionist marks payment received. No cron, no queue.

```
Receptionist clicks "Generate Invoice"
    → POST /api/admin/bookings/:id/complete
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
    → POST /api/admin/bookings/:id/complete
    → DB: gems earned, loyalty_transaction inserted with expires_at = created_at + 30 days
    → web-push sent immediately: "You earned X gems! Use them within 30 days."
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

Jobs 1-4 and 6 run via `pg_cron` inside Neon DB. Job 5 (`Preprod DB Sync`) runs via GitHub Actions cron, then applies SQL anonymisation on the target Neon branch.

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

**What it does:** Flips `spa_membership.status` from `active` to `expired` for all memberships whose `expires_at` has passed.

**Why:** A customer's membership expires at 11:59 PM. At midnight their status flips automatically. If they try to book an SPA session the next day, the system correctly shows them as non-member. No manual intervention.

```sql
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

### Job 5 — Preprod DB Sync

| Field | Value |
|-------|-------|
| **Type** | GitHub Actions cron + SQL anonymisation |
| **Schedule** | `30 19 * * *` UTC = 1:00 AM IST |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_PREPROD_SYNC` |

**What it does:** Resets the `preprod` Neon branch from `main`, then anonymises copied customer data so UAT has realistic records without exposing real PII.

**Why:** Pre-production validation needs realistic booking patterns, scheduling edge cases, and membership scenarios. It must never expose real customer phone numbers or emails.

```sql
-- Run on preprod branch after data copy:
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
| **Schedule** | `30 19 1 * *` UTC = 1:00 AM IST on the 1st of every month |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_NIGHTLY_SALES` (shared) |

**What it does:** Aggregates the previous month's GST into a `monthly_gst_summary` table — total taxable value, total GST collected (18%), invoice count, SAC code 999721.

**Why:** GSTIN `XXAAACR1234X1ZX` means quarterly GST filing is mandatory. Owner or CA needs total GST collected per month. Pre-aggregated table eliminates recomputation at filing time.

```sql
INSERT INTO monthly_gst_summary (month, taxable_value_paise, gst_amount_paise, invoice_count, sac_code)
SELECT
  DATE_TRUNC('month', NOW()) - INTERVAL '1 month',
  SUM(i.taxable_value_paise),
  SUM(i.gst_amount_paise),
  COUNT(*),
  '999721'
FROM invoice
WHERE invoice_type IN ('service', 'membership_purchase')
  AND payment_status = 'paid'
  AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()) - INTERVAL '1 month';
```

---

### Job 7 — Gems Auto-Expire

| Field | Value |
|-------|-------|
| **Type** | pg_cron |
| **Schedule** | `40 18 * * *` UTC = 12:10 AM IST |
| **Heartbeat** | `BETTER_STACK_HEARTBEAT_NIGHTLY_SALES` (shared) |

**What it does:** Finds all `loyalty_transaction` rows where `type = 'earned'`, `expires_at < NOW()`, and `gems_amount > 0` with no corresponding `expired` row already created for them. For each, inserts a new `expired` transaction deducting the gems and updates `loyalty_account.gems_balance`.

```sql
-- Find earned transactions that have expired and not yet been offset
SELECT lt.id, lt.loyalty_account_id, lt.gems_amount
FROM loyalty_transaction lt
WHERE lt.type = 'earned'
  AND lt.expires_at < NOW()
  AND NOT EXISTS (
    SELECT 1 FROM loyalty_transaction lt2
    WHERE lt2.type = 'expired'
      AND lt2.description = 'expired:' || lt.id
  );

-- For each: insert expiry row + update balance
INSERT INTO loyalty_transaction (id, loyalty_account_id, type, gems_amount, description, created_at)
VALUES (gen_id(), :account_id, 'expired', -:gems_amount, 'expired:' || :earned_tx_id, NOW());

UPDATE loyalty_account
SET gems_balance = gems_balance - :gems_amount, updated_at = NOW()
WHERE id = :account_id;
```

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
| **Schedule** | Daily `0 5 * * *` UTC = 10:30 AM IST |
| **Endpoint** | `POST /api/jobs/lead-followups` |

**What it does:** Finds leads with `status = 'follow_up'` and `last_contacted_at` older than 48 hours. Sends a push notification to the assigned receptionist.

**Receptionist sees:** "Lead 'Priya Sharma' needs follow-up. Last contacted 2 days ago."

---

### Job 13 — Daily Sales Report

| Field | Value |
|-------|-------|
| **Schedule** | Daily `0 17 * * *` UTC = 10:30 PM IST |
| **Endpoint** | `POST /api/jobs/daily-sales-report` |
| **Recipients** | Owner + Manager + Developer — Slack + email (Resend) |

**What it does:** Queries today's invoices and booking data, formats the report, posts to Slack via webhook, and emails via Resend to `DAILY_REPORT_EMAIL_RECIPIENTS`.

**Report format:**
```
📊 Royal Glow — Daily Sales Report
Date: DD/MM/YYYY (Weekday)
─────────────────────────────────────

🛎️ Services Performed
   8x Haircut                     ₹6,000
   4x Anti-Dandruff Treatment    ₹11,000
   3x Aroma Therapy               ₹7,500
   2x Deep Tissue Massage         ₹5,000
   1x Bridal Makeup               ₹4,500
   ── sorted by revenue, highest first ──

💰 Revenue
   Salon services:        ₹20,400
   SPA services:          ₹16,000
   Membership purchases:  ₹15,000
   Total collected:       ₹51,400

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

**Services breakdown query:**
```sql
SELECT COALESCE(s.name, ii.service_name_snapshot) AS service_name,
       COUNT(ii.id) AS qty,
       SUM(ii.total_price_paise) AS revenue_paise
FROM invoice_item ii
JOIN invoice i ON ii.invoice_id = i.id
LEFT JOIN service s ON ii.service_id = s.id
WHERE DATE(i.created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE
  AND i.payment_status = 'paid'
GROUP BY COALESCE(s.name, ii.service_name_snapshot)
ORDER BY revenue_paise DESC;
```

**New env vars required:**
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
DAILY_REPORT_EMAIL_RECIPIENTS=owner@theroyalglow.in,manager@theroyalglow.in
```

---

### Job 14 — Weekly Summary Report

| Field | Value |
|-------|-------|
| **Schedule** | Weekly `30 3 * * 1` UTC = Monday 9:00 AM IST |
| **Endpoint** | `POST /api/jobs/weekly-report` |
| **Recipients** | Owner + Manager + Developer — Slack + email |

**What it does:** Same format as the daily report but covers the last 7 days. Adds week-over-week revenue comparison (this week vs last week). Helps owner and manager identify trends and plan staffing.

---

### Job 15 — Gems Expiry Reminder

| Field | Value |
|-------|-------|
| **Type** | QStash scheduled |
| **Schedule** | Daily `0 5 * * *` UTC = 10:30 AM IST |
| **Endpoint** | `POST /api/jobs/gems-expiry-reminder` |

**What it does:** Finds customers who have `earned` gems transactions expiring in exactly 7 days. Sends a **push notification only** (no email per design). Groups by customer so a customer with multiple expiring batches gets one combined notification.

```sql
SELECT la.customer_id, SUM(lt.gems_amount) AS expiring_gems, lt.expires_at
FROM loyalty_transaction lt
JOIN loyalty_account la ON lt.loyalty_account_id = la.id
WHERE lt.type = 'earned'
  AND DATE(lt.expires_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE + INTERVAL '7 days'
GROUP BY la.customer_id, lt.expires_at;
```

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

**What it does:** 24 hours after a service is completed, sends a post-service follow-up email via Brevo with a direct Google Maps review link and thank-you offer. Only fires if `marketing_consent = true`.

**Why 24h delay:** The visit is still fresh in the customer's mind, but the ask is no longer happening at the counter. That gives enough breathing room without waiting so long that response intent drops.

**Customer receives:** "How was your [Service] at Royal Glow? Help us grow — leave a review: [Google Maps link]"

---

### Job 17 — Stale Pending Booking Alert

| Field | Value |
|-------|-------|
| **Trigger** | Booking created with `status = 'pending'` |
| **Delay** | +2 hours |
| **Endpoint** | `POST /api/jobs/stale-booking-alert` |

**What it does:** If a booking is still `pending` 2 hours after creation, sends a push notification to ALL receptionists and the manager.

**Why:** Receptionist gets busy and misses a new booking request. Customer is left waiting and confused. This ensures no booking falls through the cracks.

**Receptionist sees:** "⚠️ Booking from Priya Sharma (3:00 PM today) has been pending for 2 hours — review now."

**If still pending after 24 hours:** Auto-reject with apology push + email to customer: "We're sorry — your booking request could not be confirmed. Please book again or call us at +91 63601 35720."

---

### Job 18 — No-Show Check

| Field | Value |
|-------|-------|
| **Trigger** | Booking `end_time` reached |
| **Delay** | +15 minutes after `end_time` |
| **Endpoint** | `POST /api/jobs/noshow-check` |

**What it does:** Checks if the booking status is still `confirmed` 15 minutes after the scheduled end time. If yes — it likely means the customer didn't show up and the receptionist hasn't marked it. Sends a push notification to receptionists.

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

## Complete Job Inventory

| # | Job | Tool | Schedule / Trigger | External calls |
|---|-----|------|-------------------|----------------|
| 1 | Nightly sales summary | pg_cron | `0 18 * * *` UTC | None |
| 2 | Membership auto-expire | pg_cron | `30 18 * * *` UTC | None |
| 3 | Offer auto-expire | pg_cron | `35 18 * * *` UTC | None |
| 4 | Session cleanup | pg_cron | `0 21 * * 0` UTC | None |
| 5 | Preprod DB sync | GitHub Actions cron | `30 19 * * *` UTC | None |
| 6 | Monthly GST summary | pg_cron | `30 19 1 * *` UTC | None |
| 7 | Gems auto-expire | pg_cron | `40 18 * * *` UTC | None |
| 8 | Appointment reminders | QStash | Every 15 min | web-push + Resend |
| 9 | Membership expiry alerts | QStash | Daily 12:30 AM IST | web-push + Resend |
| 10 | Birthday emails | QStash | Daily 9:30 AM IST | Brevo + web-push |
| 11 | Membership usage nudges | QStash | Daily randomized batch | web-push + Resend |
| 12 | Lead follow-up reminders | QStash | Daily 10:30 AM IST | web-push |
| 13 | Daily sales report | QStash | Daily 10:30 PM IST | Slack webhook + Resend |
| 14 | Weekly summary report | QStash | Monday 9:00 AM IST | Slack webhook + Resend |
| 15 | Gems expiry reminder | QStash | Daily 10:30 AM IST | web-push only |
| 16 | Post-service follow-up | QStash triggered | +24h after `completed` | Brevo |
| 17 | Stale pending booking alert | QStash triggered | +2h after booking created | web-push |
| 18 | No-show check | QStash triggered | +15min after `end_time` | web-push |
| 19 | Membership expired notice | QStash triggered | +1h after `expires_at` | Resend |

**Total: 19 jobs — 7 pg_cron + 8 QStash scheduled + 4 QStash triggered**

---


---

## New Env Vars (jobs-specific)

```
# Daily/Weekly reports
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
DAILY_REPORT_EMAIL_RECIPIENTS=owner@theroyalglow.in,manager@theroyalglow.in
```

> Add these to [environment-variables.md](./environment-variables.md) before launch.
