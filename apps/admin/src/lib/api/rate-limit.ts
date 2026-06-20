/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : rate-limit (admin)
 * Scope        : API Infrastructure
 *
 * Description  : Upstash-backed distributed sliding-window rate limiter for
 *                authenticated admin API routes. 20 requests / 10s keyed by the
 *                authenticated user id. On exceed, throws AppError(RATE_LIMITED,
 *                429) carrying a Retry-After value (seconds until the window
 *                resets) which withErrorHandler renders as a real header.
 *
 * Responsibilities :
 * - Lazily construct a singleton Upstash Redis + Ratelimit client
 * - Enforce a per-user sliding window and throw 429 when exceeded
 * - Degrade gracefully (no-op / allow) when Upstash is not configured or the
 *   upstream call fails, so local dev and transient outages never hard-block
 *
 * Features / Functionality :
 * - enforceRateLimit(userId) — throws 429 with Retry-After when over budget
 * - RATE_LIMIT_RETRY_AFTER_KEY — details key carrying the Retry-After seconds
 *
 * Tech Stack   : TypeScript, @upstash/ratelimit, @upstash/redis
 * Layer        : API Infrastructure
 *
 * Dependencies : @upstash/ratelimit, @upstash/redis, @rgss/errors, @rgss/logger
 *
 * Notes        : Reads UPSTASH_REDIS_REST_URL / _TOKEN directly from
 *                process.env (NOT env.ts) for graceful degradation — env.ts
 *                types them as required and would fail build-time validation
 *                when absent. The Redis + Ratelimit client is created once and
 *                cached for the lifetime of the runtime instance.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { createLogger } from '@rgss/logger'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const logger = createLogger({
  service: 'admin:api:rate-limit',
  environment: process.env.NODE_ENV ?? 'development',
})

// Sliding window budget: 20 requests per 10 seconds, keyed by user id (Req 7.4).
const REQUESTS_PER_WINDOW = 20
const WINDOW = '10 s' as const

// The details key under which the Retry-After value (in seconds) is attached to
// a RATE_LIMITED AppError. withErrorHandler reads this to emit a real
// `Retry-After` response header on the 429 (Req 7.5).
export const RATE_LIMIT_RETRY_AFTER_KEY = 'retryAfterSeconds'

// Cached singleton. `undefined` = not yet resolved; `null` = resolved-but-
// unconfigured (no-op). A real Ratelimit instance once constructed.
let cachedLimiter: Ratelimit | null | undefined

// Lazily build (once) the Upstash-backed sliding-window limiter. Returns null
// when Upstash is not configured (e.g. local dev) so callers no-op / allow.
function getLimiter(): Ratelimit | null {
  if (cachedLimiter !== undefined) {
    return cachedLimiter
  }

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    logger.debug('Upstash not configured; admin rate limiting disabled (allow-all)')
    cachedLimiter = null
    return cachedLimiter
  }

  cachedLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(REQUESTS_PER_WINDOW, WINDOW),
    prefix: 'admin-api',
    analytics: false,
  })
  return cachedLimiter
}

// Enforce the per-user sliding window. No-ops when Upstash is unconfigured.
// Throws AppError(RATE_LIMITED, 429) — with the Retry-After seconds attached in
// `details` — when the user exceeds the budget. On an upstream Upstash failure
// it logs and allows the request (fail-open) so a Redis outage never locks
// legitimate admins out of the portal.
export async function enforceRateLimit(userId: string): Promise<void> {
  const limiter = getLimiter()
  if (!limiter) {
    return
  }

  let result: Awaited<ReturnType<Ratelimit['limit']>>
  try {
    result = await limiter.limit(userId)
  } catch (error) {
    logger.error('Upstash rate-limit check failed; allowing request (fail-open)', {
      error: error instanceof Error ? error.message : String(error),
    })
    return
  }

  if (result.success) {
    return
  }

  // `reset` is an epoch-ms timestamp of when the window frees up. Convert to a
  // whole number of seconds from now (minimum 1) for the Retry-After header.
  const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))

  throw new AppError({
    code: ERROR_CODES.RATE_LIMITED,
    message: `Too many requests. Please try again in ${retryAfterSeconds}s.`,
    statusCode: 429,
    retryable: true,
    details: { [RATE_LIMIT_RETRY_AFTER_KEY]: retryAfterSeconds },
  })
}
