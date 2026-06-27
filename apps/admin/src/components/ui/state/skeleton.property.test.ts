/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : state/skeleton.property.test
 * Scope        : Property-based test for skeleton row-count clamp
 *
 * Description  : fast-check + Vitest property test verifying that the pure
 *                `skeletonRowCount` helper consumed by the `Skeleton` presenter
 *                clamps an expected-record count into the inclusive range
 *                `[0, 10]`. For any `n >= 0` it renders exactly `min(n, 10)`
 *                rows; negative inputs floor to `0` and counts above ten cap at
 *                ten (Req 12.1).
 *
 * Notes        : Presentation-layer test only. `skeleton.tsx` is consumed as-is
 *                — this file imports its pure helper and asserts behaviour.
 ************************************************************/

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { skeletonRowCount } from './skeleton'

// Feature: admin-portal-redesign, Property 14: Skeleton row count is bounded
//
// Property 14: Skeleton row count is bounded
// Validates: Requirements 12.1
//
// For any expected record count `n >= 0`, the skeleton presenter renders
// exactly `min(n, 10)` placeholder rows. The helper's full definition clamps to
// the inclusive range `[0, 10]`:
//   skeletonRowCount(n) === Math.min(Math.max(0, n), 10)
// so negative inputs floor to 0 and counts above ten cap at ten.

const MAX_SKELETON_ROWS = 10

describe('Property 14: Skeleton row count is bounded', () => {
  it('renders exactly min(n, 10) rows for any non-negative count (n >= 0)', () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        // Core acceptance criterion (Req 12.1): for n >= 0, exactly min(n, 10).
        expect(skeletonRowCount(n)).toBe(Math.min(n, MAX_SKELETON_ROWS))
      }),
      { numRuns: 25 },
    )
  })

  it('clamps any integer (incl. negatives and large values) to [0, 10]', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        const rows = skeletonRowCount(n)

        // Matches the helper's actual definition exactly.
        expect(rows).toBe(Math.min(Math.max(0, n), MAX_SKELETON_ROWS))

        // Result is always within the rendered bounds.
        expect(rows).toBeGreaterThanOrEqual(0)
        expect(rows).toBeLessThanOrEqual(MAX_SKELETON_ROWS)

        // Negatives floor to 0; counts > 10 cap at 10.
        if (n < 0) expect(rows).toBe(0)
        if (n > MAX_SKELETON_ROWS) expect(rows).toBe(MAX_SKELETON_ROWS)
      }),
      { numRuns: 25 },
    )
  })
})
