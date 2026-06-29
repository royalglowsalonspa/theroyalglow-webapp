/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : RealtimeProvider
 * Scope        : Realtime (client)
 *
 * Description  : Client realtime provider for the admin portal. Lazily creates
 *                an Ably Realtime client authenticated via the admin token
 *                route (POST /api/ably/token, subscribe-only admin tokens) and
 *                subscribes to the admin channels with the identical channel
 *                names / event schemas used by the current web deployment.
 *                Surfaces a "reconnecting" indicator within 2s of connection
 *                loss and re-subscribes to all channels on recovery (Req 8.5).
 *
 * Responsibilities :
 * - Authenticate via authCallback against POST /api/ably/token
 * - Subscribe to admin:bookings:{branchId}, admin:schedule:{date}, admin:leave
 * - Track connection state and drive the reconnect indicator (≤2s)
 * - Re-subscribe to every registered channel/event on recovery
 * - Degrade gracefully when realtime is unconfigured (503) or `ably` absent
 *
 * Features / Functionality :
 * - React context + useRealtime() / useRealtimeChannel() consumer hooks
 * - Extensible per-event subscription registry (no per-page rewiring)
 * - Instant offline detection via the browser `offline`/`online` events
 *
 * Tech Stack   : Next.js 16, React (Client Component), TypeScript, Ably (opt.)
 * Layer        : Presentation (Realtime provider)
 *
 * Dependencies : @/lib/realtime/client, @/lib/realtime/channels,
 *                ./reconnect-indicator, React
 *
 * Notes        : 'use client'. Token Auth only — the browser never holds a
 *                publish key. No-op (children render normally) when realtime is
 *                unavailable so NotificationBell polling keeps working.
 ************************************************************/

'use client'

import {
  ADMIN_BOOKINGS_EVENTS,
  ADMIN_LEAVE_CHANNEL,
  ADMIN_LEAVE_EVENTS,
  ADMIN_SCHEDULE_EVENTS,
  adminBookingsChannel,
  adminScheduleChannel,
} from '@/lib/realtime/channels'
import {
  type AblyMessage,
  type AblyMessageListener,
  type AblyRealtimeClient,
  loadAblyRealtime,
} from '@/lib/realtime/client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ReconnectIndicator } from './reconnect-indicator'

// Public connection status exposed to consumers.
// - connecting   : establishing / re-establishing the connection
// - connected    : live, subscriptions active
// - disconnected : connection lost, reconnecting (indicator visible)
// - unavailable  : realtime not configured (503) or `ably` not installed
export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'unavailable'

type RealtimeContextValue = {
  status: RealtimeStatus
  /** True while the connection is lost and the client is reconnecting. */
  reconnecting: boolean
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
  /** When set, auto-subscribe to `admin:bookings:{branchId}`. */
  branchId?: string
  /** When set (YYYY-MM-DD), auto-subscribe to `admin:schedule:{date}`. */
  scheduleDate?: string
  /** Optional sink for every admin event (minimal, extensible wiring). */
  onEvent?: (channel: string, message: AblyMessage) => void
  children: React.ReactNode
}

