# Design Document — Phase 6: Background Jobs & Automation

## Overview

Phase 6 delivers the automation layer that runs the platform without manual intervention: the 19 background jobs from `background-jobs.md`. It also fills the notification *delivery* seam left open in Phase 5, so notifications actually go out via Web Push and email once provider keys are configured.

The jobs split across two runtimes per the project's rule:

- **pg_cron (7 jobs, jobs 1–7)** — pure SQL that only touches the database (sales/GST aggregation, status sweeps, cleanup, gems expiry). These are delivered as **idempotent SQL functions** plus a single migration that registers the `cron.schedule(...)` entries in Neon. Equivalent **query-layer functions** are also provided so the logic is callable/testable from TypeScript and re-runnable on demand.
- **QStash (12 jobs, jobs 8–19)** — anything needing an HTTP/external call (push, email, Slack). Each is a Next.js API route under `/api/jobs/...` that verifies the QStash signature, performs DB reads, and calls the relevant external service. Scheduled jobs (8–15) are registered with QStash schedules; triggered jobs (16–19) are enqueued with a delay by the business event that fires them.

Consistent with Phases 4–5, **all external sends are behind guarded extension points** (`process.env` checks). With no keys configured, every job route runs its DB logic, logs what it *would* send, pings its heartbeat, and returns `200` — so the entire phase is buildable, typechecks, and runs today. When keys land, the same routes deliver for real with no structural change.

### Goals

- Implement the 7 pg_cron SQL jobs as idempotent SQL + TS query equivalents, registered via a migration.
- Implement the 12 QStash job routes (8 scheduled + 4 triggered) with signature verification, idempotent DB reads, and guarded external sends.
- Implement the real notification delivery layer (`webpush` + `email` providers) behind the existing `dispatchNotification` seam.
- Provide a job-enqueue helper so booking/membership events can schedule the 4 triggered jobs (post-service, stale-pending, no-show, membership-expired).
- Ping a BetterStack heartbeat per job (guarded), and harden every job route against double-execution (idempotency via `notification` log rows / `expired:` transaction markers / summary unique constraints).
- Add the small set of jobs-specific env vars (`SLACK_WEBHOOK_URL`, `DAILY_REPORT_EMAIL_RECIPIENTS`, `BETTER_STACK_HEARTBEAT_*`) to `env.ts` as optional.

### Non-Goals

- **Provisioning the actual QStash schedules / Neon pg_cron in production** — this phase ships the SQL migration file and a documented `qstash-schedules` setup script/manifest, but registering them against the live Upstash account and Neon `prod` branch is a deploy-time operation the user performs with their keys. The routes and SQL are complete and correct; wiring them to the live scheduler is an ops step.
- **Brevo marketing automation** (re-engagement) — handled inside Brevo, not a job (per design doc).
- **Job 5 (pprd DB sync)** GitHub Actions workflow — the anonymisation SQL is provided, but the CI workflow YAML belongs to Phase 9 (CI/CD). This phase delivers the SQL.
- **PDF invoice generation internals** — the invoice email job references the existing invoice; PDF rendering is its own concern (billing phase) and is treated as an extension point.
- **Real-time Ably publishing** remains a Phase-deferred extension point (started in Phase 5).

## Architecture

### Layer Boundaries

```
packages/business/src/jobs/            ← pure helpers: report formatting, window math, idempotency keys
packages/db/src/queries/jobs.ts        ← all job DB reads/writes (pg_cron TS equivalents + QStash data)
packages/db/migrations/0001_pg_cron_jobs.sql  ← SQL functions + cron.schedule registrations (jobs 1–7)
apps/web/src/lib/jobs/verify.ts        ← QStash signature verification (guarded)
apps/web/src/lib/jobs/heartbeat.ts     ← BetterStack heartbeat ping (guarded)
apps/web/src/lib/jobs/enqueue.ts       ← QStash publish helper for triggered jobs (guarded)
apps/web/src/lib/notifications/providers/webpush.ts  ← web-push send (guarded)
apps/web/src/lib/notifications/providers/email.ts    ← Resend send (guarded)
apps/web/src/lib/notifications/dispatch.ts           ← now calls the two providers (Phase 5 seam, filled)
apps/web/src/lib/reports/slack.ts      ← Slack webhook post (guarded)
apps/web/src/app/api/jobs/{job}/route.ts             ← 12 QStash job endpoints
```

