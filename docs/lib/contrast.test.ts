import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { contrastRatio, requiredRatio, TOKEN_PAIRINGS } from '@/lib/contrast'

// Feature: docs-theming-and-versioning, Property 1: Token contrast meets WCAG AA
//
// Validates: Requirements 1.1, 3.6
//
// Two complementary checks back Property 1:
//   1. An exhaustive per-pairing assertion over the fixed, finite
//      `TOKEN_PAIRINGS` set — every defined text-on-background Design_Token
//      pairing (light + dark) clears its WCAG AA threshold (4.5:1 normal,
//      3:1 large).
//   2. A fast-check property (>= 100 runs) over random valid HSL colors that
//      exercises `contrastRatio` generally: the ratio is symmetric under
//      foreground/background swap and always lands in `[1, 21]`.

describe('Property 1: Token contrast meets WCAG AA', () => {
  // Feature: docs-theming-and-versioning, Property 1: Token contrast meets WCAG AA
  it.each(TOKEN_PAIRINGS.map((pairing) => [pairing.id, pairing] as const))(
    'pairing %s meets its WCAG AA threshold',
    (_id, pairing) => {
      const ratio = contrastRatio(pairing.foreground, pairing.background)
      expect(ratio).toBeGreaterThanOrEqual(requiredRatio(pairing.textSize))
    },
  )

  // Feature: docs-theming-and-versioning, Property 1: Token contrast meets WCAG AA
  it('contrastRatio is symmetric and within [1, 21] for any valid hsl colors', () => {
    const hslColor = fc
      .tuple(
        fc.integer({ min: 0, max: 359 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
      )
      .map(([h, s, l]) => `hsl(${h} ${s}% ${l}%)`)

    fc.assert(
      fc.property(hslColor, hslColor, (foreground, background) => {
        const ratio = contrastRatio(foreground, background)
        const swapped = contrastRatio(background, foreground)

        expect(ratio).toBeGreaterThanOrEqual(1)
        expect(ratio).toBeLessThanOrEqual(21)
        // Both colors are opaque, so swapping arguments cannot change which is
        // lighter/darker: the ratio is exactly symmetric (modulo float noise).
        expect(swapped).toBeCloseTo(ratio, 10)
      }),
      { numRuns: 100 },
    )
  })
})
