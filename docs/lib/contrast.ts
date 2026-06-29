/**
 * WCAG 2.1 relative-luminance contrast utilities for the Docs_Site Theme_System.
 *
 * Pure functions, no I/O. This module backs **Property 1: Token contrast meets
 * WCAG AA** (task 2.5) by:
 *   1. parsing the color formats used by the Design_Tokens table
 *      (`hsl(h s% l%)`, `hsl(h s% l% / a)`, and hex), and
 *   2. computing the WCAG contrast ratio `(L1 + 0.05) / (L2 + 0.05)` between a
 *      foreground and a background color (Req 1.1, 3.6).
 *
 * Colors carrying alpha are flattened by alpha compositing ("source-over") in
 * gamma-encoded sRGB — the space CSS composites in — onto an opaque base before
 * luminance is computed. The exported `TOKEN_PAIRINGS` enumerate every
 * text-on-background Design_Token pairing (light and dark) so the property test
 * can assert each clears 4.5:1 (normal text) / 3:1 (large text).
 *
 * Edge-safe: no Node or DOM APIs, only arithmetic and string parsing.
 */

/** An sRGB color with straight (non-premultiplied) alpha, channels in `[0, 1]`. */
export type Rgba = {
  /** Red channel, gamma-encoded sRGB, `0..1`. */
  r: number
  /** Green channel, gamma-encoded sRGB, `0..1`. */
  g: number
  /** Blue channel, gamma-encoded sRGB, `0..1`. */
  b: number
  /** Straight alpha, `0..1` (1 = fully opaque). */
  a: number
}

/** Clamp a number into the inclusive `[min, max]` range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Convert an HSL triple to gamma-encoded sRGB channels in `[0, 1]`.
 *
 * @param h Hue in degrees (any real number; reduced modulo 360).
 * @param s Saturation in `[0, 1]`.
 * @param l Lightness in `[0, 1]`.
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2

  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (hue < 60) {
    r1 = c
    g1 = x
  } else if (hue < 120) {
    r1 = x
    g1 = c
  } else if (hue < 180) {
    g1 = c
    b1 = x
  } else if (hue < 240) {
    g1 = x
    b1 = c
  } else if (hue < 300) {
    r1 = x
    b1 = c
  } else {
    r1 = c
    b1 = x
  }

  return { r: r1 + m, g: g1 + m, b: b1 + m }
}

/** Parse an alpha token (`'0.12'`, `'50%'`, or `undefined`) to `[0, 1]`. */
function parseAlpha(token: string | undefined): number {
  if (token === undefined) {
    return 1
  }
  const trimmed = token.trim()
  if (trimmed.endsWith('%')) {
    return clamp(Number.parseFloat(trimmed.slice(0, -1)) / 100, 0, 1)
  }
  return clamp(Number.parseFloat(trimmed), 0, 1)
}

/** Expand a hex digit pair / single nibble to a `0..1` channel value. */
function hexPairToUnit(pair: string): number {
  return Number.parseInt(pair, 16) / 255
}

/** Parse a hex color (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) to {@link Rgba}. */
function parseHex(input: string): Rgba {
  const hex = input.slice(1)
  if (hex.length === 3 || hex.length === 4) {
    // `slice(i, i + 1)` always yields a string (empty if out of range), so the
    // doubled nibble matches the `hex[i] + hex[i]` form without a possibly-
    // undefined element access.
    const r = hexPairToUnit(hex.slice(0, 1).repeat(2))
    const g = hexPairToUnit(hex.slice(1, 2).repeat(2))
    const b = hexPairToUnit(hex.slice(2, 3).repeat(2))
    const a = hex.length === 4 ? hexPairToUnit(hex.slice(3, 4).repeat(2)) : 1
    return { r, g, b, a }
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = hexPairToUnit(hex.slice(0, 2))
    const g = hexPairToUnit(hex.slice(2, 4))
    const b = hexPairToUnit(hex.slice(4, 6))
    const a = hex.length === 8 ? hexPairToUnit(hex.slice(6, 8)) : 1
    return { r, g, b, a }
  }
  throw new Error(`Invalid hex color: ${input}`)
}

