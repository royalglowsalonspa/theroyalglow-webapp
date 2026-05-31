# Requirements Document

## Introduction

Phase 6 delivers the automation layer of the Royal Glow Salon & Spa (RGSS) platform: the 19 background jobs defined in `background-jobs.md`, plus the notification delivery layer left as a seam in Phase 5. Jobs split across two runtimes per the project rule — **pg_cron** (7 pure-SQL jobs running inside Neon) and **QStash** (12 jobs that need external HTTP calls, delivered as `/api/jobs/...` Next.js routes). Scheduled QStash jobs run on a fixed cadence; triggered QStash jobs are enqueued with a delay by the business event that fires them.

Consistent with Phases 4–5, every external integration (QStash publish/verify, Web Push, Resend email, Slack webhook, BetterStack heartbeats) is behind a guarded extension point: with no provider keys configured, each job runs its database logic, logs the intended send, pings its (no-op) heartbeat, and returns success — so the whole phase builds, typechecks, and runs. When keys are configured the same code delivers for real.

Out of scope (deferred): provisioning the live QStash schedules and Neon pg_cron registrations (a deploy-time ops step using the user's keys), the Job 5 GitHub Actions workflow YAML (Phase 9 CI/CD — the anonymisation SQL is delivered), PDF invoice rendering internals, Brevo marketing automation, and real-time Ably publishing.

## Glossary

- **Job_Route**: A Next.js API route under `/api/jobs/...` invoked by QStash, which verifies the request signature, performs DB work, and calls external services.
- **PgCron_Job**: A pure-SQL job registered in Neon via `cron.schedule`, with an equivalent TypeScript query function for on-demand invocation.
- **QStash**: The Upstash HTTP message queue that triggers scheduled and delayed jobs and retries on non-2xx responses.
- **Signature_Verification**: The check that an incoming Job_Route request genuinely originated from QStash (or a documented internal-token fallback).
- **Dispatch_Layer**: The `dispatchNotification` function plus the Web Push and email provider helpers that deliver a persisted notification.
- **Heartbeat**: A success ping to a BetterStack monitor URL for a job, used to detect silent failure.
- **Enqueue_Helper**: The helper that publishes a delayed QStash message to schedule a triggered job.
- **IST_Window**: A date/time window computed in the Asia/Kolkata timezone (the salon's operating timezone).
- **Idempotent**: Re-running a job, or a QStash retry of it, produces no duplicate effects (no double-send, no double-count).
- **Daily_Sales_Summary** / **Monthly_Gst_Summary**: Pre-aggregated reporting tables populated by jobs 1 and 6.
- **Paise**: The integer money unit (₹1 = 100 paise).

## Requirements

### Requirement 1: pg_cron Database Jobs

**User Story:** As the business owner, I want nightly database jobs to maintain state and pre-aggregate reporting data, so that the system stays correct and reports load instantly.

#### Acceptance Criteria

1. WHEN the nightly sales summary job runs for a date, THE PgCron_Job SHALL upsert a Daily_Sales_Summary row per branch whose revenue and counts equal the aggregate of that date's paid invoices and bookings.
2. WHEN the membership auto-expire job runs, THE PgCron_Job SHALL set status to `expired` for exactly the memberships whose status is `active` and whose expiry is in the past.
3. WHEN the offer auto-expire job runs, THE PgCron_Job SHALL set the active flag to false for exactly the offers whose active flag is true and whose end date is in the past.
4. WHEN the gems auto-expire job runs, THE PgCron_Job SHALL, for each expired earned gems transaction not already offset, insert one offsetting expired transaction and decrement the loyalty account balance by the same amount.
5. WHEN the monthly GST summary job runs for a month, THE PgCron_Job SHALL upsert a Monthly_Gst_Summary row whose taxable value, GST amount, and invoice count equal the aggregate of that month's paid service and membership-purchase invoices.
6. WHEN any pg_cron job runs a second time over the same data, THE PgCron_Job SHALL produce no additional changes beyond the first run.

### Requirement 2: QStash Scheduled Notification Jobs

**User Story:** As a customer or staff member, I want timely automated reminders and alerts, so that I never miss an appointment, expiry, or follow-up.

#### Acceptance Criteria

1. WHEN the appointment-reminder job runs, THE Job_Route SHALL notify the customer of each confirmed booking entering the 24-hour or 1-hour window, and SHALL record a notification log row so the same reminder is not sent twice.
2. WHEN the membership-expiry job runs, THE Job_Route SHALL select active memberships whose expiry is exactly 30, 7, or 1 IST_Window days away and notify the owning customer, with each membership appearing in at most one tier per run.
3. WHEN a notification-sending job creates a notification, THE Job_Route SHALL set the notification's recipient to the intended user and SHALL NOT direct a customer's notification to another customer.
4. WHERE a customer has disabled the relevant notification preference, THE Job_Route SHALL NOT send that notification to them.
5. WHEN the lead-followup job runs, THE Job_Route SHALL notify the assigned staff member of each lead in `follow_up` status whose last contact is older than 48 hours.
6. WHEN a scheduled job is retried by QStash after a transient failure, THE Job_Route SHALL not duplicate notifications already sent on a prior attempt.

### Requirement 3: Notification Delivery Layer

**User Story:** As a customer, I want to actually receive push and email notifications, so that the alerts the system records reach me.

#### Acceptance Criteria

1. WHEN a push notification is dispatched AND Web Push is configured, THE Dispatch_Layer SHALL send the notification to each of the recipient's active push subscriptions and mark the notification sent.
2. IF a Web Push subscription is no longer valid, THEN THE Dispatch_Layer SHALL deactivate that subscription and continue with the remaining subscriptions.
3. IF an external provider call fails, THEN THE Dispatch_Layer SHALL log the failure, mark the notification as failed, and SHALL NOT throw to its caller.
4. WHEN an email notification is dispatched AND email is configured, THE Dispatch_Layer SHALL send the email to the recipient and mark the notification sent.

### Requirement 4: Job Security and Graceful Degradation

**User Story:** As a developer, I want job endpoints secured and the whole system to run without provider keys, so that the public job routes cannot be abused and the app builds and runs in any environment.

#### Acceptance Criteria

1. IF a Job_Route request fails Signature_Verification AND no valid internal token is present, THEN THE Job_Route SHALL return a 401 response and perform no work.
2. WHEN a Job_Route request passes Signature_Verification, THE Job_Route SHALL perform its database work and external sends.
3. WHERE a provider or integration key is not configured, THE Heartbeat, Enqueue_Helper, and provider helpers SHALL no-op without throwing and the Job_Route SHALL still return success for its completed work.
4. WHEN a Job_Route completes successfully, THE Job_Route SHALL ping its Heartbeat if configured and return a success response containing only non-sensitive counts.

### Requirement 5: Reporting Jobs

**User Story:** As an owner or manager, I want automated daily and weekly business reports, so that I can track performance without manual queries.

#### Acceptance Criteria

1. WHEN the daily sales report job runs, THE Job_Route SHALL compute the day's revenue, booking counts, and services breakdown such that revenue equals the sum of the period's paid invoices and breakdown quantities equal the count of matching invoice items, and SHALL deliver the report via Slack and email when configured.
2. WHEN the weekly report job runs, THE Job_Route SHALL compute the last seven days' figures with a week-over-week comparison and deliver them via Slack and email when configured.

### Requirement 6: Triggered Delay Jobs

**User Story:** As an operator, I want event-driven delayed jobs to catch follow-ups, stale bookings, and no-shows, so that nothing falls through the cracks.

#### Acceptance Criteria

1. WHEN a booking is completed, THE Enqueue_Helper SHALL schedule a post-service follow-up to run 24 hours later, and the follow-up SHALL send a review request only if the customer has marketing consent.
2. WHEN the stale-pending-booking job runs more than 24 hours after a booking was created AND the booking is still pending, THE Job_Route SHALL transition it to `rejected` and notify the customer; AND a booking not in `pending` status SHALL be left unchanged.
3. WHEN the no-show-check job runs after a booking's end time AND the booking is still confirmed, THE Job_Route SHALL notify receptionists rather than auto-marking the no-show.
4. WHEN a membership is created, THE Enqueue_Helper SHALL schedule a final expiry notice to run one hour after the membership's expiry timestamp.
