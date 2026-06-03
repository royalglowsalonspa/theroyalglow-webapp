/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : bookings
 * Scope        : Admin — Bookings
 *
 * Description  : Shared types and formatting helpers for the admin booking
 *                management pages. Mirrors the booking API response shapes.
 *
 * Responsibilities :
 * - Define TypeScript interfaces for admin booking data
 * - Provide INR currency formatting (Indian numbering system)
 * - Provide date and time formatting helpers (DD/MM/YYYY, 12h)
 *
 * Features / Functionality :
 * - AdminBooking / AdminBookingServiceRow / StaffMember types
 * - formatINR() / formatINRWithPaise() — Indian currency display
 * - formatDateDDMMYYYY() / formatTime12h() — date/time formatting
 * - SERVICE_TYPE_LABEL constant
 *
 * Tech Stack   : TypeScript
 * Layer        : Data Fetching
 *
 * Dependencies : None
 *
 * Notes        : None
 ************************************************************/

// Shared types + formatting helpers for the admin booking pages.
// Mirrors the GET /api/admin/bookings + /api/admin/bookings/[id] responses.

export interface AdminBookingServiceRow {
  id: string
  serviceNameSnapshot: string
  priceAtBookingPaise: number
  durationMinutes: number
  staffId: string | null
}

export interface AdminBooking {
  id: string
  bookingNumber: string
  status: string
  serviceType: 'salon' | 'spa'
  bookingDate: string
  startTime: string
  endTime: string
  totalAmountPaise: number
  customerName: string
  customerEmail: string
  notes: string | null
  rejectionReason?: string | null
  cancellationReason?: string | null
  isWalkin?: boolean
  services: AdminBookingServiceRow[]
}

export interface StaffMember {
  id: string
  name: string
  designation: string
}

// Indian currency, no decimals for the clean admin tables (₹1,499).
export function formatINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100)
}

// Indian currency with paise for invoice-style totals (₹1,499.00).
export function formatINRWithPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100)
}

// "2026-05-24T00:00:00.000Z" or "2026-05-24" → "24/05/2026"
export function formatDateDDMMYYYY(value: string): string {
  const datePart = value.slice(0, 10)
  const [y, m, d] = datePart.split('-')
  if (y && m && d) {
    return `${d}/${m}/${y}`
  }
  return value
}

// "15:30" or "15:30:00" → "03:30 PM"
export function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const m = mStr ?? '00'
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${String(h12).padStart(2, '0')}:${m} ${period}`
}

export const SERVICE_TYPE_LABEL: Record<string, string> = {
  salon: 'Salon',
  spa: 'SPA',
}
