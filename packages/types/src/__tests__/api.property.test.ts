/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : api.property.test
 * Scope        : Property-based test — API response envelope schemas
 *
 * Property     : Property 1: API Response Schema Validation Round-Trip
 * Validates    : Requirements 10.2, 10.3
 *
 * Description  : fast-check + Vitest property tests for the shared API response
 *                envelope (packages/types/src/api.ts). Every endpoint returns
 *                either `{ success: true, data, meta? }` or
 *                `{ success: false, error: {...} }`, so these schemas are the
 *                contract every route is held to.
 *
 * Responsibilities :
 * - Any valid data wrapped in the success shape parses and round-trips
 * - Malformed success shapes (missing/false `success`, missing/mistyped `data`,
 *   out-of-range pagination meta) are ALWAYS rejected
 * - Any well-formed error object parses and round-trips
 * - Error objects missing a required field, or with an out-of-range
 *   statusCode, are ALWAYS rejected
 *
 * Features / Functionality :
 * - Generators are constrained to the real envelope shape: realistic
 *   `req_<12 chars>` request ids, integer paise payloads, HTTP 400–599 codes
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, zod, ../api
 *
 * Notes        : Implements design Correctness Property 1 only.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { apiErrorResponseSchema, apiSuccessSchema } from '../api'

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// A `{ schema, value }` pair so the generic factory can be exercised across the
// data shapes real endpoints return: scalars, lists and domain records.
type DataCase = { schema: z.ZodTypeAny; value: unknown; wrongValue: unknown }

const dataCaseArb: fc.Arbitrary<DataCase> = fc.oneof(
  fc.string().map((value) => ({ schema: z.string(), value, wrongValue: 42 })),
  fc.integer().map((value) => ({ schema: z.number(), value, wrongValue: 'not-a-number' })),
  fc.boolean().map((value) => ({ schema: z.boolean(), value, wrongValue: 'true' })),
  fc
    .array(fc.string(), { maxLength: 5 })
    .map((value) => ({ schema: z.array(z.string()), value, wrongValue: [1, 2, 3] })),
  fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 12 }),
      name: fc.string({ maxLength: 20 }),
      // Money is always integer paise — never a float.
      pricePaise: fc.integer({ min: 0, max: 10_000_000 }),
    })
    .map((value) => ({
      schema: z.object({
        id: z.string(),
        name: z.string(),
        pricePaise: z.number().int().nonnegative(),
      }),
      value,
      wrongValue: { id: 1, name: null, pricePaise: 'free' },
    })),
)

const metaArb = fc.record({
  page: fc.integer({ min: 1, max: 1000 }),
  totalPages: fc.integer({ min: 0, max: 1000 }),
  totalCount: fc.integer({ min: 0, max: 100_000 }),
})

// Request ids are `req_${nanoid(12)}` — url-safe alphabet.
const NANOID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
const requestIdArb = fc
  .string({ unit: fc.constantFrom(...NANOID_ALPHABET), minLength: 12, maxLength: 12 })
  .map((suffix) => `req_${suffix}`)

const errorCodeArb = fc.constantFrom(
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
)

const errorPayloadArb = fc.record(
  {
    code: errorCodeArb,
    message: fc.string({ maxLength: 60 }),
    statusCode: fc.integer({ min: 400, max: 599 }),
    requestId: requestIdArb,
    details: fc.option(fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.string()), {
      nil: undefined,
    }),
    retryable: fc.option(fc.boolean(), { nil: undefined }),
  },
  { requiredKeys: ['code', 'message', 'statusCode', 'requestId'] },
)

/** Strips keys whose value is `undefined` so round-trip comparison is exact. */
function defined<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

// ---------------------------------------------------------------------------
// Property 1: API Response Schema Validation Round-Trip
// ---------------------------------------------------------------------------

