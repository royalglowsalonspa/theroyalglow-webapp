// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : error-handler.test
 * Scope        : API Infrastructure / Testing
 *
 * Description  : Tests for the centralised withErrorHandler() wrapper. Covers
 *                three concerns sharing a single Sentry mock and one node test
 *                environment:
 *                  1. Sentry reporting — unexpected (non-AppError) errors are
 *                     reported, operational AppErrors are not.
 *                  2. Property 2 — AppError serialises to the error envelope
 *                     with its own statusCode as the HTTP status.
 *                  3. Property 3 — any non-AppError becomes INTERNAL_ERROR/500.
 *
 * Tech Stack   : TypeScript, Vitest, fast-check
 * Layer        : Testing
 *
 * Dependencies : vitest, fast-check, @rgss/errors, @sentry/nextjs (mocked)
 *
 * Notes        : The `node` environment gives us undici's global Request /
 *                Response. The @sentry/nextjs module is mocked at module scope
 *                so the same mock is shared by every describe block in this file.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import * as Sentry from '@sentry/nextjs'
import fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withErrorHandler } from './error-handler'

// Mock Sentry so we can assert on captureException without initialising a real
// client. Shared by every test in this file.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

const captureException = vi.mocked(Sentry.captureException)

// Shared request factory. Attaches an `x-request-id` header only when supplied
// so the same helper exercises both the echo and the generate code paths.
function makeRequest(requestId?: string): Request {
  return new Request('http://localhost/api/test', {
    headers: requestId ? { 'x-request-id': requestId } : {},
  })
}

// Header-safe value generator: matches `^[A-Za-z0-9._~-]+$` (non-empty).
const HEADER_SAFE_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~-'.split('')
const requestIdArb = fc
  .array(fc.constantFrom(...HEADER_SAFE_CHARS), { minLength: 1, maxLength: 32 })
  .map((chars) => chars.join(''))

describe('withErrorHandler — Sentry reporting', () => {
  beforeEach(() => {
    captureException.mockClear()
  })

  it('reports a thrown non-AppError to Sentry exactly once', async () => {
    const handler = withErrorHandler(async () => {
      throw new Error('boom')
    })

    const res = await handler(makeRequest(), undefined)

    expect(res.status).toBe(500)
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(expect.any(Error))
  })

  it('does not report a thrown operational AppError to Sentry', async () => {
    const handler = withErrorHandler(async () => {
      throw new AppError({
        code: 'NOT_FOUND',
        message: 'Resource not found',
        statusCode: 404,
        isOperational: true,
      })
    })

    const res = await handler(makeRequest(), undefined)

    expect(res.status).toBe(404)
    expect(captureException).not.toHaveBeenCalled()
  })
})

// Feature: backend-api, Property 2: AppError serializes to the error envelope with its status
describe('withErrorHandler — Property 2: AppError serialises to the error envelope with its status', () => {
  // Truthy-or-absent details: every generated value is truthy, so "present in
  // the body" is equivalent to "supplied (non-undefined)".
  const detailsArb = fc.option(
    fc.oneof(fc.dictionary(fc.string(), fc.array(fc.string())), fc.string({ minLength: 1 })),
    { nil: undefined },
  )

  it('echoes an AppError verbatim with its statusCode as the HTTP status', async () => {
    // Validates: Requirements 1.3, 1.4, 1.6
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...Object.values(ERROR_CODES)),
        fc.string(),
        fc.integer({ min: 400, max: 599 }),
        fc.boolean(),
        detailsArb,
        requestIdArb,
        async (code, message, statusCode, retryable, details, requestId) => {
          const handler = withErrorHandler(async () => {
            throw new AppError({
              code,
              message,
              statusCode,
              retryable,
              ...(details !== undefined ? { details } : {}),
            })
          })

          const res = await handler(makeRequest(requestId), undefined)
          const body = await res.json()

          expect(res.status).toBe(statusCode)
          expect(body.success).toBe(false)
          expect(body.error.code).toBe(code)
          expect(body.error.message).toBe(message)
          expect(body.error.statusCode).toBe(statusCode)
          expect(body.error.requestId).toBe(requestId)
          expect(body.error.retryable).toBe(retryable)

          if (details !== undefined) {
            expect(body.error.details).toEqual(details)
          } else {
            expect('details' in body.error).toBe(false)
          }
        },
      ),
      { numRuns: 150 },
    )
  })
})

// Feature: backend-api, Property 3: Unexpected errors become INTERNAL_ERROR 500
describe('withErrorHandler — Property 3: Unexpected errors become INTERNAL_ERROR 500', () => {
  beforeEach(() => {
    // The handler logs every unexpected error; silence it to keep the property
    // run output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // Any non-AppError throwable: string, Error, TypeError, plain object, number,
  // double, boolean, null, undefined.
  const thrownArb = fc.oneof(
    fc.string(),
    fc.string().map((m) => new Error(m)),
    fc.string().map((m) => new TypeError(m)),
    fc.object(),
    fc.integer(),
    fc.double(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
  )

  it('maps any non-AppError to INTERNAL_ERROR / 500 / retryable, preserving requestId', async () => {
    // Validates: Requirements 1.5, 1.6
    await fc.assert(
      fc.asyncProperty(
        thrownArb,
        fc.option(requestIdArb, { nil: undefined }),
        async (thrown, requestId) => {
          const handler = withErrorHandler(async () => {
            throw thrown
          })

          const res = await handler(makeRequest(requestId), undefined)
          const body = await res.json()

          expect(res.status).toBe(500)
          expect(body.success).toBe(false)
          expect(body.error.code).toBe('INTERNAL_ERROR')
          expect(body.error.statusCode).toBe(500)
          expect(body.error.retryable).toBe(true)

          if (requestId === undefined) {
            expect(body.error.requestId).toMatch(/^req_/)
          } else {
            expect(body.error.requestId).toBe(requestId)
          }
        },
      ),
      { numRuns: 150 },
    )
  })
})
