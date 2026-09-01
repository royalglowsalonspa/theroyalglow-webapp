/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : realtime publish (web)
 * Scope        : Realtime
 *
 * Description  : Best-effort server-side Ably publisher for booking-status
 *                realtime events. Publishes the same event to a booking's own
 *                channel, the per-branch admin dashboard feed, and (when the
 *                owning customer is known) the customer's own bookings channel
 *                so customer and admin UIs update live (see ably-channels.md).
 *
 * Responsibilities :
 * - Publish a booking event to `booking:{bookingId}`,
 *   `admin:bookings:{branchId}`, and (when customerId is given)
 *   `customer:{customerId}:bookings` via the Ably REST HTTP API
 * - Stamp `bookingId` into the event payload so per-customer subscribers can
 *   filter the shared customer channel down to the booking they are viewing
 * - Never throw / never block the originating request (best-effort)
 * - No-op gracefully when realtime is not configured
 *
 * Features / Functionality :
 * - publishBookingEvent({ bookingId, branchId, event, data }) — fan-out publish
 * - HTTP Basic auth built from ABLY_PRIVATE_KEY with the standard `btoa` Web API
 * - ~2s AbortSignal.timeout so a slow Ably never stalls the request
 *
 * Tech Stack   : TypeScript, Ably REST (over fetch)
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/logger
 *
 * Notes        :
 * - REST-over-fetch keeps each publish stateless and short-lived in AWS Lambda
 *   request handling; one HTTPS POST is sufficient for each message.
 * - Credentials are base64-encoded with the standard `btoa` Web API, avoiding
 *   an unnecessary Node-specific Buffer dependency.
 * - Reads process.env.ABLY_PRIVATE_KEY directly (NOT env.ts) so it degrades
 *   gracefully — env.ts types the key as required and would fail validation
 *   when realtime is not yet provisioned. Absent key → silent no-op.
 ************************************************************/

import { createLogger } from '@rgss/logger'
import { customerBookingsChannel } from './channels'

const logger = createLogger({
  service: 'web:realtime:publish',
  environment: process.env.NODE_ENV ?? 'development',
})

// The short event verbs callers publish. Mirrors the documented booking event
// vocabulary (ably-channels.md) without coupling to a specific channel schema.
export type BookingEvent = 'created' | 'status_changed' | 'completed' | 'assigned'

type PublishBookingEventInput = {
  // The booking this event is about. When present, publishes to `booking:{id}`
  // and is stamped into the event payload as `data.bookingId` so subscribers on
  // the shared customer channel can filter to the right booking.
  bookingId?: string | null
  // The branch the booking belongs to. When present, publishes to the admin
  // dashboard feed `admin:bookings:{branchId}`.
  branchId?: string | null
  // The owning customer's user id. When present, ALSO publishes to that
  // customer's own channel `customer:{customerId}:bookings` — the only booking
  // channel a customer token authorises (token grants `customer:{userId}:*`).
  customerId?: string | null
  // Short event verb, e.g. 'created' | 'status_changed' | 'completed' | 'assigned'.
  event: BookingEvent
  // Minimal JSON-serialisable payload (e.g. { status }). Kept small on purpose —
  // subscribers re-fetch authoritative detail; the event is just a nudge.
  data?: Record<string, unknown>
}

// ~2s ceiling: realtime is a nice-to-have, never worth stalling the user's
// request for. AbortSignal.timeout is supported by the AWS Lambda runtime.
const PUBLISH_TIMEOUT_MS = 2000

// POST one message to a single Ably channel over REST. Resolves to a boolean
// purely for internal logging; callers treat the whole publish as fire-and-
// forget. NEVER throws — any failure is swallowed and logged.
async function publishToChannel(
  apiKey: string,
  channelName: string,
  event: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    // ABLY_PRIVATE_KEY is `keyName:keySecret`; the REST API authenticates with
    // HTTP Basic where the whole key string is the credential. `btoa` provides
    // the required base64 encoding without a Node-specific Buffer dependency.
    const authorization = `Basic ${btoa(apiKey)}`

    // URL-encode the channel name — it contains ':' and may carry ids that are
    // not URL-safe, so encode the whole path segment.
    const url = `https://rest.ably.io/channels/${encodeURIComponent(channelName)}/messages`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      // Ably REST message shape: { name, data }.
      body: JSON.stringify({ name: event, data }),
      signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
    })

    if (!res.ok) {
      logger.warn('ably publish returned non-OK status', {
        channel: channelName,
        event,
        status: res.status,
      })
      return false
    }
    return true
  } catch (error) {
    logger.warn('ably publish failed', {
      channel: channelName,
      event,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

// Best-effort: publish a booking event to the booking's own channel, the
// per-branch admin feed, and (when the owning customer is known) the customer's
// own bookings channel. Awaiting this is safe — it resolves quietly whether or
// not the publish succeeded and NEVER throws, so callers can await it inline at
// a status-transition point without a failure ever changing the API response.
//
// No-ops entirely when ABLY_PRIVATE_KEY is unset (realtime not configured) and
// skips a channel when its id is absent.
export async function publishBookingEvent(input: PublishBookingEventInput): Promise<void> {
  const apiKey = process.env.ABLY_PRIVATE_KEY
  // Not configured → silent no-op (graceful degradation; subscribers poll).
  if (!apiKey) {
    return
  }

  // Stamp bookingId into the payload so subscribers on the shared per-customer
  // channel can filter to the booking they are viewing (data.bookingId === id).
  const data: Record<string, unknown> = input.bookingId
    ? { ...input.data, bookingId: input.bookingId }
    : { ...input.data }

  const channels: string[] = []
  if (input.bookingId) {
    channels.push(`booking:${input.bookingId}`)
  }
  if (input.branchId) {
    channels.push(`admin:bookings:${input.branchId}`)
  }
  if (input.customerId) {
    // The owning customer's own channel — the channel their token authorises.
    channels.push(customerBookingsChannel(input.customerId))
  }
  if (channels.length === 0) {
    return
  }

  // Publish to all channels concurrently. Promise.allSettled can never reject,
  // reinforcing the never-throw contract even though publishToChannel already
  // swallows its own errors.
  await Promise.allSettled(
    channels.map((channel) => publishToChannel(apiKey, channel, input.event, data)),
  )
}
