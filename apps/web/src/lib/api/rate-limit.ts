/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : rate-limit
 * Scope        : API Infrastructure
 *
 * Description  : Distributed sliding-window rate limiter for public API
 *                endpoints. Backed by @upstash/ratelimit + @upstash/redis when
 *                Upstash is configured, with a transparent fall back to the
 *                original in-memory per-instance sliding window when it is not
 *                (local dev / CI / Upstash outage). Best-effort guard per-IP.
 *
 * Responsibilities :
 * - Enforce a per-key sliding window and throw 429 when the budget is exceeded
 * - Use Upstash (shared across serverless/edge instances) when credentials exist
 * - Degrade gracefully to an in-memory window when Upstash is absent or errors
 * - Extract client IP from standard proxy headers
 *
 * Features / Functionality :
 * - enforceRateLimit(key, options) — async; throws 429 when limit exceeded
 * - getClientIp() — extracts IP from x-forwarded-for / x-real-ip
 * - Configurable limit and window duration (same options as before)
 *
 * Tech Stack   : TypeScript, @upstash/ratelimit, @upstash/redis
 * Layer        : API
 *
 * Dependencies : @upstash/ratelimit, @upstash/redis, @rgss/errors, @rgss/logger
 *
 * Notes        :
 * - Reads UPSTASH_REDIS_REST_URL / _TOKEN directly from process.env (NOT env.ts)
 *   for graceful degradation — env.ts types them as required and would fail
 *   build-time validation when absent. This mirrors apps/admin's limiter.
 * - The exported signature is preserved: enforceRateLimit(key, options) and
 *   getClientIp(req). enforceRateLimit is now async (returns Promise<void>);
 *   callers must `await` it so a 429 propagates to withErrorHandler. Runs on
 *   the Cloudflare Workers runtime (Upstash REST client uses fetch only).
 *
 * ── Fallback behaviour (documented) ───────────────────────────────────────
 * • Upstash configured  → distributed sliding window shared across instances.
 * • Upstash unconfigured → in-memory per-instance sliding window (the original
 *   behaviour), so local dev / CI keep working with NO Upstash credentials.
 * • Upstash call throws  → fall back to the in-memory window for THIS request
 *   so a Redis outage still applies best-effort protection rather than failing
 *   fully open.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { createLogger } from '@rgss/logger'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const logger = createLogger({
  service: 'web:api:rate-limit',
  environment: process.env.NODE_ENV ?? 'development',
})

// ── In-memory fallback store (original behaviour) ─────────────────────────
// Per-instance counters; reset on cold start and NOT shared across serverless/
// edge instances. Used only when Upstash is unconfigured or unreachable.

type Hit = {
  count: number
  // Window start as epoch ms. The window resets once `windowMs` has elapsed.
  windowStart: number
}

const store = new Map<string, Hit>()

// Opportunistically drop stale entries so the map cannot grow unbounded under
// a stream of unique IPs.
function sweep(now: number, windowMs: number): void {
  for (const [key, hit] of store) {
    if (now - hit.windowStart >= windowMs) {
      store.delete(key)
    }
  }
}

type RateLimitOptions = {
  // Max requests allowed per window. Defaults to 5.
  limit?: number
  // Window length in milliseconds. Defaults to 60_000 (1 minute).
  windowMs?: number
}

const DEFAULT_LIMIT = 5
const DEFAULT_WINDOW_MS = 60_000

// Throw the canonical RATE_LIMITED error with a human Retry-After hint.
function throwRateLimited(retryAfterSeconds: number): never {
  throw new AppError({
    code: ERROR_CODES.RATE_LIMITED,
    message: `Too many requests. Please try again in ${retryAfterSeconds}s.`,
    statusCode: 429,
    retryable: true,
  })
}

// In-memory sliding-window enforcement (the original algorithm, extracted so it
// can also serve as the Upstash fall-open path).
function enforceInMemory(key: string, limit: number, windowMs: number): void {
  const now = Date.now()

  if (store.size > 10_000) {
    sweep(now, windowMs)
  }

  const existing = store.get(key)
  if (!existing || now - existing.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now })
    return
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.ceil((existing.windowStart + windowMs - now) / 1000)
    throwRateLimited(retryAfterSeconds)
  }

  existing.count += 1
}

// ── Upstash distributed limiter (lazily constructed, cached per config) ────
// `undefined` = not yet resolved; `null` = resolved-but-unconfigured (no-op).
let upstashAvailable: boolean | undefined
let redisClient: Redis | null = null
// Cache one Ratelimit instance per (limit, windowSeconds) config so different
// call sites/budgets each get a correctly-configured sliding window.
const limiterCache = new Map<string, Ratelimit>()

function getRedis(): Redis | null {
  if (upstashAvailable !== undefined) {
    return redisClient
  }

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    logger.debug('Upstash not configured; using in-memory rate limiting (per-instance)')
    upstashAvailable = false
    redisClient = null
    return null
  }

  upstashAvailable = true
  redisClient = new Redis({ url, token })
  return redisClient
}

function getLimiter(limit: number, windowSeconds: number): Ratelimit | null {
  const redis = getRedis()
  if (!redis) {
    return null
  }

  const cacheKey = `${limit}:${windowSeconds}`
  const cached = limiterCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: 'web-api',
    analytics: false,
  })
  limiterCache.set(cacheKey, limiter)
  return limiter
}

// Best-effort client IP extraction from standard proxy headers.
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) {
      return first
    }
  }
  return req.headers.get('x-real-ip') ?? 'unknown'
}

// Throws AppError(RATE_LIMITED, 429) when the caller exceeds the window budget.
// `key` should uniquely identify the caller (e.g. `leads:<ip>`). Uses Upstash
// when configured (shared across instances) and falls back to the in-memory
// window otherwise — or if the Upstash call fails.
export async function enforceRateLimit(key: string, options: RateLimitOptions = {}): Promise<void> {
  const limit = options.limit ?? DEFAULT_LIMIT
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000))

  const limiter = getLimiter(limit, windowSeconds)

  // No Upstash → original in-memory behaviour.
  if (!limiter) {
    enforceInMemory(key, limit, windowMs)
    return
  }

  let result: Awaited<ReturnType<Ratelimit['limit']>>
  try {
    result = await limiter.limit(key)
  } catch (error) {
    // Redis outage: fall back to the in-memory window so we keep best-effort
    // protection rather than failing fully open.
    logger.error('Upstash rate-limit check failed; falling back to in-memory window', {
      error: error instanceof Error ? error.message : String(error),
    })
    enforceInMemory(key, limit, windowMs)
    return
  }

  if (result.success) {
    return
  }

  // `reset` is an epoch-ms timestamp of when the window frees up.
  const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
  throwRateLimited(retryAfterSeconds)
}