/**
 * Parse an `hsl(...)` color in the formats the Design_Tokens use:
 * `hsl(40 44% 98%)`, `hsl(40 44% 98% / 0.12)`, and the comma-separated
 * equivalents `hsl(40, 44%, 98%)` / `hsla(40, 44%, 98%, 0.12)`.
 */
function parseHsl(input: string): Rgba {
  const open = input.indexOf('(')
  const close = input.lastIndexOf(')')
  if (open === -1 || close === -1) {
    throw new Error(`Invalid hsl color: ${input}`)
  }
  const inner = input.slice(open + 1, close).trim()

  // Split optional alpha after a slash, then split the H S L components on
  // commas or whitespace.
  const [colorPart, alphaPart] = inner.split('/')
  if (colorPart === undefined) {
    throw new Error(`Invalid hsl color: ${input}`)
  }
  const parts = colorPart
    .trim()
    .split(/[\s,]+/)
    .filter((token) => token.length > 0)

  const [hStr, sStr, lStr] = parts
  if (hStr === undefined || sStr === undefined || lStr === undefined) {
    throw new Error(`Invalid hsl color: ${input}`)
  }

  const h = Number.parseFloat(hStr)
  const s = clamp(Number.parseFloat(sStr) / 100, 0, 1)
  const l = clamp(Number.parseFloat(lStr) / 100, 0, 1)
  // A 4th comma-separated component (hsla legacy) is the alpha.
  const alpha = parseAlpha(alphaPart ?? parts[3])

  const { r, g, b } = hslToRgb(h, s, l)
  return { r, g, b, a: alpha }
}

/**
 * Parse an `rgb(...)` / `rgba(...)` color (space or comma separated, optional
 * `/ alpha`). Channels are `0..255` integers; alpha is `0..1` or a percentage.
 */
function parseRgb(input: string): Rgba {
  const open = input.indexOf('(')
  const close = input.lastIndexOf(')')
  if (open === -1 || close === -1) {
    throw new Error(`Invalid rgb color: ${input}`)
  }
  const inner = input.slice(open + 1, close).trim()
  const [colorPart, alphaPart] = inner.split('/')
  if (colorPart === undefined) {
    throw new Error(`Invalid rgb color: ${input}`)
  }
  const parts = colorPart
    .trim()
    .split(/[\s,]+/)
    .filter((token) => token.length > 0)

  const [rStr, gStr, bStr] = parts
  if (rStr === undefined || gStr === undefined || bStr === undefined) {
    throw new Error(`Invalid rgb color: ${input}`)
  }

  const r = clamp(Number.parseFloat(rStr) / 255, 0, 1)
  const g = clamp(Number.parseFloat(gStr) / 255, 0, 1)
  const b = clamp(Number.parseFloat(bStr) / 255, 0, 1)
  const a = parseAlpha(alphaPart ?? parts[3])
  return { r, g, b, a }
}

/**
 * Parse a color token into straight-alpha gamma-encoded sRGB.
 *
 * Accepts the formats present in the Design_Tokens table plus the serialized
 * form produced by {@link compositeOver} flattening: `hsl(...)` (space or comma
 * separated, optional `/ alpha`), hex (`#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`),
 * and `rgb(...)`/`rgba(...)`. Throws on anything else so a malformed token fails
 * loudly rather than silently scoring a passing contrast ratio.
 */
export function parseColor(input: string): Rgba {
  const value = input.trim()
  if (value.startsWith('#')) {
    return parseHex(value)
  }
  const lower = value.toLowerCase()
  if (lower.startsWith('hsl')) {
    return parseHsl(value)
  }
  if (lower.startsWith('rgb')) {
    return parseRgb(value)
  }
  throw new Error(`Unsupported color format: ${input}`)
}

