// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : verify.test
 * Scope        : Property-based tests for the QStash verify gate
 *
 * Description  : fast-check + Vitest property tests for `apps/admin/src/lib/
 *                jobs/verify.ts` (`verifyQStashSignature`) and the receiver
 *                ordering invariant (no side effects before verification).
 *
 * Notes        : Runs in the `node` environment (server logic + process.env
 *                stubbing). Append-only — add a new `describe` block per
 *                property. Do NOT overwrite sibling property tests.
 ************************************************************/

import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Receiver side-effect seams are mocked so we can assert that NONE of them run
// when verification fails. The verify gate itself (`@/lib/jobs/verify`) is the
// REAL module under test and is intentionally NOT mocked.
// ---------------------------------------------------------------------------
const dbMocks = {
  getPendingBooking: vi.fn(),
  getBookingForNoShow: vi.fn(),
  getReceptionistUserIds: vi.fn(),
  updateBookingStatus: vi.fn(),
  createNotification: vi.fn(),
}
const dispatchMock = vi.fn()
const heartbeatMock = vi.fn()

vi.mock('@rgss/db/queries', () => dbMocks)
vi.mock('@/lib/notifications/dispatch', () => ({
  dispatchNotification: dispatchMock,
}))
vi.mock('@/lib/jobs/heartbeat', () => ({
  pingHeartbeat: heartbeatMock,
}))

import { verifyQStashSignature } from './verify'

// Printable, header-safe character set (token characters per RFC 7230) so the
// generated header names/values/tokens never make `new Request(...)` throw.
const HEADER_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._'.split('')
const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')

/** Arbitrary header value (possibly empty). */
const headerValueArb = fc
  .array(fc.constantFrom(...HEADER_CHARS), { maxLength: 40 })
  .map((a) => a.join(''))
/** Arbitrary lowercase header name (non-empty). */
const headerNameArb = fc
  .array(fc.constantFrom(...NAME_CHARS), { minLength: 1, maxLength: 15 })
  .map((a) => a.join(''))
/** A bag of arbitrary request headers. */
const headersArb = fc.dictionary(headerNameArb, headerValueArb, { maxKeys: 6 })
/** Arbitrary non-empty token string (header-safe). */
const tokenArb = fc
  .array(fc.constantFrom(...HEADER_CHARS), { minLength: 1, maxLength: 40 })
  .map((a) => a.join(''))
/** Arbitrary request body text. */
const bodyArb = fc.string({ maxLength: 200 })
/** Optionally present (bogus) QStash signature header. */
const maybeSignatureArb = fc.option(headerValueArb, { nil: null })

