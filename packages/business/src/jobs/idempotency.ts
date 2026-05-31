import type { ReminderWindow } from './time'

// Stable keys used to make jobs idempotent across re-runs and QStash retries.

// Marker stored on the offsetting `expired` loyalty_transaction so the gems
// auto-expire job (job 7) never offsets the same earned transaction twice.
// Matches the `'expired:' || lt.id` convention in background-jobs.md.
export function gemsExpiredMarker(txId: string): string {
  return `expired:${txId}`
}

// Dedupe key for an appointment reminder (job 8) so a given booking is reminded
// at most once per window (24h / 1h).
export function reminderDedupeKey(
  bookingId: string,
  kind: ReminderWindow,
): string {
  return `reminder_${kind}:${bookingId}`
}
