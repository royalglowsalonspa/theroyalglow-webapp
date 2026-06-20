// @vitest-environment node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : error-handler.test
 * Scope        : Unit tests for the admin API error-handling wrapper
 *
 * Description  : Vitest unit tests for `apps/admin/src/lib/api/error-handler.ts`
 *                (`withErrorHandler`). Focuses on the Retry-After header
 *                rendering for a RATE_LIMITED AppError, that the envelope is a
 *                429, and that non-rate-limit AppErrors never emit Retry-After.
 *
 * Notes        : Runs in the `node` environment (server-side handler logic).
 *                _Requirements: 7.5_
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { describe, expect, it } from 'vitest'
import { withErrorHandler } from './error-handler'
import { RATE_LIMIT_RETRY_AFTER_KEY } from './rate-limit'

function makeRequest(): Request {
  return new Request('http://admin.local/api/x', { method: 'GET' })
}

describe('withErrorHandler — Retry-After rendering (Req 7.5)', () => {
  it('renders a 429 with a Retry-After header equal to the details seconds for a RATE_LIMITED AppError', async () => {
    const handler = withErrorHandler(async () => {
      throw new AppError({
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests. Please try again in 30s.',
        statusCode: 429,
        retryable: true,
        details: { [RATE_LIMIT_RETRY_AFTER_KEY]: 30 },
      })
    })

    const res = await handler(makeRequest())

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')

    const body = (await res.json()) as { success: boolean; error: { code: string } }
    expect(body.success).toBe(false)
    expect(body.error.code).toBe(ERROR_CODES.RATE_LIMITED)
  })

  it('ceils a fractional Retry-After value to whole seconds', async () => {
    const handler = withErrorHandler(async () => {
      throw new AppError({
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests.',
        statusCode: 429,
        retryable: true,
        details: { [RATE_LIMIT_RETRY_AFTER_KEY]: 4.2 },
      })
    })

    const res = await handler(makeRequest())

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('5')
  })

  it('omits Retry-After when a RATE_LIMITED error carries no usable details', async () => {
    const handler = withErrorHandler(async () => {
      throw new AppError({
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests.',
        statusCode: 429,
        retryable: true,
      })
    })

    const res = await handler(makeRequest())

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeNull()
  })

  it('does NOT set Retry-After on a non-rate-limit AppError', async () => {
    const handler = withErrorHandler(async () => {
      throw new AppError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Invalid request data',
        statusCode: 400,
        details: { field: 'bad' },
      })
    })

    const res = await handler(makeRequest())

    expect(res.status).toBe(400)
    expect(res.headers.get('Retry-After')).toBeNull()

    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR)
  })
})