describe('Property 1: API Response Schema Validation Round-Trip — success shape', () => {
  it('accepts and round-trips any valid data wrapped in the success shape', () => {
    fc.assert(
      fc.property(dataCaseArb, fc.option(metaArb, { nil: undefined }), (dataCase, meta) => {
        const envelope = defined({ success: true, data: dataCase.value, meta })
        const result = apiSuccessSchema(dataCase.schema).safeParse(envelope)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toEqual(envelope)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('always rejects a success envelope with a missing or falsy `success` flag', () => {
    fc.assert(
      fc.property(dataCaseArb, (dataCase) => {
        const schema = apiSuccessSchema(dataCase.schema)

        expect(schema.safeParse({ success: false, data: dataCase.value }).success).toBe(false)
        expect(schema.safeParse({ data: dataCase.value }).success).toBe(false)
        expect(schema.safeParse({ success: 'true', data: dataCase.value }).success).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('always rejects a success envelope with missing or mistyped data', () => {
    fc.assert(
      fc.property(dataCaseArb, (dataCase) => {
        const schema = apiSuccessSchema(dataCase.schema)

        expect(schema.safeParse({ success: true }).success).toBe(false)
        expect(schema.safeParse({ success: true, data: dataCase.wrongValue }).success).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  it('always rejects out-of-range pagination meta', () => {
    fc.assert(
      fc.property(dataCaseArb, metaArb, (dataCase, meta) => {
        const schema = apiSuccessSchema(dataCase.schema)
        const base = { success: true, data: dataCase.value }

        // page must be a positive integer
        expect(schema.safeParse({ ...base, meta: { ...meta, page: 0 } }).success).toBe(false)
        expect(schema.safeParse({ ...base, meta: { ...meta, page: -meta.page } }).success).toBe(
          false,
        )
        expect(schema.safeParse({ ...base, meta: { ...meta, page: 1.5 } }).success).toBe(false)
        // totals must be non-negative integers
        expect(schema.safeParse({ ...base, meta: { ...meta, totalPages: -1 } }).success).toBe(false)
        expect(schema.safeParse({ ...base, meta: { ...meta, totalCount: -1 } }).success).toBe(false)
        // meta is an object, not a scalar
        expect(schema.safeParse({ ...base, meta: meta.page }).success).toBe(false)
      }),
      { numRuns: 200 },
    )
  })
})

describe('Property 1: API Response Schema Validation Round-Trip — error shape', () => {
  it('accepts and round-trips any well-formed error payload', () => {
    fc.assert(
      fc.property(errorPayloadArb, (error) => {
        const envelope = { success: false, error: defined(error) }
        const result = apiErrorResponseSchema.safeParse(envelope)

        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toEqual(envelope)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('always rejects an error payload missing a required field', () => {
    const REQUIRED = ['code', 'message', 'statusCode', 'requestId'] as const

    fc.assert(
      fc.property(errorPayloadArb, fc.constantFrom(...REQUIRED), (error, omitted) => {
        const partial = defined(error)
        delete partial[omitted]

        expect(apiErrorResponseSchema.safeParse({ success: false, error: partial }).success).toBe(
          false,
        )
      }),
      { numRuns: 300 },
    )
  })

  it('always rejects a statusCode outside the 400–599 error range', () => {
    fc.assert(
      fc.property(
        errorPayloadArb,
        fc.oneof(fc.integer({ min: -1000, max: 399 }), fc.integer({ min: 600, max: 5000 })),
        (error, statusCode) => {
          const envelope = { success: false, error: { ...defined(error), statusCode } }

          expect(apiErrorResponseSchema.safeParse(envelope).success).toBe(false)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('always rejects an error envelope whose `success` flag is not false', () => {
    fc.assert(
      fc.property(errorPayloadArb, (error) => {
        const payload = defined(error)

        expect(apiErrorResponseSchema.safeParse({ success: true, error: payload }).success).toBe(
          false,
        )
        expect(apiErrorResponseSchema.safeParse({ error: payload }).success).toBe(false)
        // The error object itself is mandatory.
        expect(apiErrorResponseSchema.safeParse({ success: false }).success).toBe(false)
      }),
      { numRuns: 200 },
    )
  })
})
