/************************************************************
 * Module Name  : branch/customer-view
 * Scope        : Business Logic — what one branch sees of a shared customer
 *
 * Description  : Customers are shared by every Royal Glow branch; money is not
 *                (multi-branch R3.2). These pure helpers shape the per-branch
 *                view the admin customer list, profile API and profile page
 *                all return.
 *
 * Responsibilities :
 * - branchAverageSpendPaise: what a visit at the branch is worth on average
 * - mergeCustomerHistory: one newest-first history from this branch's
 *   bookings and other branches' visits
 *
 * Notes        : No I/O. The queries already restrict each input to what the
 *                branch may see; these functions never widen it.
 ************************************************************/

import type { CustomerHistoryEntry } from '@rgss/types'

/**
 * The branch's paid total divided by the customer's completed visits there,
 * rounded to the paise. Null before the first visit at the branch.
 */
export function branchAverageSpendPaise(spentPaise: number, visits: number): number | null {
  return visits > 0 ? Math.round(spentPaise / visits) : null
}

// Visit dates are YYYY-MM-DD and times HH:MM:SS, so the joined string sorts in
// time order.
function visitInstant(entry: CustomerHistoryEntry): string {
  return `${entry.bookingDate}T${entry.startTime}`
}

/**
 * Merge this branch's bookings and other branches' visits, each already newest
 * first, into one newest-first list of at most `limit` entries. Linear: each
 * input is read once. On a tie the branch's own booking comes first.
 */
export function mergeCustomerHistory(
  thisBranch: readonly CustomerHistoryEntry[],
  otherBranches: readonly CustomerHistoryEntry[],
  limit: number,
): CustomerHistoryEntry[] {
  const merged: CustomerHistoryEntry[] = []
  let i = 0
  let j = 0
  while (merged.length < limit) {
    const own = thisBranch[i]
    const other = otherBranches[j]
    if (own !== undefined && (other === undefined || visitInstant(own) >= visitInstant(other))) {
      merged.push(own)
      i += 1
    } else if (other !== undefined) {
      merged.push(other)
      j += 1
    } else {
      break
    }
  }
  return merged
}
