/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : app-error.property.test
 * Scope        : Property-based test — AppError construction
 *
 * Property     : Property 2: AppError Construction Invariants
 * Validates    : Requirements 11.2, 11.4
 *
 * Description  : fast-check + Vitest property tests for AppError and its
 *                factory functions (packages/errors/src/app-error.ts). Every
 *                API error response is built from an AppError, so the class has
 *                to preserve its fields exactly and default the optional ones
 *                predictably for EVERY registered error code.
 *
 * Responsibilities :
 * - Every ERROR_CODES member produces a well-formed AppError
 * - Instances are `instanceof Error` and carry `name === 'AppError'`
 * - code / message / statusCode / details are preserved exactly
 * - isOperational defaults to true, retryable defaults to false
 * - statusCode always stays inside the 400–599 error range
 * - Factory functions emit their documented code + statusCode
 * - The serialisable field snapshot survives a JSON round-trip
 *
 * Features / Functionality :
 * - The error code generator sweeps the WHOLE registry, so a newly added code
 *   is covered automatically
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, ../app-error, ../codes
 *
 * Notes        : Implements design Correctness Property 2 only.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  gone,
  notFound,
  serviceUnavailable,
} from '../app-error'
import { ERROR_CODES, type ErrorCode } from '../codes'

const ALL_CODES = Object.values(ERROR_CODES) as ErrorCode[]

const codeArb = fc.constantFrom(...ALL_CODES)
const messageArb = fc.string({ maxLength: 80 })
const statusCodeArb = fc.integer({ min: 400, max: 599 })
const detailsArb = fc.oneof(
  fc.dictionary(
    fc.string({ minLength: 1, maxLength: 8 }),
    fc.array(fc.string(), { maxLength: 3 }),
    {
      maxKeys: 4,
    },
  ),
  fc.array(fc.string({ maxLength: 10 }), { maxLength: 4 }),
  fc.string({ maxLength: 20 }),
  fc.constant(null),
)

/** The fields an API error envelope is built from. */
function snapshot(error: AppError): Record<string, unknown> {
  return {
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
    isOperational: error.isOperational,
    retryable: error.retryable,
    details: error.details ?? null,
  }
}

// ---------------------------------------------------------------------------
// Property 2: AppError Construction Invariants
// ---------------------------------------------------------------------------

