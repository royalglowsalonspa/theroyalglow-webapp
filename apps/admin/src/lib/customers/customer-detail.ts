/************************************************************
 * Module Name  : customers/customer-detail (admin)
 * Scope        : Server — one branch's view of a shared customer (R3)
 *
 * Description  : The customer profile projection that GET /api/customers/[id]
 *                returns and the profile page renders, so the two can never
 *                disagree (route inventory: "same projection as the API").
 *
 * Responsibilities :
 * - Shared identity, visit and no-show KPIs, tags, gems and memberships
 * - Money, bookings and invoices from the active branch only
 * - Other branches' visits as their date, branch and services
 * - The notes the active branch may read
 *
 * Notes        : The customer-wide spending counter is never read here, and
 *                membership prices stay out of the shared membership view.
 *                Server only: it reads the database.
 ************************************************************/

import { branchAverageSpendPaise, mergeCustomerHistory } from '@rgss/business'
import {
  getCustomerBranchSpend,
  getCustomerHistory,
  getCustomerInvoices,
  getCustomerMembership,
  getCustomerNotes,
  getCustomerProfile,
} from '@rgss/db/queries'

/** First-page size of the profile's history and invoice lists. */
export const CUSTOMER_HISTORY_LIMIT = 20

type MembershipRow = NonNullable<Awaited<ReturnType<typeof getCustomerMembership>>['active']>

// What every branch may see of a membership: no price (memberships are shared,
// their money belongs to the selling branch).
function membershipView(m: MembershipRow) {
  return {
    id: m.id,
    membershipNumber: m.membershipNumber,
    tierNameSnapshot: m.tierNameSnapshot,
    status: m.status,
    totalHoursMinutes: m.totalHoursMinutes,
    usedHoursMinutes: m.usedHoursMinutes,
    // Held by sessions booked or in progress (0026).
    reservedMinutes: m.reservedMinutes,
    startsAt: m.startsAt.toISOString(),
    expiresAt: m.expiresAt.toISOString(),
  }
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

/** The customer as `branchId` sees them, or null when there is no such customer. */
export async function loadCustomerDetail(customerId: string, branchId: string) {
  const profile = await getCustomerProfile(customerId)
  if (!profile) {
    return null
  }

  const [spend, history, invoices, membership, notes] = await Promise.all([
    getCustomerBranchSpend(customerId, branchId),
    getCustomerHistory(customerId, branchId, CUSTOMER_HISTORY_LIMIT),
    getCustomerInvoices(customerId, branchId, CUSTOMER_HISTORY_LIMIT, 0),
    getCustomerMembership(customerId),
    getCustomerNotes(customerId, branchId),
  ])

  return {
    branchId,
    customer: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      gender: profile.gender,
      createdAt: profile.createdAt.toISOString(),
      // Shared visit history: every branch's completed visits.
      totalVisits: profile.totalVisits,
      firstVisitAt: iso(profile.firstVisitAt),
      lastVisitAt: iso(profile.lastVisitAt),
      // The no-show policy follows the customer to every branch.
      noshowCount: profile.noshowCount,
      lateCancellationCount: profile.lateCancellationCount,
      bookingRequiresApproval: profile.bookingRequiresApproval,
      gemsBalance: profile.gemsBalance ?? 0,
      tags: profile.tags,
    },
    /** This branch only (R3.2). */
    branchMoney: {
      spentPaise: spend.spentPaise,
      visits: spend.visits,
      averageSpendPaise: branchAverageSpendPaise(spend.spentPaise, spend.visits),
    },
    history: mergeCustomerHistory(
      history.thisBranch,
      history.otherBranches,
      CUSTOMER_HISTORY_LIMIT,
    ),
    /** This branch's invoices only. */
    invoices: invoices.map((inv) => ({ ...inv, createdAt: inv.createdAt.toISOString() })),
    membership: {
      active: membership.active ? membershipView(membership.active) : null,
      past: membership.past.map(membershipView),
    },
    notes,
  }
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof loadCustomerDetail>>>
