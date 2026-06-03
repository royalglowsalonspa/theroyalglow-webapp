/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : stale
 * Scope        : Business Logic — Lead Pipeline
 *
 * Description  : Detects stale leads that have remained in 'new'
 *                status beyond the 48-hour threshold.
 *
 * Responsibilities :
 * - Compute elapsed hours since lead creation
 * - Determine if a lead qualifies as stale
 *
 * Features / Functionality :
 * - hoursSince(createdAt, now) → elapsed hours
 * - isLeadStale(status, createdAt, now) → boolean
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/types (LeadStatus)
 *
 * Notes        :
 * - Threshold: 48 hours untouched in 'new' status
 ************************************************************/
import type { LeadStatus } from '@rgss/types'
// for 48 hours or more. The threshold is expressed in hours so callers can also
// surface the elapsed time directly.
const STALE_THRESHOLD_HOURS = 48

const MS_PER_HOUR = 1000 * 60 * 60

// Whole-or-fractional hours elapsed between createdAt and now.
export function hoursSince(createdAt: Date, now: Date = new Date()): number {
  return (now.getTime() - createdAt.getTime()) / MS_PER_HOUR
}

// True iff the lead is still 'new' and was created at least 48 hours ago.
export function isLeadStale(status: LeadStatus, createdAt: Date, now: Date = new Date()): boolean {
  return status === 'new' && hoursSince(createdAt, now) >= STALE_THRESHOLD_HOURS
}