export function RealtimeProvider({
  branchId,
  scheduleDate,
  onEvent,
  children,
}: RealtimeProviderProps) {
  const [status, setStatus] = useState<RealtimeStatus>('connecting')
  const [reconnecting, setReconnecting] = useState(false)

  // Live Ably client (null until connected / when unavailable).
  const clientRef = useRef<AblyRealtimeClient | null>(null)
  // Every active subscription, so we can replay them all on recovery (Req 8.5).
  const registrationsRef = useRef<Registration[]>([])
  // Latest onEvent without retriggering the connection effect.
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

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
    // Tracks whether we were ever connected, so a later drop is a "reconnect"
    // rather than the initial connect.
    let hasConnected = false

    async function connect() {
      // Realtime is opt-in. When no public Ably key is configured (local dev,
      // or a self-host without realtime), skip the client entirely: the token
      // route returns 503 in that case and Ably would otherwise retry it every
      // couple of seconds forever, spamming the logs. Polling (NotificationBell
      // etc.) keeps working without it.
      if (!process.env.NEXT_PUBLIC_ABLY_KEY) {
        if (!cancelled) {
          setStatus('unavailable')
        }
        return
      }

      const Realtime = await loadAblyRealtime()
      // Optional dependency missing → degrade gracefully (polling continues).
      if (!Realtime || cancelled) {
        if (!cancelled) {
          setStatus('unavailable')
        }
        return
      }

      client = new Realtime({
        autoConnect: true,
        closeOnUnload: true,
        // Surface reconnection promptly without being trigger-happy. The
        // browser `offline` event below is the instant (<2s) signal; these
        // bound Ably's own detection window.
        realtimeRequestTimeout: 2000,
        disconnectedRetryTimeout: 2000,
        authCallback: (_tokenParams, callback) => {
          // Fetch a subscribe-only admin token from the local token route and
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
              // A 503 means realtime is intentionally not configured
              // (ABLY_PRIVATE_KEY unset). Stop Ably's retry storm: report the
              // auth failure, then close the client so it does not keep
              // re-requesting the token every couple of seconds.
              callback(error, null)
              if (String((error as Error)?.message ?? '').includes('503')) {
                if (!cancelled) {
                  setStatus('unavailable')
                }
                clientRef.current?.close()
              }
            })
        },
      })

      if (cancelled) {
        client.close()
        return
      }

      clientRef.current = client

      // Connected: (re)attach all subscriptions and clear the indicator.
      client.connection.on('connected', () => {
        if (cancelled) {
          return
        }
        hasConnected = true
        setStatus('connected')
        setReconnecting(false)
        resubscribeAll()
      })

      // Connection lost / retrying → show the reconnecting indicator. Once we
      // have connected at least once, any of these states means "reconnecting".
      client.connection.on(['disconnected', 'suspended'], () => {
        if (cancelled) {
          return
        }
        setStatus('disconnected')
        setReconnecting(true)
      })

      // 'connecting' after a prior connect is also a reconnect attempt.
      client.connection.on('connecting', () => {
        if (cancelled || !hasConnected) {
          return
        }
        setStatus('disconnected')
        setReconnecting(true)
      })

      // Terminal failure (e.g. token route 503) → unavailable, no indicator.
      client.connection.on(['failed', 'closed'], () => {
        if (cancelled) {
          return
        }
        setStatus('unavailable')
        setReconnecting(false)
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

  // ── Instant offline detection (guarantees the ≤2s reconnect indicator) ───
  // The browser fires `offline` the moment the network drops — well within 2s,
  // and faster than any transport timeout. `online` lets Ably resume; the
  // 'connected' handler clears the indicator once the socket is live again.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    function onOffline() {
      // Only flag when realtime is actually in use (not when unavailable).
      if (clientRef.current) {
        setReconnecting(true)
        setStatus('disconnected')
      }
    }
    function onOnline() {
      // Leave the indicator up until the connection re-establishes; nudge a
      // resubscribe in case Ably already silently resumed.
      if (clientRef.current) {
        resubscribeAll()
      }
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [resubscribeAll])

  // ── Auto-subscriptions (Req 8.2, 8.3) ────────────────────────────────────
  // Subscribe to the admin channels on mount using the canonical event sets.
  // admin:leave is always on; bookings/schedule subscribe when their id/date
  // is provided. A built-in dispatcher forwards to the optional onEvent sink;
  // page-level handlers extend via useRealtimeChannel without rewiring here.
  useEffect(() => {
    const cleanups: Array<() => void> = []

    const dispatch =
      (channel: string): AblyMessageListener =>
      (message) => {
        onEventRef.current?.(channel, message)
      }

    // admin:leave — global leave queue.
    for (const event of ADMIN_LEAVE_EVENTS) {
      cleanups.push(subscribe(ADMIN_LEAVE_CHANNEL, event, dispatch(ADMIN_LEAVE_CHANNEL)))
    }

    // admin:bookings:{branchId}
    if (branchId) {
      const channel = adminBookingsChannel(branchId)
      for (const event of ADMIN_BOOKINGS_EVENTS) {
        cleanups.push(subscribe(channel, event, dispatch(channel)))
      }
    }

    // admin:schedule:{YYYY-MM-DD}
    if (scheduleDate) {
      const channel = adminScheduleChannel(scheduleDate)
      for (const event of ADMIN_SCHEDULE_EVENTS) {
        cleanups.push(subscribe(channel, event, dispatch(channel)))
      }
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }, [branchId, scheduleDate, subscribe])

  const value = useMemo<RealtimeContextValue>(
    () => ({ status, reconnecting, subscribe }),
    [status, reconnecting, subscribe],
  )

  return (
    <RealtimeContext.Provider value={value}>
      {children}
      <ReconnectIndicator reconnecting={reconnecting} />
    </RealtimeContext.Provider>
  )
}

// Access the realtime connection status + subscribe primitive. Returns null
// when used outside a RealtimeProvider so consumers can no-op safely.
export function useRealtime(): RealtimeContextValue | null {
  return useContext(RealtimeContext)
}

// Convenience hook: subscribe a page to one channel's events for its lifetime.
// `handlers` maps event name → listener. Re-subscribes if the channel changes
// and is automatically replayed by the provider on connection recovery.
export function useRealtimeChannel(
  channel: string,
  handlers: Record<string, AblyMessageListener>,
): void {
  const ctx = useContext(RealtimeContext)
  // Keep the latest handlers without resubscribing on every render.
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!ctx) {
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
