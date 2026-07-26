/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : status-badge.test
 * Scope        : Admin — Status Badge system
 *
 * Description  : fast-check + Vitest property tests for `apps/admin/src/lib/
 *                admin/status-badge.ts`. Each `describe` block corresponds to
 *                one numbered correctness property from the
 *                admin-portal-redesign design.
 *
 * Notes        : Append-only — add a new `describe` block per property. Do NOT
 *                overwrite sibling property tests.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { BadgeVariant } from './status-badge'
import {
  labelForStatus,
  STATUS_LABEL_PLACEHOLDER,
  STATUS_VARIANT,
  variantForStatus,
} from './status-badge'

// Feature: admin-portal-redesign, Property 12: Status label is Title-Cased and always non-empty
//
// labelForStatus(status) formats a snake_case status into a human-readable
// Title Case label: every underscore becomes a single space and the first
// letter of every word is capitalised (Req 9.3). Empty / whitespace-only /
// null / undefined values yield the fixed STATUS_LABEL_PLACEHOLDER ('Unknown')
// (Req 9.4). The result is always non-empty (Req 9.1, 9.6).
//
// Validates: Requirements 9.1, 9.3, 9.4, 9.6

// A single snake_case word: one or more lowercase ASCII letters. Keeping words
// purely alphabetic guarantees their first character has a well-defined
// uppercase form, so the capitalisation assertions are unambiguous.
const wordArb = fc
  .string({ minLength: 1, maxLength: 10 })
  .map((s) => s.replace(/[^a-z]/gi, 'a').toLowerCase())
  .filter((s) => s.length > 0)

// A well-formed snake_case identifier: 1..6 words joined by single underscores
// (e.g. "follow_up", "in_progress", "active"). No leading/trailing/duplicate
// underscores, so split('_') word count is stable.
const snakeCaseArb = fc
  .array(wordArb, { minLength: 1, maxLength: 6 })
  .map((words) => words.join('_'))

// Matches strings that are empty or contain only whitespace (JS \s semantics,
// matching String.prototype.trim()).
const WHITESPACE_RE = /^\s*$/u

describe('Property 12: Status label is Title-Cased and always non-empty', () => {
  it('formats non-empty snake_case: no underscores, capitalised words, word count preserved', () => {
    fc.assert(
      fc.property(snakeCaseArb, (status) => {
        const segments = status.split('_')
        const result = labelForStatus(status)

        // (a) No underscores remain in the rendered label.
        expect(result).not.toContain('_')

        // (b) Result is always non-empty.
        expect(result.length).toBeGreaterThan(0)

        // (c) Word count is preserved: one output word per snake_case segment.
        const outWords = result.split(' ')
        expect(outWords).toHaveLength(segments.length)

        // (d) Every word's first letter is capitalised (equals its uppercase).
        for (const word of outWords) {
          const first = word.charAt(0)
          expect(first).toBe(first.toUpperCase())
        }

        // (e) The label is exactly the segments, capitalised, space-joined.
        const expected = segments.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        expect(result).toBe(expected)
      }),
      { numRuns: 25 },
    )
  })

  it('returns the fixed placeholder for empty / whitespace-only / null / undefined', () => {
    const emptyish = fc.oneof(
      fc.constant<string | null | undefined>(null),
      fc.constant<string | null | undefined>(undefined),
      fc.constant<string | null | undefined>(''),
      // whitespace-only strings of various kinds
      fc
        .array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), {
          minLength: 1,
          maxLength: 8,
        })
        .map((parts) => parts.join('')),
    )

    fc.assert(
      fc.property(emptyish, (status) => {
        const result = labelForStatus(status)
        expect(result).toBe(STATUS_LABEL_PLACEHOLDER)
        expect(result.length).toBeGreaterThan(0)
      }),
      { numRuns: 25 },
    )
  })

  it('always returns a non-empty label for any string input', () => {
    fc.assert(
      fc.property(fc.string(), (status) => {
        const result = labelForStatus(status)
        expect(result.length).toBeGreaterThan(0)

        if (WHITESPACE_RE.test(status)) {
          expect(result).toBe(STATUS_LABEL_PLACEHOLDER)
        } else {
          // Non-blank input is never collapsed to an empty label and never
          // retains an underscore.
          expect(result).not.toContain('_')
        }
      }),
      { numRuns: 25 },
    )
  })

  // ----- Explicit edge cases -------------------------------------------------

  it('Title-Cases representative recognised statuses', () => {
    expect(labelForStatus('follow_up')).toBe('Follow Up')
    expect(labelForStatus('in_progress')).toBe('In Progress')
    expect(labelForStatus('no_show')).toBe('No Show')
    expect(labelForStatus('active')).toBe('Active')
    expect(labelForStatus('confirmed')).toBe('Confirmed')
  })

  it('uses the placeholder for empty and whitespace-only input', () => {
    expect(labelForStatus('')).toBe(STATUS_LABEL_PLACEHOLDER)
    expect(labelForStatus(null)).toBe(STATUS_LABEL_PLACEHOLDER)
    expect(labelForStatus(undefined)).toBe(STATUS_LABEL_PLACEHOLDER)
    for (const blank of [' ', '   ', '\t', '\n', ' \t\n ']) {
      expect(labelForStatus(blank)).toBe(STATUS_LABEL_PLACEHOLDER)
    }
  })

  it('preserves word count for single and multi-word statuses', () => {
    expect(labelForStatus('paid').split(' ')).toHaveLength(1)
    expect(labelForStatus('follow_up').split(' ')).toHaveLength(2)
    expect(labelForStatus('a_b_c_d').split(' ')).toHaveLength(4)
  })
})

