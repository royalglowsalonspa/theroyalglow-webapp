/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 25-06-2026 & Updated - 25-06-2026
 *
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : RealtimeProvider (customer)
 * Scope        : Realtime (client)
 *
 * Description  : Client realtime provider for the customer site. Lazily creates
 *                an Ably Realtime client authenticated via the customer token
 *                route (POST /api/ably/token) and exposes a subscribe primitive
 *                + consumer hooks so a booking view can subscribe to the
 *                viewer's `customer:{userId}:bookings` channel (the channel the
 *                customer token authorises) and reflect status changes live,
 *                filtering events by `data.bookingId`. Mounted ONLY around the
 *                booking views that need it — NOT globally — so no Ably
 *                connection is opened on pages that don't use realtime.
 *
 * Responsibilities :
 * - Authenticate via authCallback against POST /api/ably/token
 * - Expose subscribe(channel, event, handler) + useRealtimeChannel/useBookingStatus
 * - Replay subscriptions on (re)connect so they survive a transport drop
 * - Degrade gracefully when realtime is unconfigured (503) or `ably` absent
 *
 * Features / Functionality :
 * - React context + useRealtime() / useRealtimeChannel() / useBookingStatus()
 * - No-op (children render normally) when realtime is unavailable so the page's
 *   normal fetch-based status keeps working
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript, Ably (opt.)
 * Layer        : Presentation (Realtime provider)
 *
 * Dependencies : @/lib/realtime/client, @/lib/realtime/channels, React
 *
 * Notes        : 'use client'. Token Auth only — the browser never holds a
 *                publish key. The customer token grants subscribe to
 *                `customer:{userId}:*` (and `admin:*` for admins) only; the
 *                booking view subscribes to `customer:{userId}:bookings` (which
 *                the token authorises) and filters events by `data.bookingId`.
 *                If realtime is unavailable the page silently falls back to its
 *                fetched status — the connection itself stays optional.
 ************************************************************/

'use client'

import { BOOKING_EVENTS, customerBookingsChannel } from '@/lib/realtime/channels'
import {
  type AblyMessage,
  type AblyMessageListener,
  type AblyRealtimeClient,
  loadAblyRealtime,
} from '@/lib/realtime/client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

// Public connection status exposed to consumers.
// - connecting   : establishing / re-establishing the connection
// - connected    : live, subscriptions active
// - disconnected : connection lost, reconnecting
// - unavailable  : realtime not configured (503) or `ably` not installed
export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'unavailable'

