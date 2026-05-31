import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Integration test for the /api/health route. We mock `@rgss/db` so the real
// Neon client never initialises (it reads `DATABASE_URL` at import time) and so
// we can drive the database check to pass or fail deterministically. Redis/R2
// have no env keys here, so they report `skip` and never degrade the status.
//
// Excluded from `test:unit` by the `*.integration.test.*` glob; run by
// `test:integration`.

const execute = vi.fn()

vi.mock('@rgss/db', () => ({
  db: {
    execute: (...args: unknown[]) => execute(...args),
  },
}))

describe('GET /api/health (integration)', () => {
  beforeEach(() => {
    execute.mockReset()
    // No optional keys → Redis/R2 report `skip` and never degrade the status.
    vi.stubEnv('UPSTASH_REDIS_REST_URL', undefined)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined)
    vi.stubEnv('NEXT_PUBLIC_R2_PUBLIC_URL', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('returns 200 healthy when the database check passes', async () => {
    execute.mockResolvedValue([{ '?column?': 1 }])
    const { GET } = await import('./route')

    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('X-Health-Status')).toBe('healthy')

    const body = await res.json()
    expect(body.status).toBe('healthy')
    expect(body.checks.database.status).toBe('pass')
    expect(body.checks.redis.status).toBe('skip')
    expect(body.checks.r2.status).toBe('skip')
  })

  it('returns 503 unhealthy when the database check throws', async () => {
    execute.mockRejectedValue(new Error('connection refused'))
    const { GET } = await import('./route')

    const res = await GET()
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('no-store')

    const body = await res.json()
    expect(body.status).toBe('unhealthy')
    expect(body.checks.database.status).toBe('fail')
  })
})
