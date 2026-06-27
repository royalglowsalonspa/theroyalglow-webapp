/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : status-badge-contrast.property.test
 * Scope        : Admin — Status Badge primitive (WCAG AA contrast)
 *
 * Description  : fast-check + Vitest property test for the StatusBadge
 *                variant -> Brand-Token colour table. For every BadgeVariant
 *                it composites the token tint over the canvas, computes the
 *                WCAG 2.1 relative-luminance contrast ratio between the text
 *                colour and the effective background, and asserts >= 4.5:1.
 *
 * Notes        : Append-only — add a new `describe` block per property. Do NOT
 *                overwrite sibling property tests. The sRGB->luminance +
 *                contrast math is implemented inline (standard WCAG 2.1
 *                formula) so the test is self-contained and does not depend on
 *                any colour library.
 ************************************************************/

import type { BadgeVariant } from '@/lib/admin/status-badge'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// Feature: admin-portal-redesign, Property 13: Every status-badge variant meets AA contrast
//
// For any BadgeVariant, the computed WCAG contrast ratio between its text
// colour and its background colour (resolved from Brand-Token hex values,
// composited over the canvas) is at least 4.5:1.
//
// Validates: Requirements 9.5

// ---------------------------------------------------------------------------
// Brand-Token hex values (packages/ui/src/styles/theme.css). These mirror the
// semantic tokens used by VARIANT_CLASSES in status-badge.tsx.
// ---------------------------------------------------------------------------
const TOKEN_HEX = {
  success: '#3f7d5c',
  'success-dark': '#2f5e45',
  warning: '#c8a961',
  error: '#b5482e',
  'warm-gray': '#3d2e1f',
  'dusty-gray': '#8c8c8c',
  'cloud-gray': '#f4f5f9',
  'canvas-white': '#ffffff',
} as const

const CANVAS = TOKEN_HEX['canvas-white']
const AA_NORMAL_TEXT = 4.5

/**
 * Per-variant pill specification mirroring VARIANT_CLASSES in
 * status-badge.tsx: the text-colour token, the background tint token, and the
 * tint alpha (e.g. `bg-success/10` = success at 0.10 alpha). Tints are
 * composited over the canvas (canvas-white) to produce the effective opaque
 * background a sighted user sees.
 */
type VariantSpec = {
  text: keyof typeof TOKEN_HEX
  bg: keyof typeof TOKEN_HEX
  bgAlpha: number
}

const VARIANT_SPEC: Record<BadgeVariant, VariantSpec> = {
  // bg-success/10 text-success-dark
  success: { text: 'success-dark', bg: 'success', bgAlpha: 0.1 },
  // bg-warning/15 text-warm-gray
  warning: { text: 'warm-gray', bg: 'warning', bgAlpha: 0.15 },
  // bg-error/10 text-error
  error: { text: 'error', bg: 'error', bgAlpha: 0.1 },
  // bg-cloud-gray text-warm-gray (opaque tint)
  neutral: { text: 'warm-gray', bg: 'cloud-gray', bgAlpha: 1 },
}

const VARIANTS = Object.keys(VARIANT_SPEC) as BadgeVariant[]

type RGB = { r: number; g: number; b: number }

/** Parse a `#rrggbb` hex string into 0..255 channels. */
function hexToRgb(hex: string): RGB {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Invalid hex colour: ${hex}`)
  }
  const int = Number.parseInt(hex.slice(1), 16)
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff }
}

/**
 * Alpha-composite `fg` over `bg` (the "source-over" / `simple alpha
 * compositing` operation): out = alpha*fg + (1-alpha)*bg, per channel.
 * Used to resolve a translucent Tailwind tint (e.g. `/10`) into the opaque
 * colour rendered over the canvas.
 */
function composite(fg: RGB, bg: RGB, alpha: number): RGB {
  return {
    r: alpha * fg.r + (1 - alpha) * bg.r,
    g: alpha * fg.g + (1 - alpha) * bg.g,
    b: alpha * fg.b + (1 - alpha) * bg.b,
  }
}

/** Convert a single 0..255 sRGB channel to its 0..1 linear-light value. */
function channelToLinear(value255: number): number {
  const c = value255 / 255
  return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.1 relative luminance of an sRGB colour. */
function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
}

/** WCAG 2.1 contrast ratio between two colours (always >= 1). */
function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Effective contrast ratio for a single badge variant. */
function ratioForVariant(variant: BadgeVariant): number {
  const spec = VARIANT_SPEC[variant]
  const canvas = hexToRgb(CANVAS)
  const text = hexToRgb(TOKEN_HEX[spec.text])
  const effectiveBg = composite(hexToRgb(TOKEN_HEX[spec.bg]), canvas, spec.bgAlpha)
  return contrastRatio(text, effectiveBg)
}

describe('Property 13: Every status-badge variant meets AA contrast', () => {
  it('every BadgeVariant has text-on-background contrast >= 4.5:1', () => {
    expect(VARIANTS.length).toBe(4)
    fc.assert(
      fc.property(fc.constantFrom(...VARIANTS), (variant) => {
        const ratio = ratioForVariant(variant)
        // A failure here is a real design bug in the variant -> token table,
        // not a test-threshold issue: the tint/text colour must be adjusted in
        // status-badge.tsx. Never loosen 4.5:1 (WCAG 2.1 AA, normal text).
        expect(
          ratio,
          `variant "${variant}" contrast ${ratio.toFixed(3)}:1 is below AA ${AA_NORMAL_TEXT}:1`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
      }),
      { numRuns: 25 },
    )
  })

  // ----- Explicit per-variant edge cases (deterministic) ---------------------
  it('reports the exact computed ratio for each variant', () => {
    for (const variant of VARIANTS) {
      const ratio = ratioForVariant(variant)
      expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })

  // ----- Sanity checks on the WCAG math -------------------------------------
  it('computes known reference contrasts (black/white = 21:1, identical = 1:1)', () => {
    const black = hexToRgb('#000000')
    const white = hexToRgb('#ffffff')
    expect(contrastRatio(black, white)).toBeCloseTo(21, 1)
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5)
  })
})