function buildRequest(headers: Record<string, string>, signature: string | null): Request {
  const merged: Record<string, string> = { ...headers }
  if (signature !== null) {
    merged['upstash-signature'] = signature
  }
  return new Request('http://x', { headers: merged })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

// Feature: admin-subdomain-migration, Property 7: QStash webhook receivers reject unverified requests before side effects
//
// Property 7: QStash webhook receivers reject unverified requests before side effects
// Validates: Requirements 8.4
//
// For any request body whose QStash HMAC signature is missing or invalid, the
// receiver responds 401 and performs no database writes or notification
// dispatch; only requests with a valid signature/credential are processed.
//
// The verify GATE is tested directly (fail-closed in production, dev bypass,
// internal-token equality) and the receiver ORDERING is asserted by driving the
// real route handlers through a failing-verification request and confirming no
// mocked DB-write / dispatch / heartbeat seam ever runs.
describe('Property 7: QStash webhook receivers reject unverified requests before side effects', () => {
  // (a) Fail closed in production: no signing keys, no internal token,
  //     NODE_ENV='production' → false for ANY body/headers (even a bogus
  //     upstash-signature or x-internal-job-token header present).
  it('returns false for any request in production when no keys/token are configured', async () => {
    await fc.assert(
      fc.asyncProperty(
        bodyArb,
        headersArb,
        maybeSignatureArb,
        headerValueArb,
        async (body, headers, signature, bogusInternal) => {
          vi.stubEnv('NODE_ENV', 'production')
          vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', undefined)
          vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', undefined)
          vi.stubEnv('INTERNAL_JOB_TOKEN', undefined)

          // Even a present-but-meaningless internal token header must not pass
          // when INTERNAL_JOB_TOKEN is unset.
          const req = buildRequest({ ...headers, 'x-internal-job-token': bogusInternal }, signature)
          const result = await verifyQStashSignature(req, body)
          return result === false
        },
      ),
      { numRuns: 150 },
    )
  })

  // (b) Dev bypass: outside production, with no keys and no internal token,
  //     verification returns true for ANY body/headers (local invocation).
  it('returns true outside production when no keys/token are configured (dev bypass)', async () => {
    await fc.assert(
      fc.asyncProperty(
        bodyArb,
        headersArb,
        maybeSignatureArb,
        fc.constantFrom('development', 'test', 'staging'),
        async (body, headers, signature, nodeEnv) => {
          vi.stubEnv('NODE_ENV', nodeEnv)
          vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', undefined)
          vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', undefined)
          vi.stubEnv('INTERNAL_JOB_TOKEN', undefined)

          const req = buildRequest(headers, signature)
          const result = await verifyQStashSignature(req, body)
          return result === true
        },
      ),
      { numRuns: 100 },
    )
  })

  // (c) Internal-token fallback: with QStash keys unset and INTERNAL_JOB_TOKEN
  //     set, verification passes IFF the x-internal-job-token header exactly
  //     matches — independent of NODE_ENV (token wins even in production).
  it('passes iff the x-internal-job-token header matches the configured token', async () => {
    await fc.assert(
      fc.asyncProperty(
        bodyArb,
        headersArb,
        tokenArb,
        fc.boolean(),
        headerValueArb,
        async (body, headers, token, shouldMatch, other) => {
          vi.stubEnv('NODE_ENV', 'production')
          vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', undefined)
          vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', undefined)
          vi.stubEnv('INTERNAL_JOB_TOKEN', token)

          const provided = shouldMatch ? token : other
          const req = buildRequest({ ...headers, 'x-internal-job-token': provided }, null)
          const result = await verifyQStashSignature(req, body)
          // Oracle: granted exactly when the provided header equals the token.
          return result === (provided === token)
        },
      ),
      { numRuns: 150 },
    )
  })

  // (d) Missing internal-token header rejects when a token is configured.
  it('returns false when a token is configured but the header is absent', async () => {
    await fc.assert(
      fc.asyncProperty(bodyArb, headersArb, tokenArb, async (body, headers, token) => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', undefined)
        vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', undefined)
        vi.stubEnv('INTERNAL_JOB_TOKEN', token)

        // Strip any generated x-internal-job-token so the header is truly absent.
        const rest = Object.fromEntries(
          Object.entries(headers).filter(([k]) => k !== 'x-internal-job-token'),
        )
        const req = buildRequest(rest, null)
        const result = await verifyQStashSignature(req, body)
        return result === false
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Receiver-level invariant: a request that FAILS verification (production, no
// keys, no token) must yield 401 and perform NO database write / notification
// dispatch / heartbeat — i.e. verification runs strictly before any side
// effect. Exercised against both QStash receivers via the REAL route handlers.
// ---------------------------------------------------------------------------
describe('Property 7 (receiver ordering): unverified requests trigger no side effects', () => {
  async function expectNoSideEffects(
    handler: (req: Request) => Promise<Response>,
    body: string,
    headers: Record<string, string>,
    signature: string | null,
  ) {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', undefined)
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', undefined)
    vi.stubEnv('INTERNAL_JOB_TOKEN', undefined)

    const req = new Request('http://x', {
      method: 'POST',
      headers: buildRequest(headers, signature).headers,
      body,
    })
    const res = await handler(req)

    // Rejected before any work.
    expect(res.status).toBe(401)
    // No DB reads OR writes occurred (verification runs first).
    expect(dbMocks.getPendingBooking).not.toHaveBeenCalled()
    expect(dbMocks.getBookingForNoShow).not.toHaveBeenCalled()
    expect(dbMocks.getReceptionistUserIds).not.toHaveBeenCalled()
    expect(dbMocks.updateBookingStatus).not.toHaveBeenCalled()
    expect(dbMocks.createNotification).not.toHaveBeenCalled()
    // No notification dispatch, no heartbeat.
    expect(dispatchMock).not.toHaveBeenCalled()
    expect(heartbeatMock).not.toHaveBeenCalled()
  }

  it('stale-booking-alert: 401 with no DB writes or dispatch for unverified requests', async () => {
    const { POST } = await import('@/app/api/jobs/stale-booking-alert/route')
    await fc.assert(
      fc.asyncProperty(bodyArb, headersArb, maybeSignatureArb, async (body, headers, signature) => {
        await expectNoSideEffects(POST, body, headers, signature)
      }),
      { numRuns: 100 },
    )
  })

  it('noshow-check: 401 with no DB writes or dispatch for unverified requests', async () => {
    const { POST } = await import('@/app/api/jobs/noshow-check/route')
    await fc.assert(
      fc.asyncProperty(bodyArb, headersArb, maybeSignatureArb, async (body, headers, signature) => {
        await expectNoSideEffects(POST, body, headers, signature)
      }),
      { numRuns: 100 },
    )
  })
})
