import { createLogger } from '@rgss/logger'

// Web Push delivery provider. Sends a payload to a set of the recipient's
// active push subscriptions using VAPID auth.
//
// We read VAPID config straight from `process.env` (NOT from `@/env`) on
// purpose: `env.ts` types these keys as required and would fail build-time
// validation when they are absent. Reading `process.env` directly behind a
// truthy guard lets the app build and run with no provider keys configured
// (Property 10 — no-op without config).
//
// `web-push` is an optional, lazily imported dependency — it need not be
// installed until the keys are provisioned, so a missing module simply yields a
// benign no-op. This helper NEVER throws to its caller (Property 9): a per-send
// failure is caught, counted as `failed`, and (when the subscription is gone)
// reported via the optional `onGone` callback so the caller can prune it.

const logger = createLogger({
  service: 'web:notifications:webpush',
  environment: process.env.NODE_ENV ?? 'development',
})

const DEFAULT_SUBJECT = 'mailto:contact@theroyalglow.in'

export type WebPushSubscription = {
  endpoint: string
  p256dhKey: string
  authKey: string
}

export type WebPushPayload = {
  title: string
  body: string
  url?: string
}

export type WebPushResult = {
  sent: number
  failed: number
}

// Minimal slice of the optional `web-push` module surface we rely on. Modeled
// locally so this file compiles without the package (or its types) installed.
type PushSubscriptionShape = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

type WebPushModule = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void
  sendNotification(subscription: PushSubscriptionShape, payload: string): Promise<unknown>
}

function resolveWebPush(mod: unknown): WebPushModule | null {
  if (typeof mod !== 'object' || mod === null) {
    return null
  }
  const candidate = mod as {
    setVapidDetails?: unknown
    sendNotification?: unknown
    default?: { setVapidDetails?: unknown; sendNotification?: unknown }
  }
  if (
    typeof candidate.setVapidDetails === 'function' &&
    typeof candidate.sendNotification === 'function'
  ) {
    return candidate as unknown as WebPushModule
  }
  if (
    candidate.default &&
    typeof candidate.default.setVapidDetails === 'function' &&
    typeof candidate.default.sendNotification === 'function'
  ) {
    return candidate.default as unknown as WebPushModule
  }
  return null
}

// A 404/410 from the push service means the subscription is permanently gone
// (the browser dropped it) and the caller should deactivate it.
function isGoneError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode
  return statusCode === 404 || statusCode === 410
}

export async function sendWebPush(
  subscriptions: WebPushSubscription[],
  payload: WebPushPayload,
  onGone?: (endpoint: string) => Promise<void>,
): Promise<WebPushResult> {
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const subject = process.env.VAPID_SUBJECT ?? DEFAULT_SUBJECT

  // Not configured → no-op (Property 10). Nothing was sent.
  if (!(privateKey && publicKey)) {
    logger.info('sendWebPush skipped (VAPID keys not configured)', {
      subscriptions: subscriptions.length,
    })
    return { sent: 0, failed: 0 }
  }

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 }
  }

  try {
    // Lazy, catchable import keeps `web-push` an optional dependency. Use a
    // non-literal specifier so the type checker does not require it installed.
    const mod: unknown = await import('web-push' as string).catch(() => null)
    const webpush = resolveWebPush(mod)
    if (!webpush) {
      logger.debug('web-push module unavailable; cannot deliver push')
      return { sent: 0, failed: subscriptions.length }
    }

    webpush.setVapidDetails(subject, publicKey, privateKey)

    const serialized = JSON.stringify(payload)
    let sent = 0
    let failed = 0

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
          },
          serialized,
        )
        sent += 1
      } catch (error) {
        failed += 1
        if (isGoneError(error) && onGone) {
          // Prune the dead subscription; pruning failures must not break the loop.
          await onGone(sub.endpoint).catch((pruneError) => {
            logger.warn('failed to prune gone push subscription', {
              error:
                pruneError instanceof Error ? pruneError.message : String(pruneError),
            })
          })
        } else {
          logger.warn('web push send failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    return { sent, failed }
  } catch (error) {
    // Never throw to the caller (Property 9).
    logger.error('sendWebPush failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { sent: 0, failed: subscriptions.length }
  }
}
