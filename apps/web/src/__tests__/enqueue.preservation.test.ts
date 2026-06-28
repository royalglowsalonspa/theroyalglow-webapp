// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/web)
 * Module Name  : enqueue.preservation.test
 * Scope        : Preservation property tests for the best-effort QStash enqueue
 *
 * Description  : Property 2 (Preservation) baseline for the triggered-job
 *                enqueue helper `apps/web/src/lib/jobs/enqueue.ts`. Captures the
 *                best-effort contract that MUST hold before and after the
 *                web-admin-separation-cleanup fix:
 *                  - enqueueJob NEVER throws (for any path/body/delaySeconds)
 *                  - it NO-OPS (no publish) when QSTASH_TOKEN is absent
 *                  - when configured it builds the destination URL as
 *                    `${baseOrigin}${path}` and forwards body + delay
 *
 *                The fix changes ONLY which env var supplies `baseOrigin`
 *                (NEXT_PUBLIC_APP_URL → NEXT_PUBLIC_ADMIN_URL). To keep this
 *                baseline stable across the fix, BOTH env vars are stubbed to
 *                the SAME origin, so `${baseOrigin}${path}` holds regardless of
 *                which one the implementation reads.
 *
 * Approach     : `@upstash/qstash` is mocked so no real network/QStash publish
 *                occurs; `@rgss/logger` stays REAL (pure, no I/O in test).
 *                process.env is driven via vi.stubEnv per property.
 *
 * Layer        : Testing (property-based, observation-first baseline)
 *
 * Notes        : Runs in the `node` environment.
 *                Property tests run a minimum of 100 iterations.
 *                Validates: Requirements 3.5
 ************************************************************/

import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the optional QStash client so `enqueueJob`'s lazy
// `import('@upstash/qstash')` resolves to a capturing fake — no real publish.
const publishJSONMock = vi.hoisted(() => vi.fn())
vi.mock('@upstash/qstash', () => ({
  Client: class {
    publishJSON = publishJSONMock
  },
}))

import { enqueueJob } from '@/lib/jobs/enqueue'

// A single shared base origin used for BOTH NEXT_PUBLIC_APP_URL and
// NEXT_PUBLIC_ADMIN_URL so the URL assertion is invariant under the fix.
const BASE_ORIGIN = 'https://example.test'

// Arbitraries for arbitrary (path, body, delaySeconds) triples.
const pathArb = fc
  .array(
    fc.string({ minLength: 1, maxLength: 16 }).filter((s) => !s.includes('/')),
    {
      minLength: 1,
      maxLength: 4,
    },
  )
  .map((parts) => `/api/jobs/${parts.join('/')}`)
const bodyArb = fc.record({
  bookingId: fc.string({ minLength: 1, maxLength: 24 }),
  n: fc.integer({ min: 0, max: 1000 }),
})
const delayArb = fc.integer({ min: 0, max: 86_400 })

beforeEach(() => {
  vi.clearAllMocks()
  publishJSONMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('enqueueJob preservation: best-effort contract (Req 3.5)', () => {
  it('NO-OPS (never publishes, never throws) when QSTASH_TOKEN is absent', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, bodyArb, delayArb, async (path, body, delay) => {
        vi.clearAllMocks()
        publishJSONMock.mockResolvedValue(undefined)
        vi.stubEnv('QSTASH_TOKEN', '')
        vi.stubEnv('NEXT_PUBLIC_APP_URL', BASE_ORIGIN)
        vi.stubEnv('NEXT_PUBLIC_ADMIN_URL', BASE_ORIGIN)

        await expect(enqueueJob(path, body, delay)).resolves.toBeUndefined()
        expect(publishJSONMock).not.toHaveBeenCalled()
      }),
      { numRuns: 100 },
    )
  })

  it('builds `${baseOrigin}${path}` and forwards body + delay when configured', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, bodyArb, delayArb, async (path, body, delay) => {
        vi.clearAllMocks()
        publishJSONMock.mockResolvedValue(undefined)
        vi.stubEnv('QSTASH_TOKEN', 'test-token')
        vi.stubEnv('NEXT_PUBLIC_APP_URL', BASE_ORIGIN)
        vi.stubEnv('NEXT_PUBLIC_ADMIN_URL', BASE_ORIGIN)

        await expect(enqueueJob(path, body, delay)).resolves.toBeUndefined()

        expect(publishJSONMock).toHaveBeenCalledOnce()
        expect(publishJSONMock).toHaveBeenCalledWith({
          url: `${BASE_ORIGIN}${path}`,
          body,
          delay,
        })
      }),
      { numRuns: 100 },
    )
  })

  it('NEVER throws even when the underlying publish rejects', async () => {
    await fc.assert(
      fc.asyncProperty(pathArb, bodyArb, delayArb, async (path, body, delay) => {
        vi.clearAllMocks()
        publishJSONMock.mockRejectedValue(new Error('QStash unavailable'))
        vi.stubEnv('QSTASH_TOKEN', 'test-token')
        vi.stubEnv('NEXT_PUBLIC_APP_URL', BASE_ORIGIN)
        vi.stubEnv('NEXT_PUBLIC_ADMIN_URL', BASE_ORIGIN)

        await expect(enqueueJob(path, body, delay)).resolves.toBeUndefined()
      }),
      { numRuns: 100 },
    )
  })
})
