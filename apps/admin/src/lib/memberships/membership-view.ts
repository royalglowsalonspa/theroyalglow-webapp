/************************************************************
 * Module Name  : memberships/membership-view (admin)
 * Scope        : Server — what one person sees of a shared membership
 *
 * Description  : Memberships are shared by every Royal Glow branch; their
 *                sale is not (route inventory gap 5). These shape the list and
 *                detail responses:
 *                  - the price paid, the tier's usual hours and price at sale
 *                    time and the purchase invoice go in `sale`, which is null
 *                    unless the person can access the selling branch;
 *                  - a session performed at another branch shows its date,
 *                    branch, services and duration, not its booking number or
 *                    staff.
 *
 * Notes        : Pure. The decisions come from @rgss/business.
 ************************************************************/

import { type BranchAccess, canSeeMembershipSale } from '@rgss/business'

/** Columns that describe what the membership was sold for. */
type SaleColumns = {
  pricePaidPaise: number
  tierUsualHoursMinutes: number | null
  tierUsualPricePaise: number | null
  invoiceId: string | null
}

type SaleKey = keyof SaleColumns

export type MembershipSale = SaleColumns

/** The membership with its sale shown only to people at the selling branch. */
export function membershipForViewer<T extends SaleColumns & { sellingBranchId: string | null }>(
  row: T,
  access: Pick<BranchAccess, 'branches'>,
): Omit<T, SaleKey> & { sale: MembershipSale | null } {
  const { pricePaidPaise, tierUsualHoursMinutes, tierUsualPricePaise, invoiceId, ...shared } = row
  const sale = canSeeMembershipSale(access, row.sellingBranchId)
    ? { pricePaidPaise, tierUsualHoursMinutes, tierUsualPricePaise, invoiceId }
    : null
  return { ...shared, sale }
}

type SessionService = {
  serviceNameSnapshot: string
  durationMinutes: number
  staffId: string | null
  staffName: string | null
}

type SessionRow = {
  id: string
  bookingNumber: string
  branchId: string
  branchName: string
  bookingDate: Date
  startTime: string
  endTime: string
  totalDurationMinutes: number
  status: string
  services: SessionService[]
}

/** A membership session as the active branch sees it. */
export type MembershipSessionView =
  | {
      scope: 'this_branch'
      id: string
      bookingNumber: string
      branchName: string
      bookingDate: string
      startTime: string
      endTime: string
      totalDurationMinutes: number
      status: string
      services: SessionService[]
    }
  | {
      scope: 'other_branch'
      branchName: string
      bookingDate: string
      startTime: string
      endTime: string
      totalDurationMinutes: number
      services: { serviceNameSnapshot: string; durationMinutes: number }[]
    }

/** One session as `branchId` sees it: everything at home, the shared facts elsewhere. */
export function sessionForBranch(session: SessionRow, branchId: string): MembershipSessionView {
  const shared = {
    branchName: session.branchName,
    bookingDate: session.bookingDate.toISOString().slice(0, 10),
    startTime: session.startTime,
    endTime: session.endTime,
    totalDurationMinutes: session.totalDurationMinutes,
  }
  if (session.branchId === branchId) {
    return {
      scope: 'this_branch',
      id: session.id,
      bookingNumber: session.bookingNumber,
      status: session.status,
      services: session.services.map((s) => ({
        serviceNameSnapshot: s.serviceNameSnapshot,
        durationMinutes: s.durationMinutes,
        staffId: s.staffId,
        staffName: s.staffName,
      })),
      ...shared,
    }
  }
  return {
    scope: 'other_branch',
    services: session.services.map((s) => ({
      serviceNameSnapshot: s.serviceNameSnapshot,
      durationMinutes: s.durationMinutes,
    })),
    ...shared,
  }
}
