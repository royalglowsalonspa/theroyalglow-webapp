/************************************************************
 * Property-based test for the standard success envelope.
 *
 * Feature : backend-api
 * Property: 1 — Success envelope wraps data and pagination
 * Validates: Requirements 1.1, 1.2
 ************************************************************/

import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { apiSuccess } from './error-handler'

// Feature: backend-api, Property 1: Success envelope wraps data and pagination
describe('apiSuccess — success envelope', () => {
  it('wraps any JSON value as { success: true, data } and includes meta exactly when supplied', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Any JSON-serializable value.
        fc.jsonValue(),
        // Optional pagination meta of non-negative integers.
        fc.option(
          fc.record({
            page: fc.nat(),
            totalPages: fc.nat(),
            totalCount: fc.nat(),
          }),
          { nil: undefined },
        ),
        async (data, meta) => {
          const res = apiSuccess(data, meta)
          const body = await res.json()

          // Default status is 200.
          expect(res.status).toBe(200)

          // Envelope is always flagged success.
          expect(body.success).toBe(true)

          // data is preserved exactly (compared against its JSON round-trip,
          // since the helper serializes through JSON).
          const expectedData = JSON.parse(JSON.stringify(data))
          expect(body.data).toEqual(expectedData)

          // meta is present and unchanged exactly when supplied, absent otherwise.
          if (meta === undefined) {
            expect('meta' in body).toBe(false)
          } else {
            expect('meta' in body).toBe(true)
            expect(body.meta).toEqual(meta)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})
