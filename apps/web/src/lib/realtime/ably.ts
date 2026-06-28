/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ably
 * Scope        : Realtime
 *
 * Description  : Server-side Ably token request builder for realtime features.
 *                Issues scoped tokens for customer and admin channels.
 *
 * Responsibilities :
 * - Build scoped Ably token requests with capability restrictions
 * - Scope customer channels to their user ID
 * - Grant admin wildcard subscribe when user is admin
 * - Return null when Ably is not configured (caller returns 503)
 *
 * Features / Functionality :
 * - createAblyTokenRequest({ userId, isAdmin }) — scoped token issue
 * - Lazy ably module import (optional dependency)
 *
 * Tech Stack   : TypeScript, Ably (optional)
 * Layer        : API Infrastructure
 *
 * Dependencies : @rgss/logger, ably (optional)
 *
 * Notes        : Reads process.env directly for graceful degradation
 ************************************************************/

import { createLogger } from '@rgss/logger'

// Server-side helper that builds a scoped Ably token request for the realtime
// token route. Server-side publishing lives in `./publish.ts`
// (publishBookingEvent), which POSTs booking events to the Ably REST API.
//
// We read `ABLY_PRIVATE_KEY` straight from `process.env` (NOT from `env.ts`) on
// purpose: `env.ts` types it as a required string and would fail validation
// when it is absent, but this helper must degrade gracefully (return null so
// the caller can answer 503) when realtime is not yet configured. `ably` is an
// optional, lazily imported dependency — it need not be installed until the key
// is provisioned, so a missing module simply yields null.

const logger = createLogger({
  service: 'web:realtime:ably',
  environment: process.env.NODE_ENV ?? 'development',
})

// Ably capability map: channel/namespace → allowed operations.
type Capability = Record<string, string[]>

// Minimal slice of the optional `ably` module surface we rely on. Modeled
// locally so this file compiles without the package (or its types) installed.
type TokenParams = { capability: string; clientId?: string }

type AblyRestClient = {
  auth: {
    createTokenRequest(params: TokenParams): Promise<unknown>
  }
}

type AblyRestConstructor = new (options: { key: string }) => AblyRestClient

function resolveAblyRest(mod: unknown): AblyRestConstructor | null {
  if (typeof mod !== 'object' || mod === null) {
    return null
  }
  const candidate = mod as { Rest?: unknown; default?: { Rest?: unknown } }
  if (typeof candidate.Rest === 'function') {
    return candidate.Rest as AblyRestConstructor
  }
  if (candidate.default && typeof candidate.default.Rest === 'function') {
    return candidate.default.Rest as AblyRestConstructor
  }
  return null
}

export async function createAblyTokenRequest(params: {
  userId: string
  isAdmin: boolean
}): Promise<unknown | null> {
  const apiKey = process.env.ABLY_PRIVATE_KEY
  // Not configured → caller turns this into a 503 SERVICE_UNAVAILABLE.
  if (!apiKey) {
    return null
  }

  try {
    // Lazy, catchable import keeps `ably` an optional dependency. Use a
    // non-literal specifier so the type checker does not require it installed.
    const mod: unknown = await import('ably' as string).catch(() => null)
    const Rest = resolveAblyRest(mod)
    if (!Rest) {
      logger.debug('ably module unavailable; cannot issue token request')
      return null
    }

    const capability: Capability = {
      [`customer:${params.userId}:*`]: ['subscribe'],
    }
    if (params.isAdmin) {
      capability['admin:*'] = ['subscribe']
    }

    const client = new Rest({ key: apiKey })
    const tokenRequest = await client.auth.createTokenRequest({
      capability: JSON.stringify(capability),
      clientId: params.userId,
    })

    return tokenRequest
  } catch (error) {
    logger.error('createAblyTokenRequest failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
