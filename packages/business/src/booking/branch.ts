/************************************************************
 * Module Name  : branch (booking)
 * Scope        : Business Logic — Booking
 *
 * Description  : Which branches a customer can book at, and which one a
 *                booking defaults to. Shared by GET /api/branches (the booking
 *                dialog's branch picker) and GET /api/availability (its
 *                fallback when a request names no branch), so the branch the
 *                picker preselects and the availability fallback cannot drift.
 *
 * Layer        : Business Logic (pure, no I/O)
 *
 * Dependencies : @rgss/types
 *
 * Notes        : "Bookable" mirrors POST /api/bookings, which rejects any
 *                branch whose status is not `operational`.
 ************************************************************/

import type { BranchStatusValue, PublicBranchList } from '@rgss/types'

/** The branch fields these rules read. */
export type BranchSummary = {
  id: string
  name: string
  city: string
  status: BranchStatusValue
  isPrimary: boolean
}

/** Only an operational branch takes bookings. */
export function isBranchBookable(status: BranchStatusValue): boolean {
  return status === 'operational'
}

/**
 * The branch a booking defaults to: the primary branch when it is taking
 * bookings, otherwise the first bookable branch in the given (display) order.
 * Null when no branch is taking bookings.
 */
export function resolveDefaultBranch<T extends Pick<BranchSummary, 'status' | 'isPrimary'>>(
  branches: readonly T[],
): T | null {
  const bookable = branches.filter((b) => isBranchBookable(b.status))
  return bookable.find((b) => b.isPrimary) ?? bookable[0] ?? null
}

/**
 * The branch list the booking dialog shows, in the given order. `isPrimary` is
 * an internal flag and is not exposed; `defaultBranchId` carries its effect.
 */
export function buildPublicBranchList(branches: readonly BranchSummary[]): PublicBranchList {
  return {
    branches: branches.map(({ id, name, city, status }) => ({
      id,
      name,
      city,
      status,
      acceptingBookings: isBranchBookable(status),
    })),
    defaultBranchId: resolveDefaultBranch(branches)?.id ?? null,
  }
}
