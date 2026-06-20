/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ably client loader (admin)
 * Scope        : Realtime (client)
 *
 * Description  : Lazy loader + minimal local typings for the browser-side Ably
 *                Realtime client. Mirrors the server-side resolveAblyRest /
 *                lazy-import pattern (apps/web|admin/src/lib/realtime/ably.ts)
 *                so `ably` stays an OPTIONAL dependency: if it is not installed
 *                the loader resolves to null and the provider degrades
 *                gracefully (no crash, falls back to polling).
 *
 * Responsibilities :
 * - Lazily import the optional `ably` module in the browser
 * - Resolve the Realtime constructor from either named or default export
 * - Model just the slice of the Ably surface the provider relies on
 *
 * Features / Functionality :
 * - loadAblyRealtime() — Promise<RealtimeConstructor | null>
 * - Token Auth via authCallback (no client publish key)
 *
 * Tech Stack   : TypeScript, Ably (optional, lazily imported)
 * Layer        : Realtime Infrastructure (client)
 *
 * Dependencies : ably (optional)
 *
 * Notes        : Uses a non-literal specifier (`'ably' as string`) so the type
 *                checker does not require the package to be installed. Edge/
 *                client-safe: no Node built-ins, only invoked in the browser.
 ************************************************************/

// The connection lifecycle states Ably can report. We only branch on a subset
// (connected / disconnected / suspended / connecting) but model the full set
// for accurate typing of state-change events.
export type AblyConnectionState =
  | 'initialized'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'suspended'
  | 'closing'
  | 'closed'
  | 'failed'

export type AblyConnectionStateChange = {
  current: AblyConnectionState
  previous: AblyConnectionState
  reason?: { message?: string } | null
}

// A realtime message as delivered to a channel subscriber. `data` is the
// event payload (schema varies per event — see channels.ts event sets).
export type AblyMessage = {
  name?: string
  data?: unknown
  clientId?: string
}

export type AblyMessageListener = (message: AblyMessage) => void

export type AblyRealtimeChannel = {
  subscribe(event: string, listener: AblyMessageListener): void
  unsubscribe(event?: string, listener?: AblyMessageListener): void
  detach?(): void
}

export type AblyConnection = {
  state: AblyConnectionState
  on(
    event: AblyConnectionState | AblyConnectionState[],
    listener: (change: AblyConnectionStateChange) => void,
  ): void
  off(event?: AblyConnectionState | AblyConnectionState[]): void
}

export type AblyRealtimeClient = {
  connection: AblyConnection
  channels: { get(name: string): AblyRealtimeChannel; release?(name: string): void }
  close(): void
}

// Ably's authCallback contract: given token params, call back with either an
// error or a TokenRequest / token string.
export type AblyAuthCallback = (
  tokenParams: unknown,
  callback: (error: unknown | null, tokenRequestOrToken: unknown) => void,
) => void

export type AblyRealtimeOptions = {
  authCallback: AblyAuthCallback
  autoConnect?: boolean
  closeOnUnload?: boolean
  // Lower the disconnect-detection window so the "reconnecting" UX can surface
  // promptly on connection loss (Req 8.5). Kept conservative to avoid false
  // positives; the browser `offline` event provides the instant signal.
  disconnectedRetryTimeout?: number
  realtimeRequestTimeout?: number
}

export type AblyRealtimeConstructor = new (options: AblyRealtimeOptions) => AblyRealtimeClient

// Resolve the Realtime constructor from the dynamically imported module,
// tolerating both `{ Realtime }` and `{ default: { Realtime } }` shapes.
function resolveAblyRealtime(mod: unknown): AblyRealtimeConstructor | null {
  if (typeof mod !== 'object' || mod === null) {
    return null
  }
  const candidate = mod as {
    Realtime?: unknown
    default?: { Realtime?: unknown }
  }
  if (typeof candidate.Realtime === 'function') {
    return candidate.Realtime as AblyRealtimeConstructor
  }
  if (candidate.default && typeof candidate.default.Realtime === 'function') {
    return candidate.default.Realtime as AblyRealtimeConstructor
  }
  return null
}

// Lazily import the optional `ably` package in the browser. Resolves to null
// when the module is absent (optional dependency) so the provider can no-op.
export async function loadAblyRealtime(): Promise<AblyRealtimeConstructor | null> {
  const mod: unknown = await import('ably' as string).catch(() => null)
  return resolveAblyRealtime(mod)
}
