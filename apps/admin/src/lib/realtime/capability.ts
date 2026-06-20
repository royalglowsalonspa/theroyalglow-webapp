/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ably capability builder
 * Scope        : Realtime
 *
 * Description  : Pure builder for the admin Ably token capability map. Grants
 *                subscribe-only access scoped to the admin realtime channel set.
 *                No I/O — kept pure so it is property-testable (Property 6).
 *
 * Responsibilities :
 * - Produce the capability map granted to Receptionist+ admin tokens
 * - Guarantee subscribe-only operations on admin-scoped channels only
 *
 * Features / Functionality :
 * - buildAdminAblyCapability() — returns channel → ['subscribe'] map
 *
 * Tech Stack   : TypeScript
 * Layer        : API Infrastructure (pure)
 *
 * Dependencies : none
 *
 * Notes        : Channels mirror features.md Ably channel set:
 *                admin:bookings:*, admin:schedule:*, admin:leave, booking:*
 ************************************************************/

// Ably capability map: channel/namespace → allowed operations. The admin token
// is subscribe-only (read-only realtime); server-side publishing is a later
// phase and is intentionally not granted here.
export type AblyCapability = Record<string, ['subscribe']>

// The exact admin channel set the admin portal subscribes to (Req 8.1). Frozen
// so callers cannot mutate the canonical list at runtime.
export const ADMIN_ABLY_CHANNELS = [
  'admin:bookings:*',
  'admin:schedule:*',
  'admin:leave',
  'booking:*',
] as const

// Pure: build the subscribe-only, admin-scoped capability map. Takes no input
// and performs no I/O so it can be unit/property tested directly (Property 6).
export function buildAdminAblyCapability(): AblyCapability {
  const capability: AblyCapability = {}
  for (const channel of ADMIN_ABLY_CHANNELS) {
    capability[channel] = ['subscribe']
  }
  return capability
}
