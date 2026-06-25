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

// The 8 QStash scheduled jobs. Crons are UTC; the comment gives the IST intent.
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
] as const
