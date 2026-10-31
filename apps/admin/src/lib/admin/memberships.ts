/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 25-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : memberships
 * Scope        : Admin — Memberships
 *
 * Description  : Shared types, formatting helpers, and constants for the admin
 *                SPA membership pages, the sale form, the tiers screen and the
 *                record-session modal.
 *
 * Responsibilities :
 * - Define TypeScript interfaces for membership list/detail/session data
 * - Provide time-based helpers (minutesToHM, daysUntil, daysBetweenISO)
 * - Check a sale against the server's limits before it is sent
 * - Provide filter and payment method option constants
 *
 * Features / Functionality :
 * - MembershipListRow / MembershipDetailData / MembershipTier(List) types
 * - freeMinutesOf() — total less used and held minutes
 * - minutesToHM() / daysUntil() / daysBetweenISO() / saleFormProblem()
 * - rupeesToPaise() / paiseToRupeesText() for the price fields
 * - todayISTDateString() for default form values
 * - MEMBERSHIP_STATUS_OPTIONS / MEMBERSHIP_PAYMENT_METHODS
 * - Re-exports the shared sale rules (stepSaleHours, tierSalePrefill, limits)
 *
 * Tech Stack   : TypeScript
 * Layer        : Data Fetching
 *
 * Dependencies : @rgss/business, @rgss/types,
 *                ./bookings (formatINR, formatDateDDMMYYYY)
 *
 * Notes        : None
 ************************************************************/

// Shared types + formatting helpers for the admin membership pages.
// Mirrors the GET /api/memberships, /api/memberships/[id], and
// /api/membership-tiers responses.

import { remainingMinutes } from '@rgss/business'
import { MEMBERSHIP_SALE_LIMITS } from '@rgss/types'
import type { StaffBusy } from './bookings'

// The sale and tier rules the forms apply, from the shared packages, so the
// form, the API and the tests use one definition (multi-branch R9).
export { hoursLabel, stepSaleHours, tierSalePrefill } from '@rgss/business'
export {
  addDaysISO,
  DEFAULT_MEMBERSHIP_SAC_CODE,
  MEMBERSHIP_SALE_LIMITS,
  REVIEWED_SAC_CODES,
} from '@rgss/types'

// Reuse the booking currency/date formatters so admin pages render money and
// dates identically (₹15,000 · DD/MM/YYYY).
export { formatDateDDMMYYYY, formatINR } from './bookings'

// What a membership was sold for. Only people who can access the selling
// branch receive it (route inventory gap 5); everyone else gets null.
export interface MembershipSale {
  pricePaidPaise: number
  /** The tier's usual hours and price at sale time; null for older sales. */
  tierUsualHoursMinutes: number | null
  tierUsualPricePaise: number | null
  invoiceId: string | null
}

// Fields common to both the list row and the detail payload (the flattened
// spa_membership row plus the owning customer's name).
interface MembershipBase {
  id: string
  membershipNumber: string
  customerId: string
  tierId: string
  tierNameSnapshot: string
  totalHoursMinutes: number
  usedHoursMinutes: number
  /** Held by sessions booked or in progress until they complete or are cancelled. */
  reservedMinutes: number
  startsAt: string
  expiresAt: string
  status: string
  notes: string | null
  createdAt: string
  customerName: string
  /** The branch that sold it. The hours can be used at any branch. */
  sellingBranch: { id: string; name: string } | null
  sale: MembershipSale | null
}

// GET /api/memberships → each row carries the tier name for the list table.
export interface MembershipListRow extends MembershipBase {
  tierName: string
}

// GET /api/memberships → the rows, and the branch the list was rendered for.
export interface MembershipListData {
  branchId: string
  memberships: MembershipListRow[]
}

// A tier: a starting template for a sale, shared by every branch and never
// shown to customers (multi-branch R9). Hours are stored as minutes.
export interface MembershipTier {
  id: string
  name: string
  slug: string
  description: string | null
  defaultHoursMinutes: number
  defaultPricePaise: number
  defaultValidityDays: number
  /** Tax classification; only the Developer changes it. */
  sacCode: string
  isActive: boolean
  displayOrder: number
}

// GET /api/membership-tiers → every tier in display order (the sale form keeps
// the active ones), and whether this person may change a tier's SAC code.
export interface MembershipTierList {
  tiers: MembershipTier[]
  canEditTax: boolean
}

export interface MembershipSessionServiceRow {
  bookingId: string
  serviceId: string
  serviceNameSnapshot: string
  durationMinutes: number
  staffId: string | null
  staffName: string | null
  displayOrder: number
}

// A session as the active branch sees it. Another branch's session shows its
// date, branch, services and duration only.
export type MembershipSessionRow =
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
      services: Omit<MembershipSessionServiceRow, 'bookingId' | 'serviceId' | 'displayOrder'>[]
    }
  | {
      scope: 'other_branch'
      branchName: string
      bookingDate: string
      startTime: string
      endTime: string
      totalDurationMinutes: number
      status: string
      services: Pick<MembershipSessionServiceRow, 'serviceNameSnapshot' | 'durationMinutes'>[]
    }

