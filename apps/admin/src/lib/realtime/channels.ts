/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 30-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : admin realtime channel names
 * Scope        : Realtime
 *
 * Description  : Pure builders for the concrete Ably channel names the admin
 *                portal publishes to and subscribes to. Every staff-facing
 *                channel names its branch (multi-branch design §3), so a token
 *                can authorize exactly the branches a person works at:
 *                  admin:bookings:{branchId}
 *                  admin:schedule:{branchId}:{YYYY-MM-DD}
 *                  admin:leave:{branchId}
 *                  booking:{branchId}:{bookingId}
 *                The customer's own feed stays per customer.
 *
 * Responsibilities :
 * - Build the per-branch bookings, schedule and leave channel names
 * - Build the per-booking channel name, qualified by its branch
 * - Build the per-customer bookings channel name
 * - Expose the canonical event-name sets per channel (extensible wiring)
 *
 * Tech Stack   : TypeScript
 * Layer        : Realtime (pure helpers)
 *
 * Dependencies : none
 *
 * Notes        : No I/O — kept pure so channel naming stays a single source of
 *                truth shared by the publisher, the provider and the token
 *                capability (capability.ts). The legacy unqualified names
 *                (`booking:{id}`, `admin:leave`, `admin:schedule:{date}`) are
 *                gone; nothing publishes to or authorizes them.
 ************************************************************/

// Per-branch bookings feed (the dashboard and booking lists).
export function adminBookingsChannel(branchId: string): string {
  return `admin:bookings:${branchId}`
}

// Per-branch schedule channel for one IST date (YYYY-MM-DD).
export function adminScheduleChannel(branchId: string, date: string): string {
  return `admin:schedule:${branchId}:${date}`
}

// Per-branch leave queue.
export function adminLeaveChannel(branchId: string): string {
  return `admin:leave:${branchId}`
}

// One booking's channel, under its branch so only that branch's staff can
// subscribe (design §3: `booking:{branchId}:{bookingId}`).
export function bookingChannel(branchId: string, bookingId: string): string {
  return `booking:${branchId}:${bookingId}`
}

// Per-customer bookings channel — the channel a customer token authorises (the
// customer token grants `customer:{userId}:*`). Admin booking publishers ALSO
// fan booking events out here so the owning customer's view receives live
// status over a channel its token permits. Each event carries `data.bookingId`
// so a per-booking subscriber can filter to the booking it is showing. NOT an
// admin-subscribed channel.
export function customerBookingsChannel(userId: string): string {
  return `customer:${userId}:bookings`
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
