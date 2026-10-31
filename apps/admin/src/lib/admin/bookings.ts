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
 * - staffBusyNote() / staffBusyBlocks() / staffOptionLabel() — why a picker
 *   option can't take the slot, and whether it is refused
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
// Mirrors the GET /api/bookings + /api/bookings/[id] responses.

export interface AdminBookingServiceRow {
  id: string
  serviceNameSnapshot: string
  priceAtBookingPaise: number
  durationMinutes: number
  staffId: string | null
  /** The assignee's name; null when nobody is assigned. */
  staffName?: string | null
}
/** Why a booking lost its assignee (multi-branch R1.7, MS-09). */
export type ReassignmentReason = 'left_branch' | 'unavailable' | 'overrun' | 'off_schedule'
/** A booking waiting for someone else to take it. */
export interface AdminBookingReassignment {
  reason: ReassignmentReason
  previousStaffName: string | null
  /**
   * Held up, not taken off: its person is still with another customer and
   * still assigned (slice 2b). Reception waits or assigns someone else.
   */
  heldUp?: boolean
  /** ISO timestamp of when the assignee was taken off, or the hold-up flagged. */
  since: string
}
/** What reception reads about a booking that needs someone else. */
export function reassignmentReasonText(work: {
  reason: ReassignmentReason
  previousStaffName: string | null
  heldUp?: boolean | undefined
}): string {
  const who = work.previousStaffName ?? 'The person assigned'
  switch (work.reason) {
    case 'left_branch':
      return `${who} no longer works at this branch.`
    case 'unavailable':
      return `${who} is on approved leave that day.`
    case 'off_schedule':
      return `${who} isn’t scheduled to work then.`
    case 'overrun':
      // Held up: still with another customer when this one was due (slice
      // 2b). Otherwise they were booked then: the 0028 backfill found them
      // booked twice at once, or the booking moved onto a time they're
      // booked (MS-09).
      return work.heldUp
        ? `${who} is still with another customer, so this booking can’t start yet.`
        : `${who} is busy with another customer at that time.`
  }
}
/** What to tell the person whose change took people off bookings, or null. */
export function reassignmentsNotice(count: unknown): string | null {
  if (typeof count !== 'number' || count <= 0) {
    return null
  }
  return count === 1
    ? '1 booking needs someone else. It’s listed on the dashboard.'
    : `${count} bookings need someone else. They’re listed on the dashboard.`
}
/** The booking's assignee(s), or null when nobody is assigned to some service. */
export function assigneeLabel(services: readonly AdminBookingServiceRow[]): string | null {
  if (services.length === 0 || services.some((s) => s.staffId === null)) {
    return null
  }
  const names = [...new Set(services.map((s) => s.staffName ?? 'Unknown'))]
  return names.join(', ')
}

export interface AdminBooking {
  id: string
  /** The booking's branch; every write sends it back as the rendered branch. */
  branchId: string
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
  /** A SPA membership session: paid for with the membership's minutes. */
  isMembershipSession?: boolean
  spaMembershipId?: string | null
  totalDurationMinutes?: number
  /** When the booking actually started; null until it is started. */
  startedAt?: string | null
  services: AdminBookingServiceRow[]
  /** Open reassignment work, or null (multi-branch R1.7). */
  reassignment?: AdminBookingReassignment | null
}

/**
 * Why a person can't take the slot a picker asked about (GET /api/staff with
 * a slot; membership-scheduling.md slice 2b). Times are IST, HH:MM.
 */
export type StaffBusy =
  | { reason: 'on_leave' }
  | { reason: 'off_schedule' }
  | { reason: 'booked'; from: string; to: string }
  | { reason: 'working'; since: string }

export interface StaffMember {
  id: string
  name: string
  designation: string
  /** Present when the picker asked about a slot; null when they're free. */
  busy?: StaffBusy | null
}

/** The note a staff picker shows beside someone who can't take the slot, or null. */
export function staffBusyNote(busy: StaffBusy | null | undefined): string | null {
  switch (busy?.reason) {
    case 'on_leave':
      return 'On leave'
    case 'off_schedule':
      return 'Not scheduled then'
    case 'booked':
      return `Booked ${formatTime12h(busy.from)}–${formatTime12h(busy.to)}`
    case 'working':
      return `With a customer since ${formatTime12h(busy.since)}`
    default:
      return null
  }
}

/**
 * Whether a picker refuses someone, as the database would: on leave or
 * booked then always; still with another customer only when the work starts
 * now (a running booking, or Record now), when reception can't wait for
 * them; not scheduled then only for work planned ahead (the schedule plans,
 * so work starting now isn't refused for it). Otherwise reception may assign
 * them.
 */
export function staffBusyBlocks(
  busy: StaffBusy | null | undefined,
  { startsNow }: { startsNow: boolean },
): boolean {
  switch (busy?.reason) {
    case undefined:
      return false
    case 'working':
      return startsNow
    case 'off_schedule':
      return !startsNow
    default:
      return true
  }
}

/** A picker option's label: name, title, and why they can't take the slot. */
export function staffOptionLabel(member: StaffMember): string {
  const note = staffBusyNote(member.busy)
  return `${member.name} (${member.designation})${note ? ` · ${note}` : ''}`
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
