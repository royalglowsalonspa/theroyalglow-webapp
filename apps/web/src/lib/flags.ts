import { createLogger } from '@rgss/logger'

// Server-side PostHog feature-flags helper.
//
// We read `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` straight from
// `process.env` (NOT from `@/env`) on purpose: `env.ts` validates its schema at
// build time and would fail when PostHog is not yet provisioned, but this layer
// must degrade gracefully — the app has to build, typecheck, lint, and run with
// NO PostHog keys present. `posthog-node` is an optional, lazily imported
// dependency; a missing module simply resolves flags to their safe default.
//
// `isFeatureEnabled` is total: it resolves to `defaultValue` and logs anomalies;
// it NEVER throws into a server component or route guard.
//
// Kill-switch usage: query core features with `defaultValue: true` (e.g.
// `isFeatureEnabled(FLAGS.bookingEnabled, userId, true)`) so a PostHog outage or
// a missing key never disables a core flow. Experimental flags default OFF.

const logger = createLogger({
  service: 'web:flags',
  environment: process.env.NODE_ENV ?? 'development',
})

/** Launch kill-switch / feature-gate flag keys (PostHog flag names). */
export const FLAGS = {
  bookingEnabled: 'booking-enabled',
  membershipEnabled: 'membership-enabled',
  offersEnabled: 'offers-enabled',
  whatsappNotifications: 'whatsapp-notifications',
  gemsLoyalty: 'gems-loyalty',
  spaServices: 'spa-services',
} as const

/** Union of the known PostHog flag names declared in {@link FLAGS}. */
export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS]

// Minimal slice of the optional `posthog-node` PostHog client surface we rely
// on. Modeled locally so this file compiles without the package installed.
type PostHogClient = {
  isFeatureEnabled(
    flag: string,
    distinctId: string,
  ): Promise<boolean | undefined>
  shutdown?(): Promise<void>
}

type PostHogConstructor = new (
  apiKey: string,
  options?: { host?: string },
) => PostHogClient

function resolvePostHog(mod: unknown): PostHogConstructor | null {
  if (typeof mod !== 'object' || mod === null) {
    return null
  }
  const candidate = mod as {
    PostHog?: unknown
    default?: { PostHog?: unknown }
  }
  if (typeof candidate.PostHog === 'function') {
    return candidate.PostHog as PostHogConstructor
  }
  if (candidate.default && typeof candidate.default.PostHog === 'function') {
    return candidate.default.PostHog as PostHogConstructor
  }
  return null
}

// Single shared client instance, lazily constructed on first successful use.
let cachedClient: PostHogClient | null = null

async function getClient(key: string): Promise<PostHogClient | null> {
  if (cachedClient) {
    return cachedClient
  }

  // Lazy, catchable import keeps `posthog-node` an optional dependency. Use a
  // non-literal specifier so the type checker does not require it installed.
  const mod: unknown = await import('posthog-node' as string).catch(() => null)
  const PostHog = resolvePostHog(mod)
  if (!PostHog) {
    logger.debug('posthog-node module unavailable; flags resolve to default')
    return null
  }

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  cachedClient = new PostHog(key, host ? { host } : undefined)
  return cachedClient
}

/**
 * Server-side feature-flag check.
 *
 * Returns `defaultValue` when PostHog is unconfigured, the `posthog-node`
 * import fails, the flag is undefined, or the evaluation throws — and NEVER
 * throws. Pass `defaultValue: true` for core kill-switches so the absence of
 * PostHog never disables a core feature.
 */
export async function isFeatureEnabled(
  flag: string,
  distinctId: string,
  defaultValue = false,
): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  // Not configured → safe default (Property 4).
  if (!key) {
    return defaultValue
  }

  try {
    const client = await getClient(key)
    if (!client) {
      return defaultValue
    }

    const result = await client.isFeatureEnabled(flag, distinctId)
    return typeof result === 'boolean' ? result : defaultValue
  } catch (error) {
    // Never throw — flag evaluation is best-effort.
    logger.error('isFeatureEnabled failed', {
      flag,
      error: error instanceof Error ? error.message : String(error),
    })
    return defaultValue
  }
}
