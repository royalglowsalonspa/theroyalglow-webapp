import { badRequest } from '@rgss/errors'

const DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

// Validate a single weekly schedule entry. A non-working day is always valid.
// A working day requires both a start and end time, with the start strictly
// earlier than the end. Times are zero-padded 24h HH:MM strings, so a lexical
// comparison is equivalent to a chronological one.
export function assertValidScheduleEntry(e: {
  isWorking: boolean
  startTime: string | null
  endTime: string | null
}): void {
  if (!e.isWorking) {
    return
  }

  if (e.startTime === null || e.endTime === null || e.startTime >= e.endTime) {
    throw badRequest('A working day requires a start time and a later end time')
  }
}

// Map a day-of-week index (0=Sun … 6=Sat) to its label. Out-of-range input
// returns a safe fallback rather than throwing.
export function dayOfWeekLabel(n: number): string {
  return DAY_LABELS[n] ?? `Day ${n}`
}
