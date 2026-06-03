/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : hours
 * Scope        : Business Logic — Membership
 *
 * Description  : Membership hour tracking and session recording
 *                guard logic.
 *
 * Responsibilities :
 * - Calculate remaining minutes on a membership
 * - Guard session recording (expired/insufficient hours)
 *
 * Features / Functionality :
 * - remainingMinutes(total, used) → integer
 * - assertSessionRecordable(m, requestedMinutes) — throws on violation
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/errors
 *
 * Notes        :
 * - Throws MEMBERSHIP_EXPIRED or MEMBERSHIP_INSUFFICIENT_HOURS (409)
 ************************************************************/
import { ERROR_CODES, conflict } from '@rgss/errors'

// Remaining minutes on a membership. Pure arithmetic; the caller ensures
// non-negative inputs.
export function remainingMinutes(total: number, used: number): number {
  return total - used
}

// Guard before recording a session against a membership.
// Throws MEMBERSHIP_EXPIRED (409) if the membership is not active or is past
// its expiry, and MEMBERSHIP_INSUFFICIENT_HOURS (409) if the requested minutes
// would push used minutes beyond the total.
export function assertSessionRecordable(
  m: {
    status: string
    expiresAt: Date
    totalHoursMinutes: number
    usedHoursMinutes: number
  },
  requestedMinutes: number,
  now: Date = new Date(),
): void {
  if (m.status !== 'active' || now > m.expiresAt) {
    throw conflict(ERROR_CODES.MEMBERSHIP_EXPIRED, 'This membership is not active or has expired')
  }

  if (m.usedHoursMinutes + requestedMinutes > m.totalHoursMinutes) {
    throw conflict(
      ERROR_CODES.MEMBERSHIP_INSUFFICIENT_HOURS,
      'The requested session duration exceeds the remaining membership hours',
    )
  }
}
