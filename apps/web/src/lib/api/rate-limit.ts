import { AppError, ERROR_CODES } from '@rgss/errors'

// Lightweight in-memory, per-IP sliding-window rate limiter.
//
// This is a best-effort guard intended for the single public, unauthenticated
// write endpoint (POST /api/leads). It keeps the build dependency-free and
// always-on regardless of whether Upstash credentials are present.
//
// NOTE: in-memory counters are per-instance and reset on cold start, so this
// does not coordinate across serverless/edge instances.
// TODO: wire Upstash ratelimit when keys provided — swap this in-memory store
// for `@upstash/ratelimit` + `@upstash/redis` (UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN are already declared in `env.ts`) for a distributed
// sliding window shared across instances.

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
// `key` should uniquely identify the caller (e.g. `leads:<ip>`).
export function enforceRateLimit(key: string, options: RateLimitOptions = {}): void {
  const limit = options.limit ?? 5
  const windowMs = options.windowMs ?? 60_000
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
    throw new AppError({
      code: ERROR_CODES.RATE_LIMITED,
      message: `Too many requests. Please try again in ${retryAfterSeconds}s.`,
      statusCode: 429,
      retryable: true,
    })
  }

  existing.count += 1
}
