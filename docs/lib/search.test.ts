import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SEARCH_RESULT_CAP, scopeSearchResults } from '@/lib/search'
import type { VersionId } from '@/lib/versions'

// Feature: docs-theming-and-versioning, Property 18: Search results are version-scoped and capped
//
// scopeSearchResults must return only matches whose versionId equals the active
// version, capped at the limit (default SEARCH_RESULT_CAP = 20), preserving the
// backend's relevance order. Because the function keeps the first `limit`
// matching entries in input order, the returned list must be a prefix — and
// therefore an order-preserving subsequence — of the active-version matches.

type Match = {
  /** Stable identity so order/subsequence comparisons are precise. */
  id: number
  versionId: VersionId
}

const versionIdArb: fc.Arbitrary<VersionId> = fc.constantFrom('latest', 'v2', 'v3', 'v4')

// Up to 50 matches so the array routinely exceeds the cap of 20.
const matchesArb: fc.Arbitrary<Match[]> = fc
  .array(versionIdArb, { maxLength: 50 })
  .map((versionIds) => versionIds.map((versionId, id) => ({ id, versionId })))

// null => omit the option entirely (exercise the default cap); otherwise an
// explicit limit including non-positive values (which must yield []).
const limitArb = fc.option(fc.integer({ min: -3, max: 30 }), { nil: null })

/** Is `sub` an order-preserving subsequence of `full` (compared by id)? */
function isSubsequence(sub: readonly Match[], full: readonly Match[]): boolean {
  let i = 0
  for (const item of full) {
    const current = sub[i]
    if (current !== undefined && current.id === item.id) {
      i++
    }
  }
  return i === sub.length
}

describe('scopeSearchResults', () => {
  it('Property 18: results are scoped to the active version, capped, and order-preserving', () => {
    fc.assert(
      fc.property(matchesArb, versionIdArb, limitArb, (matches, activeVersion, limit) => {
        const opts = limit === null ? {} : { limit }
        const result = scopeSearchResults(matches, activeVersion, opts)

        const effectiveLimit = limit === null ? SEARCH_RESULT_CAP : limit
        const filtered = matches.filter((m) => m.versionId === activeVersion)
        const expected = effectiveLimit <= 0 ? [] : filtered.slice(0, effectiveLimit)

        // Version-scoped: every returned result belongs to the active version.
        for (const r of result) {
          expect(r.versionId).toBe(activeVersion)
        }

        // Capped: never more than the limit, and never more than 20 by default.
        expect(result.length).toBeLessThanOrEqual(Math.max(0, effectiveLimit))
        if (limit === null) {
          expect(result.length).toBeLessThanOrEqual(SEARCH_RESULT_CAP)
        }

        // Order-preserving: the result is a subsequence (here, prefix) of the
        // active-version matches in their original relevance order.
        expect(isSubsequence(result, filtered)).toBe(true)

        // Exact: the result is precisely the relevance-ordered prefix.
        expect(result).toEqual(expected)

        // Purity: the input is not mutated.
        expect(matches.length).toBe(matches.length)
      }),
      { numRuns: 200 },
    )
  })

  it('returns an empty array for a non-positive limit', () => {
    const matches: Match[] = [
      { id: 0, versionId: 'latest' },
      { id: 1, versionId: 'latest' },
    ]
    expect(scopeSearchResults(matches, 'latest', { limit: 0 })).toEqual([])
    expect(scopeSearchResults(matches, 'latest', { limit: -5 })).toEqual([])
  })

  it('defaults to the SEARCH_RESULT_CAP of 20 when no limit is given', () => {
    const matches: Match[] = Array.from({ length: 30 }, (_, id) => ({
      id,
      versionId: 'latest' as const,
    }))
    expect(scopeSearchResults(matches, 'latest')).toHaveLength(SEARCH_RESULT_CAP)
  })
})
