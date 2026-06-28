/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : admin realtime channel names
 * Scope        : Realtime
 *
 * Description  : Pure builders for the concrete admin Ably channel names the
 *                admin portal subscribes to. These are the identical channel
 *                names/event schemas used by the current web deployment
 *                (see ably-channels.md): admin:bookings:{branchId},
 *                admin:schedule:{YYYY-MM-DD}, admin:leave.
 *
 * Responsibilities :
 * - Build the per-branch bookings channel name
 * - Build the per-date schedule channel name
 * - Expose the shared leave channel name
 * - Expose the canonical event-name sets per channel (extensible wiring)
 *
 * Features / Functionality :
 * - adminBookingsChannel(branchId) — `admin:bookings:{branchId}`
 * - adminScheduleChannel(date)     — `admin:schedule:{YYYY-MM-DD}`
 * - customerBookingsChannel(userId) — `customer:{userId}:bookings`
 * - ADMIN_LEAVE_CHANNEL            — `admin:leave`
 *
 * Tech Stack   : TypeScript
 * Layer        : Realtime (pure helpers)
 *
 * Dependencies : none
 *
 * Notes        : No I/O — kept pure so channel naming stays a single source of
 *                truth shared by the provider and any consumer hooks. The
 *                wildcard token capability (admin:bookings:*, admin:schedule:*)
 *                authorises these exact channels (see capability.ts).
 ************************************************************/

// Shared leave channel — every admin role with leave-review access subscribes
// here on the /leave page. Matches the token capability `admin:leave`.
export const ADMIN_LEAVE_CHANNEL = 'admin:leave' as const

// Per-branch bookings channel. Matches the token capability `admin:bookings:*`.
export function adminBookingsChannel(branchId: string): string {
  return `admin:bookings:${branchId}`
}

// Per-customer bookings channel — the channel a customer token authorises (the
// customer token grants `customer:{userId}:*`). Admin booking publishers ALSO
// fan booking events out here so the owning customer's view receives live
// status over a channel its token permits. Each event carries `data.bookingId`
// so a per-booking subscriber can filter to the booking it is showing. NOT an
// admin-subscribed channel — admins use adminBookingsChannel + `booking:*`.
export function customerBookingsChannel(userId: string): string {
  return `customer:${userId}:bookings`
}

// Per-date schedule channel keyed by an ISO `YYYY-MM-DD` date. Matches the
// token capability `admin:schedule:*`.
export function adminScheduleChannel(date: string): string {
  return `admin:schedule:${date}`
}

// Canonical event names per channel (mirrors ably-channels.md). Consumers wire
// handlers against these; the provider stays event-schema-agnostic so new
// events can be added without touching the connection layer.
export const ADMIN_BOOKINGS_EVENTS = [
  'booking.new',
  'booking.status_changed',
  'booking.walkin_created',
  'booking.cancelled',
  'booking.no_show',
] as const

export const ADMIN_SCHEDULE_EVENTS = [
  'slot.booked',
  'slot.released',
  'staff.marked_off',
  'leave.approved',
] as const

export const ADMIN_LEAVE_EVENTS = ['leave.requested', 'leave.withdrawn'] as const
