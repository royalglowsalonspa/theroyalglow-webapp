/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ably (admin)
 * Scope        : Realtime
 *
 * Description  : Server-side Ably token request builder for the admin portal.
 *                Issues subscribe-only tokens scoped to the admin channel set.
 *                Mirrors apps/web's resolveAblyRest + lazy-import pattern.
 *
 * Responsibilities :
 * - Build a scoped Ably token request for an admin user
 * - Apply the pure subscribe-only admin capability (buildAdminAblyCapability)
 * - Return null when Ably is not configured (caller returns 503)
 *
 * Features / Functionality :
 * - createAblyTokenRequest({ userId }) — scoped token issue
 * - Lazy ably module import (optional dependency)
 *
 * Tech Stack   : TypeScript, Ably (optional)
 * Layer        : API Infrastructure
 *
 * Dependencies : @/lib/realtime/capability, @rgss/logger, ably (optional)
 *
 * Notes        : Reads process.env.ABLY_PRIVATE_KEY directly for graceful
 *                degradation (NOT env.ts, which would fail validation when the
 *                key is absent). `ably` is lazily imported so it need not be
 *                installed until the key is provisioned.
 ************************************************************/

import { buildAdminAblyCapability } from '@/lib/realtime/capability'
import { createLogger } from '@rgss/logger'

const logger = createLogger({
  service: 'admin:realtime:ably',
  environment: process.env.NODE_ENV ?? 'development',
})

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

// Build a scoped, subscribe-only Ably token request for an admin user. Returns
// null when `ABLY_PRIVATE_KEY` is unset or the optional `ably` module is
// unavailable → caller turns null into a 503 SERVICE_UNAVAILABLE (graceful
// degradation to polling). Capability is fixed to the admin channel set; this
// helper is only reached after the route has enforced Receptionist+.
export async function createAblyTokenRequest(params: {
  userId: string
}): Promise<unknown | null> {
  const apiKey = process.env.ABLY_PRIVATE_KEY
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

    const client = new Rest({ key: apiKey })
    const tokenRequest = await client.auth.createTokenRequest({
      capability: JSON.stringify(buildAdminAblyCapability()),
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