type RealtimeContextValue = {
  status: RealtimeStatus
  /**
   * Subscribe a handler to a channel event. Returns an unsubscribe cleanup.
   * Safe to call before the connection is live — the registry replays
   * subscriptions once connected and on every recovery.
   */
  subscribe: (channel: string, event: string, handler: AblyMessageListener) => () => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

// Internal registry entry: one live subscription we must (re)attach.
type Registration = { channel: string; event: string; handler: AblyMessageListener }

type RealtimeProviderProps = {
  children: React.ReactNode
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const [status, setStatus] = useState<RealtimeStatus>('connecting')

  // Live Ably client (null until connected / when unavailable).
  const clientRef = useRef<AblyRealtimeClient | null>(null)
  // Every active subscription, so we can replay them all on recovery.
  const registrationsRef = useRef<Registration[]>([])

  // Attach a single registration to the live client (no-op if not connected).
  const attach = useCallback((reg: Registration) => {
    const client = clientRef.current
    if (!client) {
      return
    }
    client.channels.get(reg.channel).subscribe(reg.event, reg.handler)
  }, [])

  // Public subscribe: record the registration and attach it if already live.
  const subscribe = useCallback<RealtimeContextValue['subscribe']>(
    (channel, event, handler) => {
      const reg: Registration = { channel, event, handler }
      registrationsRef.current.push(reg)
      attach(reg)

      return () => {
        registrationsRef.current = registrationsRef.current.filter((r) => r !== reg)
        const client = clientRef.current
        if (client) {
          client.channels.get(channel).unsubscribe(event, handler)
        }
      }
    },
    [attach],
  )

  // Replay every registration — used on (re)connect so subscriptions survive a
  // transport drop even if the channel had to be re-attached.
  const resubscribeAll = useCallback(() => {
    for (const reg of registrationsRef.current) {
      attach(reg)
    }
  }, [attach])

  // ── Connection lifecycle ────────────────────────────────────────────────
  // Lazily create the Ably client once on mount. Token Auth via authCallback.
  useEffect(() => {
    let cancelled = false
    let client: AblyRealtimeClient | null = null

    async function connect() {
      const Realtime = await loadAblyRealtime()
      // Optional dependency missing → degrade gracefully (page uses fetch).
      if (!Realtime || cancelled) {
        if (!cancelled) {
          setStatus('unavailable')
        }
        return
      }

      client = new Realtime({
        autoConnect: true,
        closeOnUnload: true,
        realtimeRequestTimeout: 2000,
        disconnectedRetryTimeout: 2000,
        authCallback: (_tokenParams, callback) => {
          // Fetch a subscribe-only customer token from the local token route and
          // unwrap the { success, data } envelope. A 503 (realtime not
          // configured) or any error flows back as an auth error → the
          // connection fails and we degrade to "unavailable".
          fetch('/api/ably/token', {
            method: 'POST',
            headers: { accept: 'application/json' },
          })
            .then(async (res) => {
              if (!res.ok) {
                throw new Error(`token route ${res.status}`)
              }
              const json = (await res.json()) as { success?: boolean; data?: unknown }
              if (!json.success || json.data == null) {
                throw new Error('token route returned no token')
              }
              callback(null, json.data)
            })
            .catch((error) => {
              callback(error, null)
            })
        },
      })

      if (cancelled) {
        client.close()
        return
      }

      clientRef.current = client

      // Connected: (re)attach all subscriptions.
      client.connection.on('connected', () => {
        if (cancelled) {
          return
        }
        setStatus('connected')
        resubscribeAll()
      })

      // Connection lost / retrying.
      client.connection.on(['disconnected', 'suspended'], () => {
        if (cancelled) {
          return
        }
        setStatus('disconnected')
      })

      // Terminal failure (e.g. token route 503) → unavailable.
      client.connection.on(['failed', 'closed'], () => {
        if (cancelled) {
          return
        }
        setStatus('unavailable')
      })
    }

    connect()

    return () => {
      cancelled = true
      const live = clientRef.current
      if (live) {
        live.connection.off()
        live.close()
      }
      clientRef.current = null
    }
  }, [resubscribeAll])

  const value = useMemo<RealtimeContextValue>(() => ({ status, subscribe }), [status, subscribe])

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

// Access the realtime connection status + subscribe primitive. Returns null
// when used outside a RealtimeProvider so consumers can no-op safely.
export function useRealtime(): RealtimeContextValue | null {
  return useContext(RealtimeContext)
}

// Convenience hook: subscribe a view to one channel's events for its lifetime.
// `handlers` maps event name → listener. Re-subscribes if the channel changes
// and is automatically replayed by the provider on connection recovery. No-ops
// when used outside a provider (realtime unavailable).
export function useRealtimeChannel(
  channel: string | null,
  handlers: Record<string, AblyMessageListener>,
): void {
  const ctx = useContext(RealtimeContext)
  // Keep the latest handlers without resubscribing on every render.
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!(ctx && channel)) {
      return
    }
    const events = Object.keys(handlersRef.current)
    const cleanups = events.map((event) =>
      ctx.subscribe(channel, event, (message) => handlersRef.current[event]?.(message)),
    )
    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
    // Re-run when the channel changes or the provider's subscribe identity
    // changes (stable across renders via useCallback).
  }, [ctx, channel])
}

// Subscribe a booking view to the VIEWER's own `customer:{userId}:bookings`
// channel — the only booking channel a customer token authorises (the token
// grants `customer:{userId}:*`). The server fans every booking lifecycle event
// (created, status_changed, completed, assigned) out to this channel stamped
// with `data.bookingId`, so we filter to the booking being viewed and invoke
// `onEvent` (typically a re-fetch) only when `data.bookingId === bookingId`.
//
// Pass a null/empty userId or bookingId to subscribe to nothing — the view then
// relies on its normal fetch for status. Safe outside a provider (no-ops).
export function useBookingStatus(
  userId: string | null | undefined,
  bookingId: string | null | undefined,
  onEvent: (event: string, message: AblyMessage) => void,
): void {
  // Keep the latest callback without resubscribing on every render.
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  // Subscribe to the viewer's own channel — never the per-booking channel, which
  // a customer token does not authorise.
  const channel = userId ? customerBookingsChannel(userId) : null

  const handlers = useMemo<Record<string, AblyMessageListener>>(() => {
    const map: Record<string, AblyMessageListener> = {}
    for (const event of BOOKING_EVENTS) {
      map[event] = (message) => {
        // The channel is shared across all of this customer's bookings, so only
        // react to messages stamped with the booking this view is showing.
        const data = message.data as { bookingId?: unknown } | null | undefined
        if (!bookingId || data?.bookingId !== bookingId) {
          return
        }
        onEventRef.current(event, message)
      }
    }
    return map
  }, [bookingId])

  useRealtimeChannel(channel, handlers)
}