Rules hold: job routes are thin orchestrators (verify → query → send → heartbeat → 200); business logic is pure; DB access in `packages/db/queries`; integer paise; IST handling for date windows; `db.batch()` for multi-row writes.

### QStash job route shape

```typescript
export const POST = async (req: Request) => {
  // 1. Verify the request actually came from QStash (guarded: if no signing key,
  //    only allow in non-production OR require an internal token).
  const verified = await verifyQStashSignature(req)
  if (!verified) return new Response('Unauthorized', { status: 401 })

  try {
    // 2. DB reads + idempotent work + guarded external sends.
    const result = await runAppointmentReminders()
    // 3. Heartbeat (guarded no-op without the URL).
    await pingHeartbeat('REMINDERS')
    return Response.json({ success: true, ...result })
  } catch (error) {
    // Non-2xx → QStash retries with backoff. Log + rethrow as 500.
    console.error('[job:appointment-reminders]', error)
    return new Response('Job failed', { status: 500 })
  }
}
```

> Job routes deliberately do NOT use `withErrorHandler`/`apiSuccess` (which target the customer/admin API envelope). They use a minimal job-response shape and return non-2xx on failure so QStash's retry semantics work.

### Notification delivery (filling the Phase 5 seam)

```
createNotification(row)            ← persists (Phase 5, unchanged)
  → dispatchNotification(row)      ← Phase 5 seam, now implemented:
       ├─ channel 'push' → sendWebPush(subscriptions, payload)   (guarded by WEB_PUSH_PRIVATE_KEY + VAPID)
       └─ channel 'email' → sendEmail(to, template, data)        (guarded by RESEND_API_KEY)
     marks notification.status 'sent' | 'failed' + sentAt
```

`dispatchNotification` keeps its never-throw contract: a provider failure logs, sets `status='failed'`, and returns — it never breaks the calling request/job.

## Components and Interfaces

### 1. pg_cron jobs (1–7) — SQL + TS equivalents

#### 1.1 Migration — `packages/db/migrations/0001_pg_cron_jobs.sql`

Defines an idempotent SQL function per job and registers each with `cron.schedule`. Functions are `CREATE OR REPLACE` so the migration is re-runnable. Example:

```sql
CREATE OR REPLACE FUNCTION job_membership_auto_expire() RETURNS void AS $$
  UPDATE spa_membership SET status = 'expired', updated_at = NOW()
  WHERE status = 'active' AND expires_at < NOW();
$$ LANGUAGE sql;

SELECT cron.schedule('membership-auto-expire', '30 18 * * *', $$ SELECT job_membership_auto_expire(); $$);
```

Jobs 1, 2, 3, 4, 6, 7 follow the SQL in `background-jobs.md`. (Job 5 is the anonymisation SQL only — not scheduled here.)

> **Schema note:** Job 1's SQL in the doc references `daily_sales_summary` columns `salon_revenue_paise` / `spa_revenue_paise` / `membership_revenue_paise`, but the actual table (Phase 1) has `total_revenue_paise`, `cash/upi/card/online_revenue_paise`, etc. The migration maps to the **real** columns: salon/spa split is computed but stored in `total_revenue_paise` plus the existing payment-method splits; an additive nullable `salon_revenue_paise`/`spa_revenue_paise`/`membership_revenue_paise` set of columns is added to `daily_sales_summary` (one small additive migration) so the report job and `/admin/reports` can show the split. This is the **only** schema change in Phase 6.

#### 1.2 TS equivalents — `packages/db/src/queries/jobs.ts`

So the same logic is callable from a manual "run now" admin action and unit-reasoned:

```typescript
expireMemberships(now?): Promise<number>          // returns rows affected
expireOffers(now?): Promise<number>
expireGems(now?): Promise<{ accountsAffected: number; gemsExpired: number }>
buildDailySalesSummary(dateISO): Promise<DailySalesSummary>   // upsert on (date, branch) unique
buildMonthlyGstSummary(monthISO): Promise<MonthlyGstSummary>  // upsert on month unique
cleanupExpiredSessions(now?): Promise<number>
```

