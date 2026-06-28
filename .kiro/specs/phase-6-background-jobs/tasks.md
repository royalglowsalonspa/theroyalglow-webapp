# Implementation Plan: Phase 6 — Background Jobs & Automation

## Overview

Implement the 19 background jobs (14 QStash scheduled + 4 QStash triggered + 1 GitHub Actions cron) and fill the Phase 5 notification-delivery seam. Every external integration (QStash verify/publish, Web Push, Resend, Slack, BetterStack heartbeats) is a guarded extension point that no-ops without keys, so the whole phase builds, typechecks, and runs today. One additive migration adds service-split columns to `daily_sales_summary`. Verification uses `SKIP_ENV_VALIDATION=1 bun run typecheck` and `bun run lint` (Biome).

## Tasks

- [x] 1. Jobs env vars + pure job helpers
  - Add optional env vars to `apps/web/src/env.ts`: `SLACK_WEBHOOK_URL` (url, optional), `DAILY_REPORT_EMAIL_RECIPIENTS` (string, optional), `BETTER_STACK_HEARTBEAT_*` (optional), VAPID `WEB_PUSH_PUBLIC_KEY`/`WEB_PUSH_SUBJECT` if missing (optional); mirror placeholders into `.env.example`. Keep all new ones `.optional()` so the build never requires them
  - Create `packages/business/src/jobs/time.ts`: IST window helpers — `istToday(now?)`, `istDateInDays(now, n)`, `isSameISTDay(a,b)`, `reminderWindowMatch(startsAt, now)` → '24h'|'1h'|null, `monthKeyIST(now?)`
  - Create `packages/business/src/jobs/report.ts`: `formatDailyReport(data)` + `formatWeeklyReport(data, prev)` → plain-text Slack/email body (uses `formatINR`); `weekOverWeekDelta(current, previous)`
  - Create `packages/business/src/jobs/idempotency.ts`: `gemsExpiredMarker(txId)` → `expired:<txId>`, `reminderDedupeKey(bookingId, kind)`
  - Add `packages/business/src/jobs/index.ts`; re-export from `packages/business/src/index.ts` (append)
  - _Requirements: 2.2, 5.1, 5.2, 4.3_

- [x] 2. daily_sales_summary additive columns + migration
  - Add nullable `salonRevenuePaise`, `spaRevenuePaise`, `membershipRevenuePaise` (integer) to `daily_sales_summary` in `packages/db/src/schema/system.ts`; run `cd packages/db && bunx drizzle-kit push`
  - Create the QStash job routes for DB-maintenance jobs (1 sales summary, 2 membership expire, 3 offer expire, 4 session cleanup, 6 monthly GST, 7 gems expire) using idempotent query functions mapping to the REAL column names. Include the Job 5 anonymisation SQL as a commented block (not scheduled). Add a header comment documenting the QStash schedule manifest for deploy-time setup
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 3. Job query layer (DB-maintenance TS functions + QStash data reads)
  - Create `packages/db/src/queries/jobs.ts`:
    - DB-maintenance functions (formerly pg_cron): `expireMemberships(now?)`, `expireOffers(now?)`, `expireGems(now?)` (db.batch offset tx + balance), `buildDailySalesSummary(dateISO)` (upsert on (date,branch)), `buildMonthlyGstSummary(monthISO)` (upsert on month), `cleanupExpiredSessions(now?)`
    - QStash reads: `getBookingsForReminder(window)` (confirmed, in 24h/1h, no matching notification), `getMembershipsExpiringInDays(days)`, `getBirthdayCustomers(istToday)`, `getNudgeEligibleMemberships(excludeRecentlyNudged)`, `getStaleFollowUpLeads(hours)`, `getGemsExpiringInDays(days)` (grouped by customer), `getDailyReportData(dateISO)` (+ services breakdown), `getWeeklyReportData(startISO,endISO)`, `getPendingBooking(id)`, `getBookingForNoShow(id)`, `hasNotification(userId, type, bookingId?)` (idempotency check)
  - Re-export `./jobs` from `packages/db/src/queries/index.ts` (append)
  - _Requirements: 1.1–1.6, 2.1, 2.2, 2.5, 5.1, 5.2, 6.2, 6.3_

- [x] 4. Notification providers + dispatch fill + shared job libs
  - Create `apps/web/src/lib/notifications/providers/webpush.ts`: `sendWebPush(subscriptions, payload)` using `web-push` + VAPID when configured (guarded), prune 404/410 via `removePushSubscription`; no-op + log otherwise. Dynamic/guarded import so `web-push` isn't a hard build dep
  - Create `apps/web/src/lib/notifications/providers/email.ts`: `sendEmail({to,subject,html})` using Resend when configured (guarded); no-op + return false otherwise
  - Update `apps/web/src/lib/notifications/dispatch.ts`: resolve recipient active push subs / email, call providers per channel, set notification `status`/`sentAt`; keep never-throw contract
  - Create `apps/web/src/lib/jobs/verify.ts`: `verifyQStashSignature(req)` using `@upstash/qstash` Receiver when signing keys present; internal-token fallback via env; documented dev allowance
  - Create `apps/web/src/lib/jobs/heartbeat.ts`: `pingHeartbeat(name)` GET the `BETTER_STACK_HEARTBEAT_<NAME>` url if set, else no-op
  - Create `apps/web/src/lib/jobs/enqueue.ts`: `enqueueJob(path, body, delaySeconds)` publish via `@upstash/qstash` when `QSTASH_TOKEN` set, else no-op + log
  - Create `apps/web/src/lib/reports/slack.ts`: `postToSlack(text)` POST `SLACK_WEBHOOK_URL` if set, else no-op
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4_

