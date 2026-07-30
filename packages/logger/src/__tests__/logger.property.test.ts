/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : logger.property.test
 * Scope        : Property-based test — Structured JSON logger
 *
 * Property     : Property 5: Structured Logger JSON Output
 * Validates    : Requirements 13.2, 13.3, 13.4
 *
 * Description  : fast-check + Vitest property tests for createLogger
 *                (packages/logger/src/index.ts). Log aggregation (BetterStack /
 *                Sentry) only works if EVERY emitted line is parseable JSON
 *                carrying the same required fields, so those are asserted
 *                across generated configs, messages and payloads.
 *
 * Responsibilities :
 * - createLogger returns all five level methods for any valid config
 * - Every call emits exactly one JSON-parseable line
 * - level / message / service / environment always match the call and config
 * - timestamp is always a valid ISO 8601 UTC instant
 * - `data` is omitted when absent and preserved (JSON-wise) when present
 * - Awkward-but-serialisable payloads (deep nesting, unicode, control
 *   characters, `undefined` members) never throw and never corrupt the line
 *
 * Features / Functionality :
 * - console.log is spied per property run so emitted lines can be inspected
 *
 * Tech Stack   : Vitest + fast-check
 * Layer        : Test
 *
 * Dependencies : fast-check, vitest, ../index
 *
 * Notes        : Implements design Correctness Property 5 only. The property
 *                scopes `data` to serialisable payloads (a JSON logger's
 *                contract), so non-serialisable input such as a circular
 *                reference is deliberately out of scope here.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { createLogger, type LogLevel } from '../index'

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal']

// ISO 8601 UTC, exactly as `Date.prototype.toISOString()` emits it.
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const configArb = fc.record({
  service: fc.string({ minLength: 1, maxLength: 30 }),
  environment: fc.constantFrom('development', 'test', 'pprd', 'production'),
})

// Messages are arbitrary text: unicode, quotes, newlines and control characters
// all have to survive JSON encoding intact.
const messageArb = fc.string({ maxLength: 120 })

// Awkward but serialisable payloads — nested objects, arrays, nulls, and
// `undefined` members (which JSON.stringify drops).
const jsonLeafArb = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
)
const payloadArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 10 }),
  fc.oneof(
    { depthSize: 'small' },
    jsonLeafArb,
    fc.array(jsonLeafArb, { maxLength: 4 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), jsonLeafArb, { maxKeys: 4 }),
  ),
  { maxKeys: 6 },
)

/** Runs `emit` with console.log captured, returning every emitted argument. */
function captureLines(emit: () => void): unknown[] {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  try {
    emit()
    return spy.mock.calls.map((call) => call[0])
  } finally {
    spy.mockRestore()
  }
}

// ---------------------------------------------------------------------------
// Property 5: Structured Logger JSON Output
// ---------------------------------------------------------------------------

describe('Property 5: Structured Logger JSON Output — logger shape', () => {
  it('returns debug, info, warn, error and fatal methods for any valid config', () => {
    fc.assert(
      fc.property(configArb, (config) => {
        const logger = createLogger(config)

        for (const level of LEVELS) {
          expect(typeof logger[level]).toBe('function')
        }
      }),
      { numRuns: 200 },
    )
  })
})

describe('Property 5: Structured Logger JSON Output — emitted entry', () => {
  it('emits exactly one JSON-parseable line with the required fields', () => {
    fc.assert(
      fc.property(configArb, fc.constantFrom(...LEVELS), messageArb, (config, level, message) => {
        const lines = captureLines(() => {
          createLogger(config)[level](message)
        })

        expect(lines).toHaveLength(1)
        expect(typeof lines[0]).toBe('string')

        const entry = JSON.parse(lines[0] as string) as Record<string, unknown>

        expect(entry.level).toBe(level)
        expect(entry.message).toBe(message)
        expect(entry.service).toBe(config.service)
        expect(entry.environment).toBe(config.environment)
        expect(typeof entry.timestamp).toBe('string')
        expect(entry.timestamp as string).toMatch(ISO_8601_UTC)
        // A valid instant that survives an ISO round-trip.
        const parsed = new Date(entry.timestamp as string)
        expect(Number.isNaN(parsed.getTime())).toBe(false)
        expect(parsed.toISOString()).toBe(entry.timestamp)
        // No `data` key at all when no payload was supplied.
        expect('data' in entry).toBe(false)
      }),
      { numRuns: 400 },
    )
  })

  it('preserves any serialisable payload under `data` without throwing', () => {
    fc.assert(
      fc.property(
        configArb,
        fc.constantFrom(...LEVELS),
        messageArb,
        payloadArb,
        (config, level, message, data) => {
          const lines = captureLines(() => {
            createLogger(config)[level](message, data)
          })

          expect(lines).toHaveLength(1)

          const entry = JSON.parse(lines[0] as string) as Record<string, unknown>

          expect(entry.level).toBe(level)
          expect(entry.message).toBe(message)
          expect(entry.service).toBe(config.service)
          expect(entry.environment).toBe(config.environment)
          expect(entry.timestamp as string).toMatch(ISO_8601_UTC)
          // JSON drops `undefined` members, so compare against the JSON view of
          // the payload rather than the raw object.
          expect(entry.data).toEqual(JSON.parse(JSON.stringify(data)))
        },
      ),
      { numRuns: 400 },
    )
  })

  it('keeps each level independent — every method emits its own level', () => {
    fc.assert(
      fc.property(configArb, messageArb, (config, message) => {
        const logger = createLogger(config)
        const lines = captureLines(() => {
          for (const level of LEVELS) {
            logger[level](message)
          }
        })

        expect(lines).toHaveLength(LEVELS.length)
        expect(
          lines.map((line) => (JSON.parse(line as string) as Record<string, unknown>).level),
        ).toEqual(LEVELS)
      }),
      { numRuns: 200 },
    )
  })
})