### 2. QStash scheduled jobs (8–15)

| # | Route | Reads | Sends (guarded) | Idempotency |
|---|-------|-------|------|-------------|
| 8 | `/api/jobs/appointment-reminders` | confirmed bookings in 24h/1h window w/o matching `notification` | push + email | writes `reminder_24h`/`reminder_1h` notification row |
| 9 | `/api/jobs/membership-expiry` | active memberships expiring in 30/7/1 days | push + email | `membership_expiry_*` notification row |
| 10 | `/api/jobs/birthday-emails` | customers whose DOB = today, `marketing_consent` | email + push | `birthday_offer` notification row (one per day) |
| 11 | `/api/jobs/membership-usage-nudges` | random eligible active members w/ unused hours, not nudged recently | push + email | `membership_usage_nudge` notification row (recency window) |
| 12 | `/api/jobs/lead-followups` | leads `follow_up` w/ `lastContactedAt` > 48h | push to assignee | `lead_follow_up_due` notification row |
| 13 | `/api/jobs/daily-sales-report` | today's invoices/bookings (services breakdown) | Slack + email | n/a (report) |
| 14 | `/api/jobs/weekly-report` | last 7 days + WoW comparison | Slack + email | n/a (report) |
| 15 | `/api/jobs/gems-expiry-reminder` | earned gems expiring in exactly 7 days, grouped by customer | push only | `gems_expiry_7d` notification row |

Each route: `verifyQStashSignature` → query → `buildNotificationContent` (Phase 5) → `dispatchNotification` per recipient → heartbeat → `200 { processed: N }`.

### 3. QStash triggered jobs (16–19)

Enqueued with a delay by the originating event via `enqueueJob(route, payload, delaySeconds)`:

| # | Route | Enqueued by | Delay | Action |
|---|-------|-------------|-------|--------|
| 16 | `/api/jobs/post-service-followup` | booking completion (Phase 3 route) | +24h | Brevo/email review request if `marketing_consent` |
| 17 | `/api/jobs/stale-booking-alert` | booking creation (pending) | +2h | push to receptionists if still pending; auto-reject + notify if >24h |
| 18 | `/api/jobs/noshow-check` | booking confirmation | +15m after `endTime` | push to receptionists if still `confirmed` past end |
| 19 | `/api/jobs/membership-expired-notice` | membership creation | +1h after `expiresAt` | final renewal email |

The enqueue calls are added at the existing event sites (booking complete/create, membership create) as **guarded best-effort** calls — if `QSTASH_TOKEN` is absent, `enqueueJob` no-ops and logs, so core flows never depend on QStash being live.

### 4. Shared job libraries

```typescript
// apps/web/src/lib/jobs/verify.ts
verifyQStashSignature(req): Promise<boolean>
//   Uses @upstash/qstash Receiver with QSTASH_CURRENT/NEXT_SIGNING_KEY when present.
//   When absent: allow only if an x-internal-job-token header matches an env secret,
//   else (dev) allow with a warning. Documented clearly.

// apps/web/src/lib/jobs/heartbeat.ts
pingHeartbeat(name): Promise<void>   // GET the BETTER_STACK_HEARTBEAT_<NAME> URL if set; else no-op

// apps/web/src/lib/jobs/enqueue.ts
enqueueJob(path, body, delaySeconds): Promise<void>
//   Publishes to QStash with a delay when QSTASH_TOKEN present; else logs + no-op.
```

### 5. Notification providers (filling the seam)

```typescript
// apps/web/src/lib/notifications/providers/webpush.ts
sendWebPush(subscriptions, payload): Promise<{ sent: number; failed: number }>
//   web-push with VAPID keys when present; prunes 410/404 (gone) subscriptions; else no-op.

// apps/web/src/lib/notifications/providers/email.ts
sendEmail({ to, subject, html }): Promise<boolean>
//   Resend when RESEND_API_KEY present; else log + return false.
```

`dispatchNotification` is updated to resolve the recipient's active push subscriptions (`getActivePushSubscriptions`) and/or email, call the providers, and update the notification row's `status`/`sentAt`.

## Data Models

All tables exist. The one additive change:

