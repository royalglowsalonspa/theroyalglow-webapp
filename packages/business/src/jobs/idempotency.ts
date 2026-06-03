/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : idempotency
 * Scope        : Business Logic — Background Jobs
 *
 * Description  : Stable dedupe/marker keys for making background
 *                jobs idempotent across re-runs and QStash retries.
 *
 * Responsibilities :
 * - Generate gems-expired marker keys
 * - Generate appointment reminder dedupe keys
 *
 * Features / Functionality :
 * - gemsExpiredMarker(txId) — prevents double-expiration
 * - reminderDedupeKey(bookingId, window) — prevents duplicate reminders
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : ./time (ReminderWindow type)
 *
 * Notes        :
 * - Keys match conventions in background-jobs.md
 ************************************************************/
import type { ReminderWindow } from './time'

// Marker stored on the offsetting `expired` loyalty_transaction so the gems
// auto-expire job (job 7) never offsets the same earned transaction twice.
// Matches the `'expired:' || lt.id` convention in background-jobs.md.
export function gemsExpiredMarker(txId: string): string {
  return `expired:${txId}`
}

// Dedupe key for an appointment reminder (job 8) so a given booking is reminded
// at most once per window (24h / 1h).
export function reminderDedupeKey(bookingId: string, kind: ReminderWindow): string {
  return `reminder_${kind}:${bookingId}`
}
