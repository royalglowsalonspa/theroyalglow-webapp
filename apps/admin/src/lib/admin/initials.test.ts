/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : initials.test
 * Scope        : Admin — App Shell / User Identity
 *
 * Description  : fast-check + Vitest property tests for `apps/admin/src/lib/
 *                admin/initials.ts`. Each `describe` block corresponds to one
 *                numbered correctness property from the admin-portal-redesign
 *                design.
 *
 * Notes        : Append-only — add a new `describe` block per property. Do NOT
 *                overwrite sibling property tests.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { AVATAR_INITIALS_PLACEHOLDER, toInitials } from './initials'

// Feature: admin-portal-redesign, Property 2: Avatar initials are at most two uppercase letters
//
// toInitials(name) derives up to two uppercase initials from the first letters
// of the first two whitespace-separated words. Empty / whitespace-only names
// yield the fixed AVATAR_INITIALS_PLACEHOLDER ('RG'). The result is always of
// length <= 2.
//
// Validates: Requirements 3.3

// Unicode whitespace set used to detect whitespace-only names independent of
// the helper's own \s splitting (kept consistent with JS String.trim()).
const WHITESPACE_RE = /^\s*$/u

describe('Property 2: Avatar initials are at most two uppercase letters', () => {
  it('always returns <= 2 chars that are uppercase, derived from the first two words', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const result = toInitials(name)

        // (a) Length is always <= 2.
        expect(result.length).toBeLessThanOrEqual(2)

        // (b) Result equals its own uppercase form (case-insensitive chars are
        //     uppercased; case-less chars like digits/symbols are unaffected,
        //     which toUpperCase preserves).
        expect(result).toBe(result.toUpperCase())

        if (WHITESPACE_RE.test(name)) {
          // (c) Empty / whitespace-only names yield the safe placeholder.
          expect(result).toBe(AVATAR_INITIALS_PLACEHOLDER)
        } else {
          // (d) Otherwise the initials are the first letters of the first two
          //     whitespace-separated words, uppercased.
          const parts = name.trim().split(/\s+/).filter(Boolean)
          const expected = parts
            .slice(0, 2)
            .map((p) => p.charAt(0).toUpperCase())
            .join('')
          expect(result).toBe(expected)
        }
      }),
      { numRuns: 25 },
    )
  })

  it('takes initials from the first two words of multi-word names', () => {
    // Words built from letters only so the first char is always a letter.
    const wordArb = fc
      .string({ minLength: 1, maxLength: 8 })
      .map((s) => s.replace(/[^a-zA-Z]/g, 'a'))
      .filter((s) => s.length > 0)

    fc.assert(
      fc.property(fc.array(wordArb, { minLength: 1, maxLength: 6 }), (words) => {
        const name = words.join(' ')
        const result = toInitials(name)
        const expected = words
          .slice(0, 2)
          .map((w) => w.charAt(0).toUpperCase())
          .join('')
        expect(result).toBe(expected)
        expect(result.length).toBeLessThanOrEqual(2)
      }),
      { numRuns: 25 },
    )
  })

  // ----- Explicit edge cases -------------------------------------------------

  it('returns the placeholder for an empty string', () => {
    expect(toInitials('')).toBe(AVATAR_INITIALS_PLACEHOLDER)
    expect(toInitials('').length).toBeLessThanOrEqual(2)
  })

  it('returns the placeholder for whitespace-only names', () => {
    for (const name of [' ', '   ', '\t', '\n', ' \t\n ', '\u00a0']) {
      const result = toInitials(name)
      // Note: \u00a0 (NBSP) is matched by JS \s, so it is whitespace-only.
      expect(result).toBe(AVATAR_INITIALS_PLACEHOLDER)
      expect(result.length).toBeLessThanOrEqual(2)
    }
  })

  it('returns a single uppercase initial for a single-word name', () => {
    expect(toInitials('madonna')).toBe('M')
    expect(toInitials('  cher  ')).toBe('C')
    expect(toInitials('madonna').length).toBeLessThanOrEqual(2)
  })

  it('handles unicode names within the two-letter bound', () => {
    // First letters of the first two words, uppercased per Unicode rules.
    expect(toInitials('élodie ñoño')).toBe('ÉÑ')
    expect(toInitials('你好 世界')).toBe('你世')
    expect(toInitials('ωμέγα')).toBe('Ω')
    for (const name of ['élodie ñoño', '你好 世界', 'ωμέγα', 'José María García']) {
      expect(toInitials(name).length).toBeLessThanOrEqual(2)
    }
  })
})
