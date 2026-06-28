/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : schedules
 * Scope        : Background Jobs
 *
 * Description  : Canonical definitions of the 8 QStash *scheduled* jobs — the
 *                path each schedule POSTs to and its cron expression. The
 *                registration script (scripts/register-schedules.ts) reads this
 *                single source of truth so the crons and the route handlers can
 *                never drift apart.
 *
 * Responsibilities :
 * - Declare each scheduled job's route path + UTC cron + human description
 *
 * Features / Functionality :
 * - One JOB_SCHEDULES array consumed by the idempotent registration script
 *
 * Tech Stack   : TypeScript
 * Layer        : API Infrastructure (config)
 *
 * Dependencies : none
 *
 * Notes        : QStash crons run in UTC. India observes no DST, so
 *                IST = UTC + 5:30 always. Each entry documents its IST intent.
 *                Edit cron values here; re-run the registration script to apply.
 ************************************************************/

export interface JobSchedule {
  /** Stable id used to find + replace this schedule on re-registration. */
  key: string
  /** Route path the schedule POSTs to (appended to NEXT_PUBLIC_APP_URL). */
  path: string
  /** Cron expression in UTC. */
  cron: string
  /** Human description incl. the IST intent. */
  description: string
}

// The QStash scheduled jobs (8 original + 6 migrated from pg_cron). Crons are
// UTC; the comment gives the IST intent.
export const JOB_SCHEDULES: readonly JobSchedule[] = [
  {
    key: 'appointment-reminders',
    path: '/api/jobs/appointment-reminders',
    cron: '*/15 * * * *',
    description: 'Every 15 min — 24h & 1h appointment reminders (handler gates the windows).',
  },
  {
    key: 'membership-expiry',
    path: '/api/jobs/membership-expiry',
    cron: '30 3 * * *',
    description: 'Daily 09:00 IST — membership expiry alerts (30/7/1 days).',
  },
  {
    key: 'birthday-emails',
    path: '/api/jobs/birthday-emails',
    cron: '30 2 * * *',
    description: 'Daily 08:00 IST — birthday offer emails.',
  },
  {
    key: 'membership-usage-nudges',
    path: '/api/jobs/membership-usage-nudges',
    cron: '30 4 * * *',
    description: 'Daily 10:00 IST — membership usage nudges.',
  },
  {
    key: 'lead-followups',
    path: '/api/jobs/lead-followups',
    cron: '30 5 * * *',
    description: 'Daily 11:00 IST — lead follow-up reminders.',
  },
  {
    key: 'daily-sales-report',
    path: '/api/jobs/daily-sales-report',
    cron: '0 17 * * *',
    description: 'Daily 22:30 IST — daily sales report.',
  },
  {
    key: 'weekly-report',
    path: '/api/jobs/weekly-report',
    cron: '30 2 * * 1',
    description: 'Monday 08:00 IST — weekly business report.',
  },
  {
    key: 'gems-expiry-reminder',
    path: '/api/jobs/gems-expiry-reminder',
    cron: '0 4 * * *',
    description: 'Daily 09:30 IST — gems expiry reminders.',
  },
  // ── pg_cron → QStash migrated jobs ──────────────────────────────────────
  // The 6 entries below replace the pg_cron schedules in
  // migrations/0001_pg_cron_jobs.sql. pg_cron only runs while the Neon compute
  // is awake, but the free-tier prod compute scales to zero after ~5 min idle,
  // so these late-night jobs would silently never fire. Running them as QStash
  // HTTP jobs wakes the compute so they run reliably at ₹0. The crons below are
  // the IDENTICAL UTC expressions the pg_cron jobs used.
  {
    key: 'nightly-sales-summary',
    path: '/api/jobs/nightly-sales-summary',
    cron: '0 18 * * *',
    description: 'Daily 23:30 IST — nightly sales summary (was pg_cron).',
  },
  {
    key: 'membership-auto-expire',
    path: '/api/jobs/membership-auto-expire',
    cron: '30 18 * * *',
    description: 'Daily 00:00 IST — membership auto-expire (was pg_cron).',
  },
  {
    key: 'offer-auto-expire',
    path: '/api/jobs/offer-auto-expire',
    cron: '35 18 * * *',
    description: 'Daily 00:05 IST — offer auto-expire (was pg_cron).',
  },
  {
    key: 'gems-auto-expire',
    path: '/api/jobs/gems-auto-expire',
    cron: '40 18 * * *',
    description: 'Daily 00:10 IST — gems auto-expire (was pg_cron).',
  },
  {
    key: 'session-cleanup',
    path: '/api/jobs/session-cleanup',
    cron: '0 21 * * 0',
    description: 'Sunday 02:30 IST — expired session cleanup (was pg_cron).',
  },
  {
    key: 'monthly-gst-summary',
    path: '/api/jobs/monthly-gst-summary',
    cron: '30 19 1 * *',
    description: 'Monthly 01:00 IST on the 1st — monthly GST summary (was pg_cron).',
  },
] as const
