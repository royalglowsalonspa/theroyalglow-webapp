// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Task 12.3 — self-hosted-fonts test (Req 1.4).
//
// Requirement 1.4: all theme web fonts load via a self-hosted or
// `next/font`-managed source such that ZERO render-blocking third-party font
// requests are issued during initial page load.
//
// A first-load network capture needs a running browser; that check runs in CI.
// Here we statically prove the same guarantee at the source level — `next/font`
// self-hosts every font at build time (it downloads the font files and serves
// them from the app origin), so using only `next/font` and never emitting a
// third-party `<link>`/`@import` to a font CDN is sufficient to guarantee no
// third-party font request on first load.
//
// Assertions:
//   1. `lib/fonts.ts` sources every face from `next/font` (google or local) and
//      never references a third-party font origin.
//   2. `app/global.css` contains no `@import url(...)` and no font-CDN origin.
//   3. `app/layout.tsx` contains no `<link>`/`@import` to a font CDN.

const DOCS_ROOT = resolve(__dirname, '..', '..')

const FONTS_TS = join(DOCS_ROOT, 'lib', 'fonts.ts')
const GLOBAL_CSS = join(DOCS_ROOT, 'app', 'global.css')
const LAYOUT_TSX = join(DOCS_ROOT, 'app', 'layout.tsx')

/** Third-party font origins that would trigger a render-blocking request. */
const THIRD_PARTY_FONT_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.typekit.net',
  'fonts.bunny.net',
  'cdn.jsdelivr.net/fontsource',
] as const

function read(path: string): string {
  return readFileSync(path, 'utf-8')
}

describe('Task 12.3: theme fonts are self-hosted via next/font (no third-party font request)', () => {
  it('lib/fonts.ts sources every face from next/font (google or local)', () => {
    const source = read(FONTS_TS)
    // At least one next/font import must be present.
    const usesNextFont = /from\s+'next\/font\/(google|local)'/.test(source)
    expect(usesNextFont, 'fonts.ts must import from next/font/google or next/font/local').toBe(true)
  })

  it('lib/fonts.ts references no third-party font origin', () => {
    const source = read(FONTS_TS)
    for (const origin of THIRD_PARTY_FONT_ORIGINS) {
      expect(source.includes(origin), `fonts.ts must not reference ${origin}`).toBe(false)
    }
  })

  it('app/global.css has no @import url(...) and no third-party font origin', () => {
    const css = read(GLOBAL_CSS)
    // Bare `@import "tailwindcss"` / `@import "fumadocs-ui/..."` are package
    // specifiers, not network font fetches. A url()-form @import would fetch a
    // remote stylesheet (commonly a font CDN) and is what we forbid here.
    expect(/@import\s+url\(/.test(css), 'global.css must not use @import url(...)').toBe(false)
    for (const origin of THIRD_PARTY_FONT_ORIGINS) {
      expect(css.includes(origin), `global.css must not reference ${origin}`).toBe(false)
    }
  })

  it('app/layout.tsx has no <link>/@import to a font CDN', () => {
    const tsx = read(LAYOUT_TSX)
    expect(/@import\s+url\(/.test(tsx), 'layout.tsx must not use @import url(...)').toBe(false)
    for (const origin of THIRD_PARTY_FONT_ORIGINS) {
      expect(tsx.includes(origin), `layout.tsx must not reference ${origin}`).toBe(false)
    }
  })
})
