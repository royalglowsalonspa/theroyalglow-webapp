/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : memberships
 * Scope        : Admin — Memberships
 *
 * Description  : Shared types, formatting helpers, and constants for the admin
 *                SPA membership management pages and record-session modal.
 *
 * Responsibilities :
 * - Define TypeScript interfaces for membership list/detail/session data
 * - Provide time-based helpers (minutesToHM, daysUntil, previewExpiry)
 * - Provide filter and payment method option constants
 *
 * Features / Functionality :
 * - MembershipListRow / MembershipDetailData / MembershipTier types
 * - minutesToHM() / daysUntil() / previewExpiryDDMMYYYY()
 * - todayISTDateString() for default form values
 * - MEMBERSHIP_STATUS_OPTIONS / MEMBERSHIP_PAYMENT_METHODS
 *
 * Tech Stack   : TypeScript
 * Layer        : Data Fetching
 *
 * Dependencies : ./bookings (formatINR, formatDateDDMMYYYY)
 *
 * Notes        : None
 ************************************************************/

// Shared types + formatting helpers for the admin membership pages.
// Mirrors the GET /api/admin/memberships, /api/admin/memberships/[id], and
// /api/admin/membership-tiers responses.

// Reuse the booking currency/date formatters so admin pages render money and
// dates identically (₹15,000 · DD/MM/YYYY).
export { formatDateDDMMYYYY, formatINR } from './bookings'

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
  pricePaidPaise: number
  startsAt: string
  expiresAt: string
  status: string
  invoiceId: string | null
  notes: string | null
  createdAt: string
  customerName: string
}

// GET /api/admin/memberships → each row carries the tier name for the list table.
export interface MembershipListRow extends MembershipBase {
  tierName: string
}

// GET /api/admin/membership-tiers → tier cards for the create form.
export interface MembershipTier {
  id: string
  name: string
  slug: string
  description: string | null
  defaultHoursMinutes: number
  defaultPricePaise: number
  defaultValidityDays: number
  isActive: boolean
  displayOrder: number
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

export interface MembershipSessionRow {
  id: string
  bookingNumber: string
  bookingDate: string
  startTime: string
  endTime: string
  totalDurationMinutes: number
  status: string
  services: MembershipSessionServiceRow[]
}

// GET /api/admin/memberships/[id] → membership + customer email + full tier + sessions.
export interface MembershipDetailData extends MembershipBase {
  customerEmail: string
  tier: MembershipTier
  sessions: MembershipSessionRow[]
}

// A customer row from GET /api/admin/customers?q= (subset used by the picker).
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

// A staff option for the record-session modal, from GET /api/admin/staff.
export interface StaffOption {
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

// Preview the expiry date for the create form: startDate (YYYY-MM-DD) + validityDays.
// Returns a DD/MM/YYYY string, or null when inputs are incomplete/invalid.
export function previewExpiryDDMMYYYY(startDate: string, validityDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(validityDays)) {
    return null
  }
  const start = new Date(`${startDate}T00:00:00.000Z`)
  if (Number.isNaN(start.getTime())) {
    return null
  }
  const expiry = new Date(start.getTime())
  expiry.setUTCDate(expiry.getUTCDate() + validityDays)
  const y = expiry.getUTCFullYear()
  const m = String(expiry.getUTCMonth() + 1).padStart(2, '0')
  const d = String(expiry.getUTCDate()).padStart(2, '0')
  return `${d}/${m}/${y}`
}

// Today's date as YYYY-MM-DD in IST, for the create form's default start date.
export function todayISTDateString(now: Date = new Date()): string {
  const istMs = now.getTime() + (5 * 60 + 30) * 60 * 1000
  return new Date(istMs).toISOString().slice(0, 10)
}