describe('Property 2: AppError Construction Invariants — constructor', () => {
  it('preserves every provided field for any registered code and 4xx/5xx status', () => {
    fc.assert(
      fc.property(
        codeArb,
        messageArb,
        statusCodeArb,
        fc.boolean(),
        fc.boolean(),
        detailsArb,
        (code, message, statusCode, isOperational, retryable, details) => {
          const error = new AppError({
            code,
            message,
            statusCode,
            isOperational,
            retryable,
            details,
          })

          expect(error).toBeInstanceOf(Error)
          expect(error).toBeInstanceOf(AppError)
          expect(error.name).toBe('AppError')
          expect(error.code).toBe(code)
          expect(error.message).toBe(message)
          expect(error.statusCode).toBe(statusCode)
          expect(error.isOperational).toBe(isOperational)
          expect(error.retryable).toBe(retryable)
          expect(error.details).toEqual(details)
          // The status code never leaves the HTTP error range.
          expect(error.statusCode).toBeGreaterThanOrEqual(400)
          expect(error.statusCode).toBeLessThanOrEqual(599)
        },
      ),
      { numRuns: 400 },
    )
  })

  it('defaults isOperational to true and retryable to false when omitted', () => {
    fc.assert(
      fc.property(codeArb, messageArb, statusCodeArb, (code, message, statusCode) => {
        const error = new AppError({ code, message, statusCode })

        expect(error.isOperational).toBe(true)
        expect(error.retryable).toBe(false)
        expect(error.details).toBeUndefined()
      }),
      { numRuns: 300 },
    )
  })

  it('preserves the cause chain when one is supplied', () => {
    fc.assert(
      fc.property(
        codeArb,
        messageArb,
        statusCodeArb,
        messageArb,
        (code, message, statusCode, causeMessage) => {
          const cause = new Error(causeMessage)
          const error = new AppError({ code, message, statusCode, cause })

          expect(error.cause).toBe(cause)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('round-trips its serialisable field snapshot through JSON', () => {
    fc.assert(
      fc.property(
        codeArb,
        messageArb,
        statusCodeArb,
        detailsArb,
        (code, message, statusCode, details) => {
          const error = new AppError({ code, message, statusCode, details })
          const fields = snapshot(error)

          expect(JSON.parse(JSON.stringify(fields))).toEqual(fields)
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('Property 2: AppError Construction Invariants — factory functions', () => {
  it('notFound() always yields NOT_FOUND / 404', () => {
    fc.assert(
      fc.property(messageArb, (message) => {
        const error = notFound(message)

        expect(error).toBeInstanceOf(AppError)
        expect(error.name).toBe('AppError')
        expect(error.code).toBe(ERROR_CODES.NOT_FOUND)
        expect(error.statusCode).toBe(404)
        expect(error.message).toBe(message)
        expect(error.isOperational).toBe(true)
        expect(error.retryable).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('forbidden() always yields FORBIDDEN / 403', () => {
    fc.assert(
      fc.property(messageArb, (message) => {
        const error = forbidden(message)

        expect(error.code).toBe(ERROR_CODES.FORBIDDEN)
        expect(error.statusCode).toBe(403)
        expect(error.message).toBe(message)
        expect(error.retryable).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('badRequest() always yields VALIDATION_ERROR / 400 and keeps its details', () => {
    fc.assert(
      fc.property(messageArb, detailsArb, (message, details) => {
        const error = badRequest(message, details)

        expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR)
        expect(error.statusCode).toBe(400)
        expect(error.message).toBe(message)
        expect(error.details).toEqual(details)
      }),
      { numRuns: 300 },
    )
  })

  it('conflict() always yields the supplied code with 409', () => {
    fc.assert(
      fc.property(codeArb, messageArb, (code, message) => {
        const error = conflict(code, message)

        expect(error.code).toBe(code)
        expect(error.statusCode).toBe(409)
        expect(error.message).toBe(message)
      }),
      { numRuns: 300 },
    )
  })

  it('gone() always yields ENDPOINT_GONE / 410 and is never retryable', () => {
    fc.assert(
      fc.property(messageArb, (message) => {
        const error = gone(message)

        expect(error.code).toBe(ERROR_CODES.ENDPOINT_GONE)
        expect(error.statusCode).toBe(410)
        expect(error.retryable).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('serviceUnavailable() always yields UPSTREAM_ERROR / 502 and is retryable', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (service) => {
        const error = serviceUnavailable(service)

        expect(error.code).toBe(ERROR_CODES.UPSTREAM_ERROR)
        expect(error.statusCode).toBe(502)
        expect(error.retryable).toBe(true)
        expect(error.message).toBe(`Service unavailable: ${service}`)
      }),
      { numRuns: 200 },
    )
  })

  it('keeps every factory inside the 400–599 range, whatever the message', () => {
    fc.assert(
      fc.property(codeArb, messageArb, (code, message) => {
        const errors = [
          notFound(message),
          forbidden(message),
          badRequest(message),
          conflict(code, message),
          gone(message),
          serviceUnavailable(message),
        ]

        for (const error of errors) {
          expect(error).toBeInstanceOf(Error)
          expect(error.name).toBe('AppError')
          expect(error.statusCode).toBeGreaterThanOrEqual(400)
          expect(error.statusCode).toBeLessThanOrEqual(599)
          expect(ALL_CODES).toContain(error.code)
        }
      }),
      { numRuns: 200 },
    )
  })
})