- [x] 5. QStash scheduled job routes (8–12, 15)
  - Create `/api/jobs/appointment-reminders/route.ts` (job 8): verify → `getBookingsForReminder` → per booking `buildNotificationContent` + `createNotification` + `dispatchNotification` (respect `appointmentRemindersEnabled`) → heartbeat
  - Create `/api/jobs/membership-expiry/route.ts` (job 9): 30/7/1-day tiers, respect `membershipAlertsEnabled`
  - Create `/api/jobs/birthday-emails/route.ts` (job 10): DOB match, respect `marketingConsent`
  - Create `/api/jobs/membership-usage-nudges/route.ts` (job 11): random eligible subset, recency skip, respect `membershipAlertsEnabled`
  - Create `/api/jobs/lead-followups/route.ts` (job 12): notify assigned staff
  - Create `/api/jobs/gems-expiry-reminder/route.ts` (job 15): push only, grouped by customer
  - Each: `verifyQStashSignature` gate (401 on fail), idempotency via `hasNotification`, heartbeat, `200 { processed }`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 4.1, 4.2, 4.4_

- [x] 6. QStash report job routes (13, 14)
  - Create `/api/jobs/daily-sales-report/route.ts` (job 13): `getDailyReportData` → `formatDailyReport` → `postToSlack` + `sendEmail` to `DAILY_REPORT_EMAIL_RECIPIENTS`
  - Create `/api/jobs/weekly-report/route.ts` (job 14): `getWeeklyReportData` + prior week → `formatWeeklyReport` (WoW) → Slack + email
  - Each: verify gate, heartbeat, `200`
  - _Requirements: 4.1, 4.2, 4.4, 5.1, 5.2_

- [x] 7. QStash triggered job routes + event enqueues (16–19)
  - Create `/api/jobs/post-service-followup/route.ts` (job 16): review-request email if `marketingConsent`
  - Create `/api/jobs/stale-booking-alert/route.ts` (job 17): if still pending → notify receptionists; if >24h → auto-reject (only when still pending) + notify customer
  - Create `/api/jobs/noshow-check/route.ts` (job 18): if still confirmed past end → notify receptionists (never auto-mark)
  - Create `/api/jobs/membership-expired-notice/route.ts` (job 19): final renewal email
  - Wire guarded `enqueueJob(...)` calls at the event sites: booking completion (`/api/bookings/[id]/complete` → post-service +24h), booking creation (`/api/bookings` → stale +2h; no-show after end_time), membership creation (`/api/memberships` → expired notice +1h). All best-effort/no-throw
  - _Requirements: 4.1, 4.2, 6.1, 6.2, 6.3, 6.4_

- [x] 8. Verification — typecheck and lint
  - Run `SKIP_ENV_VALIDATION=1 bun run typecheck` across the workspace; resolve all type errors in new files (no `any`, no `@ts-ignore` beyond a single justified guarded optional-dependency import if unavoidable)
  - Run `bun run lint` (Biome) and fix any genuine new issues (ignore the pre-existing CRLF/import-order/useSemanticElements baseline)
  - Confirm the additive `daily_sales_summary` columns are pushed and `queries/jobs.ts` compiles; confirm no core flow (booking complete/create, membership create) breaks when QStash keys are absent (enqueue no-ops)
  - _Requirements: 4.3_

## Notes

- All job tables already exist; the only schema change is the `daily_sales_summary` service-split columns (Task 2), pushed via `cd packages/db && bunx drizzle-kit push`.
- External integrations are guarded extension points — `QSTASH_*`, `WEB_PUSH_PRIVATE_KEY` + VAPID, `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`, `BETTER_STACK_HEARTBEAT_*`. Read from `process.env` behind truthy guards; no-op + log when absent. No core flow depends on them being live.
- Job routes do NOT use `withErrorHandler`/`apiSuccess` — they return a minimal job-response shape and non-2xx on failure so QStash retries work. Signature verification (401 on fail) is mandatory on every route.
- Reuse existing helpers: `buildNotificationContent`, `createNotification`, `getActivePushSubscriptions`, `removePushSubscription`, `splitGST`, `formatINR`/`formatDateIN`, `getOrCreateLoyaltyAccount`.
- Use `db.batch()` for multi-row writes; query functions use `ON CONFLICT DO UPDATE` for idempotency.
- Money is integer paise; date windows computed in IST via `packages/business/src/jobs/time.ts`. QStash crons are UTC.
- Provisioning the live QStash schedules is a deploy-time ops step (a documented schedule manifest is delivered here).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3", "4"] },
    { "id": 2, "tasks": ["5", "6", "7"] },
    { "id": 3, "tasks": ["8"] }
  ]
}
```