// Feature: admin-portal-redesign, Property 11: Status variant mapping with neutral fallback
//
// Property 11: Status variant mapping with neutral fallback
// Validates: Requirements 9.2, 9.4
//
// Every key in STATUS_VARIANT resolves via variantForStatus to its documented
// variant. Any string NOT present as an own key of STATUS_VARIANT, plus null /
// undefined / empty / whitespace-only input, resolves to `neutral`. Prototype
// keys ('__proto__', 'constructor', 'prototype', 'toString', etc.) must also
// resolve to `neutral` — they are not own keys of the recognised-status map.

const RECOGNISED_STATUSES = Object.keys(STATUS_VARIANT)
const VALID_VARIANTS: BadgeVariant[] = ['success', 'warning', 'error', 'neutral']

/** Prototype / inherited member names that are NOT own keys of STATUS_VARIANT. */
const PROTOTYPE_KEYS = [
  '__proto__',
  'constructor',
  'prototype',
  'hasOwnProperty',
  'toString',
  'valueOf',
  'isPrototypeOf',
  'propertyIsEnumerable',
  '__defineGetter__',
]

describe('Property 11: Status variant mapping with neutral fallback', () => {
  it('maps every recognised STATUS_VARIANT key to its documented variant', () => {
    expect(RECOGNISED_STATUSES.length).toBeGreaterThan(0)
    fc.assert(
      fc.property(fc.constantFrom(...RECOGNISED_STATUSES), (status) => {
        expect(variantForStatus(status)).toBe(STATUS_VARIANT[status])
      }),
      { numRuns: 25 },
    )
  })

  it('returns neutral for any string that is not an own key of STATUS_VARIANT', () => {
    fc.assert(
      fc.property(fc.string(), (status) => {
        fc.pre(!Object.hasOwn(STATUS_VARIANT, status))
        expect(variantForStatus(status)).toBe('neutral')
      }),
      { numRuns: 25 },
    )
  })

  it('returns neutral for null, undefined, empty, and whitespace-only input', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant<string | null | undefined>(null),
          fc.constant<string | null | undefined>(undefined),
          fc.constant<string | null | undefined>(''),
          fc
            .array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), {
              minLength: 1,
              maxLength: 10,
            })
            .map((chars) => chars.join('')),
        ),
        (status) => {
          expect(variantForStatus(status)).toBe('neutral')
        },
      ),
      { numRuns: 25 },
    )
  })

  it('returns neutral for prototype / inherited member names', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PROTOTYPE_KEYS), (status) => {
        expect(variantForStatus(status)).toBe('neutral')
      }),
      { numRuns: 25 },
    )
  })

  it('always returns one of the four valid BadgeVariants', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.constantFrom(...RECOGNISED_STATUSES),
          fc.constantFrom(...PROTOTYPE_KEYS),
          fc.constant<string | null | undefined>(null),
          fc.constant<string | null | undefined>(undefined),
        ),
        (status) => {
          expect(VALID_VARIANTS).toContain(variantForStatus(status))
        },
      ),
      { numRuns: 25 },
    )
  })
})