// GET /api/memberships/[id] → membership + customer email + full tier + sessions,
// the branch the page renders for (writes send it back) and whether the person
// may cancel it from here.
export interface MembershipDetailData extends MembershipBase {
  branchId: string
  customerEmail: string
  tier: MembershipTier
  canCancel: boolean
  cancelRefusal: string | null
  sessions: MembershipSessionRow[]
}

// A customer row from GET /api/customers?q= (subset used by the picker).
export interface CustomerSearchRow {
  id: string
  name: string
  email: string
  phone: string | null
}

// A SPA service option for the record-session modal, from GET /api/services.
export interface ServiceOption {
  id: string
  name: string
  durationMinutes: number
}

// A staff option for the record-session modal, from GET /api/staff with a
// slot starting now, or at the time a session is booked for: `busy` says why
// they can't take the session.
export interface StaffOption {
  busy?: StaffBusy | null
  id: string
  name: string
  designation: string
}

export const MEMBERSHIP_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

export const MEMBERSHIP_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
] as const

export type MembershipPaymentMethod = (typeof MEMBERSHIP_PAYMENT_METHODS)[number]['value']

// The minutes a membership can still give a new session: neither used nor
// held for a session booked or in progress. Never negative.
export function freeMinutesOf(m: {
  totalHoursMinutes: number
  usedHoursMinutes: number
  reservedMinutes?: number
}): number {
  return Math.max(
    0,
    remainingMinutes(m.totalHoursMinutes, m.usedHoursMinutes, m.reservedMinutes ?? 0),
  )
}

// Minutes → "Xh Ym" (e.g. 90 → "1h 30m", 480 → "8h 0m"). Never negative.
export function minutesToHM(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  return `${hours}h ${mins}m`
}

// Whole days from now until the (end-of-day) expiry instant, IST-agnostic since
// both ends are absolute instants. Negative once expired.
export function daysUntil(expiresAt: string, now: Date = new Date()): number {
  const expiryMs = new Date(expiresAt).getTime()
  const diffMs = expiryMs - now.getTime()
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000))
}

// Whole days from one 'YYYY-MM-DD' date to another (negative when `to` is
// earlier), or null when either is not a real date. The sale form uses it for
// the "(90 days)" summary.
export function daysBetweenISO(from: string, to: string): number | null {
  const pattern = /^\d{4}-\d{2}-\d{2}$/
  if (!(pattern.test(from) && pattern.test(to))) {
    return null
  }
  const fromMs = Date.parse(`${from}T00:00:00.000Z`)
  const toMs = Date.parse(`${to}T00:00:00.000Z`)
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return null
  }
  return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000))
}

// Rupees typed at the counter ("10000", "9,999.50") → integer paise, or null
// when the text is not an amount with at most two decimals.
export function rupeesToPaise(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null
  }
  const [whole = '0', fraction = ''] = cleaned.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

// Paise → the rupee text a price field starts with (1000000 → "10000",
// 99950 → "999.50"); empty for ₹0, which a custom tier uses for "agree it".
export function paiseToRupeesText(paise: number): string {
  if (!Number.isInteger(paise) || paise <= 0) {
    return ''
  }
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2)
}

// Why the sale form can't be submitted yet, checked against the same limits
// as the server (MS-15, MS-16), or null when the sale is ready. `pricePaise`
// is null while the typed price isn't an amount.
export function saleFormProblem(sale: {
  hours: number
  pricePaise: number | null
  startDate: string
  expiresOn: string
  today: string
}): string | null {
  const limits = MEMBERSHIP_SALE_LIMITS
  if (!Number.isInteger(sale.hours) || sale.hours < limits.minHours) {
    return 'Sell at least 1 whole hour.'
  }
  if (sale.hours > limits.maxHours) {
    return `Sell at most ${limits.maxHours} hours.`
  }
  if (sale.pricePaise === null || sale.pricePaise <= 0) {
    return 'Enter the agreed price.'
  }
  if (sale.pricePaise > limits.maxPricePaise) {
    return 'That price is higher than a membership allows.'
  }
  const ahead = daysBetweenISO(sale.today, sale.startDate)
  if (ahead === null) {
    return 'Choose the start date.'
  }
  if (ahead < 0) {
    return 'A membership cannot start in the past.'
  }
  if (ahead > limits.maxStartDaysAhead) {
    return `A membership can start at most ${limits.maxStartDaysAhead} days ahead.`
  }
  const validity = daysBetweenISO(sale.startDate, sale.expiresOn)
  if (validity === null) {
    return 'Choose the expiry date.'
  }
  if (validity <= 0) {
    return 'The expiry date must be after the start date.'
  }
  if (validity > limits.maxValidityDays) {
    return `A membership can last at most ${limits.maxValidityDays} days.`
  }
  return null
}

// Today's date as YYYY-MM-DD in IST, for the create form's default start date.
export function todayISTDateString(now: Date = new Date()): string {
  const istMs = now.getTime() + (5 * 60 + 30) * 60 * 1000
  return new Date(istMs).toISOString().slice(0, 10)
}
