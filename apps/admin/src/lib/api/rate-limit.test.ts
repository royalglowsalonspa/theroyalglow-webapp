// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : rate-limit.test
 * Scope        : Unit tests for the Upstash-backed admin rate limiter
 *
 * Description  : Vitest unit tests for `apps/admin/src/lib/api/rate-limit.ts`
 *                (`enforceRateLimit`). Covers the unconfigured no-op path, the
 *                over-budget 429 (AppError + Retry-After in details), the
 *                allow path, and the fail-open behaviour on an upstream error.
 *
 * Notes        : Runs in the `node` environment (server logic + process.env
 *                stubbing). The module caches a singleton limiter, so each case
 *                calls `vi.resetModules()` and re-imports to get a fresh cache.
 *                @upstash/ratelimit + @upstash/redis are mocked so no real
 *                network/Redis client is constructed.
 *                _Requirements: 7.4, 7.5_
 ************************************************************/

import { type AppError, ERROR_CODES } from '@rgss/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The instance `limit()` seam is controlled per-test. Declared at module scope
// so it survives `vi.resetModules()` (which clears the module registry but not
// the test file's own bindings or the registered `vi.mock` factories).
const limitMock = vi.fn()
const slidingWindowMock = vi.fn(() => ({ kind: 'sliding-window' }))

// Mock the Upstash Redis client to a no-op constructor (never hits network).
vi.mock('@upstash/redis', () => ({
  Redis: class {},
}))

// Mock the Ratelimit class: a static `slidingWindow` factory plus an instance
// `limit` method wired to `limitMock` so each test decides success/failure.
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = slidingWindowMock
    limit = limitMock
  },
}))

// Fresh import of the module under test with the singleton cache reset.
async function loadModule() {
  vi.resetModules()
  return import('./rate-limit')
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('enforceRateLimit — Upstash unconfigured (Req 7.4)', () => {
  it('no-ops (resolves without throwing) when UPSTASH env vars are unset', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', undefined)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined)

    const { enforceRateLimit } = await loadModule()

    await expect(enforceRateLimit('user_1')).resolves.toBeUndefined()
    // Limiter is never constructed/queried when unconfigured.
    expect(limitMock).not.toHaveBeenCalled()
  })

  it('no-ops when only the URL is set (token missing)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined)

    const { enforceRateLimit } = await loadModule()

    await expect(enforceRateLimit('user_1')).resolves.toBeUndefined()
    expect(limitMock).not.toHaveBeenCalled()
  })
})

describe('enforceRateLimit — Upstash configured', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  })

  it('resolves without throwing on the success path (under budget)', async () => {
    limitMock.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Date.now() + 10_000,
    })

    const { enforceRateLimit } = await loadModule()

    await expect(enforceRateLimit('user_ok')).resolves.toBeUndefined()
    expect(limitMock).toHaveBeenCalledWith('user_ok')
  })

  it('throws AppError(RATE_LIMITED, 429) with a positive integer Retry-After when over budget (Req 7.5)', async () => {
    // Window frees up ~5s from now → Retry-After should be a small positive int.
    limitMock.mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() + 5_000,
    })

    const { enforceRateLimit, RATE_LIMIT_RETRY_AFTER_KEY } = await loadModule()

    const error = await enforceRateLimit('user_over').then(
      () => null,
      (e) => e,
    )

    // NOTE: `vi.resetModules()` rebuilds the module graph, so the AppError
    // class identity inside the freshly-imported rate-limit module differs from
    // this file's top-level import. Assert the structural shape (name + fields)
    // rather than a cross-graph `instanceof`.
    const appError = error as AppError
    expect(appError).not.toBeNull()
    expect(appError.name).toBe('AppError')
    expect(appError.code).toBe(ERROR_CODES.RATE_LIMITED)
    expect(appError.statusCode).toBe(429)
    expect(appError.retryable).toBe(true)

    const details = appError.details as Record<string, unknown>
    const retryAfter = details[RATE_LIMIT_RETRY_AFTER_KEY]
    expect(typeof retryAfter).toBe('number')
    expect(Number.isInteger(retryAfter)).toBe(true)
    expect(retryAfter as number).toBeGreaterThan(0)
  })

  it('clamps Retry-After to a minimum of 1 second when the window has already reset', async () => {
    // reset in the past → ceil((past - now)/1000) would be <= 0; code floors to 1.
    limitMock.mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() - 5_000,
    })

    const { enforceRateLimit, RATE_LIMIT_RETRY_AFTER_KEY } = await loadModule()

    const error = (await enforceRateLimit('user_past').catch((e) => e)) as AppError
    const details = error.details as Record<string, unknown>
    expect(details[RATE_LIMIT_RETRY_AFTER_KEY]).toBe(1)
  })

  it('fails open (resolves) when the upstream Upstash call rejects', async () => {
    limitMock.mockRejectedValue(new Error('redis unreachable'))

    const { enforceRateLimit } = await loadModule()

    // A Redis outage must never hard-block a legitimate admin.
    await expect(enforceRateLimit('user_err')).resolves.toBeUndefined()
  })
})
