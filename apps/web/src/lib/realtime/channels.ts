/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : customer realtime channel names
 * Scope        : Realtime
 *
 * Description  : Pure builders for the concrete customer-facing Ably channel
 *                names the customer site subscribes to. Mirrors the admin
 *                channels helper. Customer booking live-status flows over
 *                `customer:{userId}:bookings` (the token-authorised channel — the
 *                customer token grants `customer:{userId}:*`), which the server
 *                publishes to from apps/web/src/lib/realtime/publish.ts. The
 *                per-booking `booking:{bookingId}` channel also exists (admin +
 *                assigned staff feed) but a customer token does NOT authorise it.
 *
 * Responsibilities :
 * - Build the per-customer bookings channel name (token-authorised for customers)
 * - Build the per-booking channel name
 * - Expose the canonical event-name set the server publishes to those channels
 *
 * Features / Functionality :
 * - customerBookingsChannel(userId) — `customer:{userId}:bookings`
 * - bookingChannel(id) — `booking:{bookingId}`
 * - BOOKING_EVENTS — the event verbs publishBookingEvent emits
 *
 * Tech Stack   : TypeScript
 * Layer        : Realtime (pure helpers)
 *
 * Dependencies : none
 *
 * Notes        : No I/O — kept pure so channel naming stays a single source of
 *                truth shared by the provider and any consumer hooks. The event
 *                verbs mirror BookingEvent in publish.ts exactly.
 ************************************************************/

// Per-customer bookings channel — the ONLY booking channel a customer token
// authorises (the token grants `customer:{userId}:*`). Customer booking
// live-status flows here: the server publishes booking lifecycle events to this
// channel (publish.ts), each carrying `data.bookingId` so a per-booking view can
// filter to the one booking it is showing. `booking:{bookingId}` (below) is the
// per-booking channel for admin + assigned staff and is NOT customer-authorised.
export function customerBookingsChannel(userId: string): string {
  return `customer:${userId}:bookings`
}

// Per-booking channel. The server publishes booking lifecycle events here via
// publishBookingEvent (publish.ts → `booking:{bookingId}`).
export function bookingChannel(bookingId: string): string {
  return `booking:${bookingId}`
}

// Canonical event names the server emits on `booking:{bookingId}`. Mirrors the
// BookingEvent union in publish.ts so subscribers stay in lockstep with the
// publisher. Consumers wire handlers against these verbs.
export const BOOKING_EVENTS = ['created', 'status_changed', 'completed', 'assigned'] as const

export type BookingEventName = (typeof BOOKING_EVENTS)[number]
