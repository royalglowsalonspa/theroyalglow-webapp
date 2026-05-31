import type { LeadStatus } from '@rgss/types'

// A lead is considered "stale" once it has sat untouched in the 'new' status
// for 48 hours or more. The threshold is expressed in hours so callers can also
// surface the elapsed time directly.
const STALE_THRESHOLD_HOURS = 48

const MS_PER_HOUR = 1000 * 60 * 60

// Whole-or-fractional hours elapsed between createdAt and now.
export function hoursSince(createdAt: Date, now: Date = new Date()): number {
  return (now.getTime() - createdAt.getTime()) / MS_PER_HOUR
}

// True iff the lead is still 'new' and was created at least 48 hours ago.
export function isLeadStale(
  status: LeadStatus,
  createdAt: Date,
  now: Date = new Date(),
): boolean {
  return status === 'new' && hoursSince(createdAt, now) >= STALE_THRESHOLD_HOURS
}
