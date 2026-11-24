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
 * - remainingMinutes(total, used, reserved) → integer
 * - membershipUnusableAt(m, at) → why a session can't start then, or null
 * - assertSessionRecordable(m, requestedMinutes) — throws on violation
 * - assertSessionBookable(m, requestedMinutes, plannedStart) — the same for a
 *   session booked ahead, checked at its planned start
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : @rgss/errors
 *
 * Notes        :
 * - Throws MEMBERSHIP_EXPIRED, MEMBERSHIP_NOT_STARTED or
 *   MEMBERSHIP_INSUFFICIENT_HOURS (409)
 ************************************************************/
import { conflict, ERROR_CODES } from '@rgss/errors'
import { formatDateIN } from '../utils/date'

// Minutes free on a membership: purchased, less consumed, less held by
// sessions booked or in progress (membership-scheduling.md). Pure arithmetic;
// the caller ensures non-negative inputs.
export function remainingMinutes(total: number, used: number, reserved = 0): number {
  return total - used - reserved
}

/** Why a membership can't give a session starting at `at`. */
export type MembershipUnusableReason = 'cancelled' | 'expired' | 'not_started'

// Why a membership can't be used for a session starting at `at`, or null when
// it can. Validity is inclusive at both ends, [startsAt, expiresAt], as the
// database checks it when a session is held or started (0026, MS-05).
export function membershipUnusableAt(
  m: { status: string; startsAt: Date; expiresAt: Date },
  at: Date,
): MembershipUnusableReason | null {
  if (m.status === 'cancelled') {
    return 'cancelled'
  }
  if (m.status === 'expired' || at.getTime() > m.expiresAt.getTime()) {
    return 'expired'
  }
  if (at.getTime() < m.startsAt.getTime()) {
    return 'not_started'
  }
  return null
}

// Guard before starting a session against a membership. The database checks
// the same when it holds the minutes (0026); this gives the specific error.
// Throws MEMBERSHIP_EXPIRED (409) if the membership is not active or is past
// its expiry, MEMBERSHIP_NOT_STARTED (409) before its start, and
// MEMBERSHIP_INSUFFICIENT_HOURS (409) if the requested minutes are more than
// it has free.
export function assertSessionRecordable(
  m: {
    status: string
    /** Absent on callers that read no start; such a check skips it. */
    startsAt?: Date
    expiresAt: Date
    totalHoursMinutes: number
    usedHoursMinutes: number
    /** Held by other sessions; absent on rows read before holds existed. */
    reservedMinutes?: number
  },
  requestedMinutes: number,
  now: Date = new Date(),
): void {
  if (m.status !== 'active' || now > m.expiresAt) {
    throw conflict(ERROR_CODES.MEMBERSHIP_EXPIRED, 'This membership is not active or has expired')
  }
  if (m.startsAt && now < m.startsAt) {
    throw conflict(
      ERROR_CODES.MEMBERSHIP_NOT_STARTED,
      `This membership starts on ${formatDateIN(m.startsAt)}. Sessions can be recorded from then.`,
    )
  }

  if (
    requestedMinutes >
    remainingMinutes(m.totalHoursMinutes, m.usedHoursMinutes, m.reservedMinutes ?? 0)
  ) {
    throw conflict(
      ERROR_CODES.MEMBERSHIP_INSUFFICIENT_HOURS,
      'The requested session duration exceeds the remaining membership hours',
    )
  }
}

// Guard before booking a session ahead, to start at `plannedStart`. The
// membership must be active now and valid at the planned start, inclusive at
// both ends (the database checks the same when it holds the minutes, 0026),
// and have the minutes free now: a booked session holds them from now until
// it is completed or cancelled. Throws MEMBERSHIP_EXPIRED,
// MEMBERSHIP_NOT_STARTED or MEMBERSHIP_INSUFFICIENT_HOURS (409), each saying
// what to choose instead.
export function assertSessionBookable(
  m: {
    status: string
    startsAt: Date
    expiresAt: Date
    totalHoursMinutes: number
    usedHoursMinutes: number
    reservedMinutes?: number
  },
  requestedMinutes: number,
  plannedStart: Date,
): void {
  switch (membershipUnusableAt(m, plannedStart)) {
    case 'cancelled':
      throw conflict(ERROR_CODES.MEMBERSHIP_EXPIRED, 'This membership was cancelled.')
    case 'expired':
      throw conflict(
        ERROR_CODES.MEMBERSHIP_EXPIRED,
        m.status === 'active'
          ? `This membership expires on ${formatDateIN(m.expiresAt)}. Choose a time before then.`
          : 'This membership is not active or has expired',
      )
    case 'not_started':
      throw conflict(
        ERROR_CODES.MEMBERSHIP_NOT_STARTED,
        `This membership starts on ${formatDateIN(m.startsAt)}. Choose a time from then.`,
      )
    case null:
      break
  }
  if (m.status !== 'active') {
    throw conflict(ERROR_CODES.MEMBERSHIP_EXPIRED, 'This membership is not active or has expired')
  }
  if (
    requestedMinutes >
    remainingMinutes(m.totalHoursMinutes, m.usedHoursMinutes, m.reservedMinutes ?? 0)
  ) {
    throw conflict(
      ERROR_CODES.MEMBERSHIP_INSUFFICIENT_HOURS,
      'The requested session duration exceeds the remaining membership hours',
    )
  }
}
