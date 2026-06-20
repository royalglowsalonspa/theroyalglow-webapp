/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : cors.test
 * Scope        : Property-based tests for the pure CORS core
 *
 * Description  : fast-check + Vitest property tests for `apps/admin/src/lib/
 *                cors.ts`. Verifies that `corsHeaders` reflects
 *                `Access-Control-Allow-Origin` ONLY on an exact origin match
 *                and omits the header for every other origin.
 *
 * Notes        : Append-only — add a new `describe` block per property. Do NOT
 *                overwrite sibling property tests.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { corsHeaders, isAllowedOrigin } from './cors'

// Feature: admin-subdomain-migration, Property 5: CORS reflects the allowed origin only
//
// Property 5: CORS reflects the allowed origin only
// Validates: Requirements 7.1, 7.2
//
// For any request Origin value, the admin API response includes
// `Access-Control-Allow-Origin: <allowedOrigin>` iff the request origin equals
// `allowedOrigin` (exact string equality); for every other origin (including
// null/undefined/empty and near-misses like a trailing slash, different scheme,
// or explicit port) the returned header map has NO 'Access-Control-Allow-Origin'
// key.

const ACAO = 'Access-Control-Allow-Origin'
const CANONICAL = 'https://admin.theroyalglow.in'

/** Arbitrary allowed-origin strings: the canonical admin origin plus arbitrary. */
const allowedOriginArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(CANONICAL),
  fc.webUrl(),
  fc.string(),
)

/**
 * Arbitrary request-origin values covering the whole input space:
 * - the exact canonical origin (the only value that must reflect)
 * - near-miss mutations (trailing slash, different scheme, explicit port, host)
 * - null / undefined / empty (must never reflect)
 * - arbitrary URLs and strings
 */
const requestOriginArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constant(CANONICAL),
  fc.constantFrom(
    `${CANONICAL}/`,
    'http://admin.theroyalglow.in',
    'https://admin.theroyalglow.in:443',
    'https://admin.theroyalglow.in.evil.com',
    'https://www.theroyalglow.in',
    'https://theroyalglow.in',
    'https://evil.com',
    '',
  ),
  fc.constantFrom(null, undefined),
  fc.webUrl(),
  fc.string(),
)

describe('Property 5: CORS reflects the allowed origin only', () => {
  it('reflects Access-Control-Allow-Origin iff requestOrigin === allowedOrigin', () => {
    fc.assert(
      fc.property(allowedOriginArb, requestOriginArb, (allowedOrigin, requestOrigin) => {
        const headers = corsHeaders(allowedOrigin, requestOrigin)
        const exactMatch = requestOrigin === allowedOrigin

        if (exactMatch) {
          // iff direction (←): exact match must reflect the allowed origin.
          expect(headers[ACAO]).toBe(allowedOrigin)
        } else {
          // iff direction (→): any non-match must omit the header entirely.
          expect(Object.hasOwn(headers, ACAO)).toBe(false)
        }

        // The reflection decision agrees with isAllowedOrigin.
        expect(Object.hasOwn(headers, ACAO)).toBe(isAllowedOrigin(allowedOrigin, requestOrigin))
      }),
      { numRuns: 200 },
    )
  })

  it('reflects only the exact canonical admin origin, never near-misses', () => {
    const nearMissArb = fc.constantFrom(
      `${CANONICAL}/`,
      'http://admin.theroyalglow.in',
      'https://admin.theroyalglow.in:443',
      'https://admin.theroyalglow.in.evil.com',
      'https://evil.com',
    )

    fc.assert(
      fc.property(nearMissArb, (requestOrigin) => {
        const headers = corsHeaders(CANONICAL, requestOrigin)
        expect(Object.hasOwn(headers, ACAO)).toBe(false)
      }),
      { numRuns: 100 },
    )

    // The exact match reflects.
    expect(corsHeaders(CANONICAL, CANONICAL)[ACAO]).toBe(CANONICAL)
  })

  it('never reflects for null or undefined request origins', () => {
    fc.assert(
      fc.property(
        allowedOriginArb,
        fc.constantFrom(null, undefined),
        (allowedOrigin, requestOrigin) => {
          const headers = corsHeaders(allowedOrigin, requestOrigin)
          expect(Object.hasOwn(headers, ACAO)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })
})