- `daily_sales_summary`: add nullable `salon_revenue_paise`, `spa_revenue_paise`, `membership_revenue_paise` (integer) so the sales summary job stores the service-type split the daily report needs. Additive, backward-compatible; pushed via `drizzle-kit push` (and mirrored in the pg_cron migration).

Touch summary:

| Job group | Reads | Writes |
|-----------|-------|--------|
| pg_cron 1,6 | invoice, booking | daily_sales_summary, monthly_gst_summary |
| pg_cron 2,3,7 | spa_membership, offer, loyalty_transaction/account | same (status/expiry updates) |
| pg_cron 4 | session | session (delete) |
| QStash 8,9,11,15,16,19 | booking, spa_membership, loyalty_transaction, customer_profile, push_subscription | notification |
| QStash 10,12,13,14,17,18 | customer_profile, lead, invoice, booking, user | notification |

## Money, Date & Currency Conventions

- All money integer paise. Report figures formatted with `formatINR` at the presentation/Slack-message boundary only.
- Date windows computed in **IST** (the salon's timezone): "today", "expiring in 7 days", "DOB = today (month+day)", and the 24h/1h reminder windows all normalise to `Asia/Kolkata` calendar boundaries. A pure `packages/business/src/jobs/time.ts` helper centralises IST window math so it is testable.
- pg_cron schedules are expressed in UTC (Neon runs UTC) per the doc's cron expressions.

## Error Handling

- **Job routes** return `200` on success, `401` on failed signature verification, `500` on internal failure (so QStash retries). They do not use the customer `AppError` envelope.
- **External sends never break a job**: a provider error is caught, logged, the notification row marked `failed`, and the job continues to the next recipient. The job still returns `200` if the batch as a whole completed (partial failures are logged + counted).
- **Idempotency**: every notification-sending job checks for an existing matching `notification` row (by user + type + booking/period) before sending, so a re-run or QStash retry does not double-send. Gems expiry uses the `expired:<txId>` description marker. Summaries use the table unique constraints (`upsert`/`ON CONFLICT DO UPDATE`).
- No new error codes needed.

## Security Considerations

- **QStash signature verification** on every job route — the routes are public URLs, so they MUST reject requests without a valid QStash signature (or the internal job token fallback). This is the primary security control for the phase.
- Heartbeat/Slack/QStash URLs and tokens are read from `process.env` (guarded), never echoed in responses.
- Job routes expose no PII in their JSON responses (only counts).
- Web Push payloads contain only the notification title/body already shown in-app — no extra PII.
- The auto-reject path (job 17, >24h pending) changes booking state; it is guarded to only act on still-`pending` bookings and records a status-log entry + customer notification.

## Testing Strategy

Per coding standards, no test files committed unless requested. Verification per task:
- **Pure helpers** (`packages/business/src/jobs/*`: IST window math, report formatting, idempotency-key builders, WoW math) — deterministic, strongest PBT targets.
- **Query layer** — typecheck against live schema; idempotent upserts reviewed; `db.batch()` atomic paths checked.
- **Job routes** — typecheck with `SKIP_ENV_VALIDATION=1`; signature-verification guard reasoned through; the no-keys path returns 200 with counts.
- **SQL migration** — reviewed for idempotency (`CREATE OR REPLACE`, `ON CONFLICT`); not executed against prod here.
- **Whole phase** — `SKIP_ENV_VALIDATION=1 bun run typecheck` and `bun run lint` (Biome) must pass.

## Design Decisions & Rationale

1. **All external integrations are guarded extension points.** Keys (`QSTASH_*`, `WEB_PUSH_PRIVATE_KEY`, VAPID, `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`, heartbeats) are empty in `.env.local`. Reading them from `process.env` behind truthy guards lets the whole phase build, typecheck, and run — every job executes its DB logic and logs intended sends. Real delivery activates when keys land, no code change. This is the established Phases 4–5 pattern, now applied to the whole automation layer.
2. **pg_cron jobs ship as SQL migration + TS equivalents.** The SQL is the production runtime (registered in Neon). The TS query equivalents make the same logic invocable on demand (e.g. a future "rebuild summary" admin action) and reviewable in the typed codebase. Belt and suspenders, no duplication of truth (both are thin over the same tables).
3. **QStash routes are not provisioned here.** Registering schedules against the live Upstash account is a deploy step requiring the user's token. The phase delivers correct, verified routes + a documented schedule manifest; provisioning is ops. This keeps the phase self-contained and avoids coupling the build to an external account.
4. **One additive migration** (`daily_sales_summary` service-split columns) reconciles the doc's Job 1 SQL with the real Phase 1 schema. Nullable + backward-compatible.
5. **Triggered-job enqueues are best-effort at the event site.** Adding `enqueueJob(...)` to booking-complete/create and membership-create as guarded no-op-without-keys calls means the core transactional flows never gain a hard dependency on QStash.
6. **Notification delivery fills the existing seam, not a rewrite.** `dispatchNotification` keeps its signature and never-throw contract; only its body gains the guarded provider calls. Phase 5 callers are unaffected.
7. **Signature verification is mandatory and the security backbone.** Because job routes are public, the QStash `Receiver` (or internal-token fallback) is the gate. Documented prominently so production never runs them open.

## Correctness Properties

### Property 1: Membership expiry sweep is exact and idempotent
`expireMemberships(now)` transitions to `expired` exactly the `spa_membership` rows with `status='active' AND expires_at < now`; a second immediate run affects zero additional rows.
**Validates: Requirements 1.2, 1.6**

### Property 2: Offer expiry sweep is exact and idempotent
`expireOffers(now)` deactivates exactly the offers with `is_active=true AND end_date < now`; re-running affects zero further rows.
**Validates: Requirements 1.3, 1.6**

### Property 3: Gems expiry conserves balance
For each expired earned transaction, `expireGems` inserts exactly one offsetting `expired` row (`-gems_amount`) marked `expired:<txId>` and decrements `loyalty_account.gems_balance` by the same amount; an already-offset transaction is never offset twice.
**Validates: Requirements 1.4, 1.6**

### Property 4: Daily/monthly summaries are upserts
`buildDailySalesSummary(date)` and `buildMonthlyGstSummary(month)` are idempotent: running twice for the same period yields one row with identical totals (via the `(date,branch)` / `month` unique constraints), and totals equal the sum of the matching paid invoices.
**Validates: Requirements 1.1, 1.5, 1.6**

### Property 5: IST window membership tiers are exact
The membership-expiry job selects a membership for the 30/7/1-day tier iff its `expires_at`, in IST calendar days, is exactly 30, 7, or 1 day from today; no membership appears in two tiers on the same run.
**Validates: Requirements 2.2**

### Property 6: Reminder idempotency
The appointment-reminder job sends a `reminder_24h`/`reminder_1h` notification for a booking at most once: a matching `notification` row for that booking+type suppresses re-sending on any later run or retry.
**Validates: Requirements 2.1, 2.6**

### Property 7: Notification self-targeting
Every notification a job creates has its `userId` set to the intended recipient (the booking's customer, the membership's customer, the lead's assignee, or each receptionist) — a job never sends a customer notification to another customer.
**Validates: Requirements 2.3, 3.3**

### Property 8: Signature verification gate
A job route returns `401` when QStash signature verification fails and the internal-token fallback is absent; it proceeds to its work only when verification passes (or the documented dev/internal-token path is satisfied).
**Validates: Requirements 4.1, 4.2**

### Property 9: External sends never break a job
`dispatchNotification` and the provider helpers never throw to their caller: a provider error results in a logged failure and `status='failed'`, and the job continues and still reports success for the completed batch.
**Validates: Requirements 3.2, 4.3**

### Property 10: Heartbeat and enqueue are no-ops without config
`pingHeartbeat`, `enqueueJob`, `sendWebPush`, `sendEmail`, and the Slack poster all no-op (log, return a benign value) when their respective env keys are absent, and never throw.
**Validates: Requirements 4.3, 4.4**

### Property 11: Report totals equal underlying invoices
The daily/weekly report's revenue figures equal the sum of `total_amount_paise` over the matching paid invoices in the period, and the services breakdown quantities equal the count of matching `invoice_item` rows.
**Validates: Requirements 5.1, 5.2**

### Property 12: Auto-reject only affects still-pending bookings
The stale-pending job's >24h auto-reject transitions a booking to `rejected` only if it is still `pending`; a booking already confirmed/cancelled/rejected is left unchanged.
**Validates: Requirements 6.2**