/**
 * Alpha-composite `top` over `bottom` ("source-over") in gamma-encoded sRGB.
 *
 * CSS composites translucent surfaces in the gamma-encoded sRGB space, so the
 * blend is performed directly on the parsed channels (no linearization). The
 * result's alpha is `aₜ + a_b·(1 − aₜ)`; when `bottom` is opaque the result is
 * opaque, which is the case for every Design_Token pairing here.
 */
export function compositeOver(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a)
  if (a === 0) {
    return { r: 0, g: 0, b: 0, a: 0 }
  }
  const blend = (ct: number, cb: number): number => (ct * top.a + cb * bottom.a * (1 - top.a)) / a
  return {
    r: blend(top.r, bottom.r),
    g: blend(top.g, bottom.g),
    b: blend(top.b, bottom.b),
    a,
  }
}

/** Linearize a single gamma-encoded sRGB channel per WCAG 2.1. */
function linearizeChannel(channel: number): number {
  return channel <= 0.039_28 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

/**
 * Compute the WCAG 2.1 relative luminance of an **opaque** sRGB color.
 *
 * Any alpha on the input is ignored; flatten translucent colors with
 * {@link compositeOver} first. Returns a value in `[0, 1]`.
 */
export function relativeLuminance(color: Rgba): number {
  const r = linearizeChannel(color.r)
  const g = linearizeChannel(color.g)
  const b = linearizeChannel(color.b)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Compute the WCAG 2.1 contrast ratio between a foreground and background color.
 *
 * Both arguments may be color strings (any format {@link parseColor} accepts) or
 * already-parsed {@link Rgba} values. If the foreground carries alpha it is
 * composited over the background first (per the WCAG note that contrast is
 * evaluated against the color the text actually paints onto). The background is
 * assumed opaque; flatten a translucent background with {@link compositeOver}
 * (over the page surface) before passing it in — `TOKEN_PAIRINGS` does this for
 * the translucent accent surface.
 *
 * @returns The ratio `(L_lighter + 0.05) / (L_darker + 0.05)`, in `[1, 21]`.
 */
export function contrastRatio(foreground: string | Rgba, background: string | Rgba): number {
  const fg = typeof foreground === 'string' ? parseColor(foreground) : foreground
  const bg = typeof background === 'string' ? parseColor(background) : background

  const resolvedFg = fg.a < 1 ? compositeOver(fg, bg) : fg

  const l1 = relativeLuminance(resolvedFg)
  const l2 = relativeLuminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** A single Design_Token color set (one color scheme). */
type TokenSet = {
  background: string
  foreground: string
  mutedForeground: string
  card: string
  cardForeground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  /** Translucent accent surface — flattened over `background` for contrast. */
  accent: string
  /** Text color used on the accent surface (the primary token). */
  accentForeground: string
}

/**
 * Light-mode Design_Tokens (from design.md → Design_Tokens, `@theme {}` block).
 * Values are copied verbatim so the contrast property test verifies the exact
 * tokens shipped in `app/global.css`.
 */
export const LIGHT_TOKENS: TokenSet = {
  background: 'hsl(40 44% 98%)',
  foreground: 'hsl(24 40% 10%)',
  mutedForeground: 'hsl(28 12% 33%)',
  card: 'hsl(40 40% 99%)',
  cardForeground: 'hsl(24 40% 10%)',
  popover: 'hsl(40 40% 99%)',
  popoverForeground: 'hsl(24 40% 10%)',
  primary: 'hsl(40 75% 28%)',
  primaryForeground: 'hsl(40 44% 98%)',
  accent: 'hsl(40 60% 50% / 0.12)',
  accentForeground: 'hsl(40 75% 28%)',
}

/**
 * Dark-mode Design_Tokens (from design.md → Design_Tokens, `.dark {}` block).
 */
export const DARK_TOKENS: TokenSet = {
  background: 'hsl(24 30% 7%)',
  foreground: 'hsl(40 40% 92%)',
  mutedForeground: 'hsl(36 18% 70%)',
  card: 'hsl(24 25% 10%)',
  cardForeground: 'hsl(40 40% 92%)',
  popover: 'hsl(24 25% 9%)',
  popoverForeground: 'hsl(40 40% 92%)',
  primary: 'hsl(42 80% 65%)',
  primaryForeground: 'hsl(24 30% 7%)',
  accent: 'hsl(42 80% 60% / 0.18)',
  accentForeground: 'hsl(42 80% 65%)',
}

/** WCAG text-size classification driving the required contrast threshold. */
export type TextSize = 'normal' | 'large'

/** A text-on-background pairing to be contrast-checked. */
export type TokenPairing = {
  /** Stable identifier, e.g. `light:foreground-on-background`. */
  id: string
  /** Color scheme this pairing belongs to. */
  scheme: 'light' | 'dark'
  /** Foreground (text) color token string. */
  foreground: string
  /**
   * Background color token string the text paints onto. Translucent token
   * surfaces (the accent) are pre-flattened over the scheme background so this
   * is always an effectively opaque color.
   */
  background: string
  /** WCAG size class — drives the 4.5:1 (normal) vs 3:1 (large) threshold. */
  textSize: TextSize
}

/** Flatten a (possibly translucent) token over an opaque base, as {@link Rgba}. */
function flattenOver(token: string, base: string): Rgba {
  return compositeOver(parseColor(token), parseColor(base))
}

/** Serialize an {@link Rgba} to an opaque `rgb(r g b)` string for storage. */
function toRgbString(color: Rgba): string {
  const channel = (c: number): number => Math.round(clamp(c, 0, 1) * 255)
  return `rgb(${channel(color.r)} ${channel(color.g)} ${channel(color.b)})`
}

/** Build the text-on-background pairings for one color scheme. */
function pairingsFor(scheme: 'light' | 'dark', t: TokenSet): TokenPairing[] {
  // The accent surface is translucent; flatten it over the scheme background so
  // the contrast check evaluates the color the accent text actually paints onto.
  const accentSurface = toRgbString(flattenOver(t.accent, t.background))
  return [
    {
      id: `${scheme}:foreground-on-background`,
      scheme,
      foreground: t.foreground,
      background: t.background,
      textSize: 'normal',
    },
    {
      id: `${scheme}:muted-foreground-on-background`,
      scheme,
      foreground: t.mutedForeground,
      background: t.background,
      textSize: 'normal',
    },
    {
      id: `${scheme}:primary-on-background`,
      scheme,
      foreground: t.primary,
      background: t.background,
      textSize: 'normal',
    },
    {
      id: `${scheme}:primary-foreground-on-primary`,
      scheme,
      foreground: t.primaryForeground,
      background: t.primary,
      textSize: 'normal',
    },
    {
      id: `${scheme}:card-foreground-on-card`,
      scheme,
      foreground: t.cardForeground,
      background: t.card,
      textSize: 'normal',
    },
    {
      id: `${scheme}:popover-foreground-on-popover`,
      scheme,
      foreground: t.popoverForeground,
      background: t.popover,
      textSize: 'normal',
    },
    {
      id: `${scheme}:accent-foreground-on-accent`,
      scheme,
      foreground: t.accentForeground,
      background: accentSurface,
      textSize: 'normal',
    },
  ]
}

/**
 * Every text-on-background Design_Token pairing for both schemes, consumed by
 * the contrast property test (task 2.5). Each pairing's `textSize` selects the
 * WCAG threshold: 4.5:1 for `normal`, 3:1 for `large` (Req 1.1, 3.6).
 *
 * Included pairings (per scheme): foreground-on-background,
 * muted-foreground-on-background, primary-on-background (link),
 * primary-foreground-on-primary, card-foreground-on-card,
 * popover-foreground-on-popover, accent-foreground-on-accent.
 */
export const TOKEN_PAIRINGS: readonly TokenPairing[] = [
  ...pairingsFor('light', LIGHT_TOKENS),
  ...pairingsFor('dark', DARK_TOKENS),
]

/** The minimum WCAG 2.1 AA contrast ratio required for a given text size. */
export function requiredRatio(textSize: TextSize): number {
  return textSize === 'large' ? 3 : 4.5
}
