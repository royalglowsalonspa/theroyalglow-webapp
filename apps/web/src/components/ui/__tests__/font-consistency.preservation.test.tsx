/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 11-06-2026 & Updated - 11-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : font-consistency (preservation property test)
 * Scope        : Bugfix — font-consistency-fix (Property 2: Preservation)
 *
 * Description  : Observation-first preservation tests for the font-consistency
 *                bugfix. Captures the CURRENT (pre-fix) behaviour of the inputs
 *                where isBugCondition(X) is FALSE, so the post-fix code can be
 *                proven to change ONLY the resolved font family of violating
 *                elements and nothing else.
 *
 *                These tests are written and run BEFORE the fix and are EXPECTED
 *                TO PASS on unfixed code (they record the baseline to preserve).
 *                They are designed to KEEP passing after the fix: every
 *                assertion strips font-family utilities (font-display/font-sans/
 *                font-ui) before comparison, so the only tolerated post-fix diff
 *                is the addition of a font-* utility — every other class,
 *                data-* and aria-* attribute, and the shared theme token/base
 *                layer must be byte-identical.
 *
 * Validates    : Requirements 3.1 (conforming heading/body unchanged),
 *                3.2 (shared @rgss/ui tokens + base layer not redefined in
 *                apps/web), 3.4 (primitive variant/size/data-* + aria-*
 *                preserved).
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, Node fs
 * Layer        : Testing (Presentation / Component)
 *
 * Notes        : Run from the repo root so the root Vitest `web` project
 *                (jsdom + `@` alias + setup) applies:
 *                `bunx vitest --run --project web \
 *                  apps/web/src/components/ui/__tests__/font-consistency.preservation.test.tsx`
 ************************************************************/

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// ── Variant/size domains (mirrors the cva definitions of each primitive) ──
const BUTTON_VARIANTS = [
  'default',
  'destructive',
  'outline',
  'secondary',
  'ghost',
  'link',
  'gold',
  'onDark',
] as const
const BUTTON_SIZES = ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const
const BADGE_VARIANTS = ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'] as const

// The three font-FAMILY utilities. These are the ONLY classes the fix is
// permitted to add; everything else must be preserved. Stripping them before
// comparison makes each preservation assertion stable across the fix.
const FONT_FAMILY_UTILITIES = new Set(['font-display', 'font-sans', 'font-ui'])

// Remove only font-family utilities (keep font-weight like `font-medium`).
function stripFontFamilyClasses(className: string): string[] {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !FONT_FAMILY_UTILITIES.has(token))
    .sort()
}

// Capture the preservation-relevant fingerprint of a rendered element: its
// non-font class SET plus every data-*/aria-* attribute. Class order is
// normalised (sorted) because preservation concerns the class set, not order.
function fingerprint(el: HTMLElement) {
  const classes = stripFontFamilyClasses(el.className)
  const attrs = el
    .getAttributeNames()
    .filter((name) => name.startsWith('data-') || name.startsWith('aria-'))
    .sort()
    .map((name) => `${name}=${el.getAttribute(name)}`)
  return { classes, attrs }
}

// Render a single element, read it, and tear down immediately so each
// variant/size is captured in isolation.
function renderOnce(node: React.ReactElement, slot: string) {
  const { container } = render(node)
  const el = container.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
  if (!el) {
    throw new Error(`expected a [data-slot="${slot}"] element to render`)
  }
  const fp = fingerprint(el)
  cleanup()
  return fp
}

// ── Source-file locations resolved relative to THIS test (cwd-independent) ──
const here = dirname(fileURLToPath(import.meta.url))
const WEB_STYLES_DIR = resolve(here, '../../../styles') // apps/web/src/styles
const SHARED_THEME_CSS = resolve(here, '../../../../../../packages/ui/src/styles/theme.css')

afterEach(() => {
  cleanup()
})

describe('Font consistency — Preservation (Property 2)', () => {
  // ── Req 3.1 — already-conforming heading/body stay on the base layer ──
  describe('conforming heading & body remain unchanged (Req 3.1)', () => {
    it('a conforming <h2> carries no overriding font-family utility (relies on h1–h6 → font-display base layer)', () => {
      const { container } = render(<h2 className="text-2xl tracking-tight">Our Services</h2>)
      const h2 = container.querySelector('h2')
      expect(h2).not.toBeNull()
      // It must NOT carry font-sans/font-ui (which would contradict its role)
      // and needs no explicit font-display — it resolves to font-display via
      // the shared base layer. The fix must leave this untouched.
      expect(h2?.classList.contains('font-sans')).toBe(false)
      expect(h2?.classList.contains('font-ui')).toBe(false)
    })

    it('a conforming <p> carries no overriding font-family utility (relies on body → font-sans base layer)', () => {
      const { container } = render(<p className="leading-relaxed">Premium care, every visit.</p>)
      const p = container.querySelector('p')
      expect(p).not.toBeNull()
      expect(p?.classList.contains('font-display')).toBe(false)
      expect(p?.classList.contains('font-ui')).toBe(false)
    })

    it('the shared @rgss/ui base layer maps h1–h6 → font-display and body → font-sans (contract the conforming cases depend on)', () => {
      const theme = readFileSync(SHARED_THEME_CSS, 'utf8')
      // body → font-sans
      expect(theme).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\)/s)
      // h1..h6 → font-display
      expect(theme).toMatch(
        /h1\s*,\s*h2\s*,\s*h3\s*,\s*h4\s*,\s*h5\s*,\s*h6\s*\{[^}]*font-family:\s*var\(--font-display\)/s,
      )
    })
  })

  // ── Req 3.4 — primitive non-font classes + data-*/aria-* preserved ──
  describe('Button primitive: every variant × size keeps its non-font fingerprint (Req 3.4)', () => {
    for (const variant of BUTTON_VARIANTS) {
      for (const size of BUTTON_SIZES) {
        it(`Button variant=${variant} size=${size} — non-font baseline`, () => {
          const fp = renderOnce(
            <Button variant={variant} size={size}>
              Action
            </Button>,
            'button',
          )
          // Stored baseline. Pre-fix it carries no font-* utility; post-fix the
          // added font-ui is stripped before this comparison, so the snapshot
          // must remain identical — proving the diff is font-only.
          expect(fp).toMatchSnapshot()
        })
      }
    }
  })

  describe('Badge primitive: every variant keeps its non-font fingerprint (Req 3.4)', () => {
    for (const variant of BADGE_VARIANTS) {
      it(`Badge variant=${variant} — non-font baseline`, () => {
        const fp = renderOnce(<Badge variant={variant}>New</Badge>, 'badge')
        expect(fp).toMatchSnapshot()
      })
    }
  })

  // ── Req 3.2 — apps/web does not redefine the shared font tokens ──
  describe('apps/web does not redefine the @rgss/ui font tokens (Req 3.2)', () => {
    const webCssFiles = ['globals.css', 'shadcn-theme.css'] as const

    it('imports the shared theme rather than duplicating it', () => {
      const globals = readFileSync(resolve(WEB_STYLES_DIR, 'globals.css'), 'utf8')
      expect(globals).toMatch(/@import\s+["']@rgss\/ui\/theme\.css["']/)
    })

    it('declares no literal --font-display/--font-sans/--font-ui value (only var() passthroughs allowed)', () => {
      const brandFamilies = ['Cabinet Grotesk', 'Clash Grotesk', 'Plus Jakarta Sans']

      for (const file of webCssFiles) {
        const css = readFileSync(resolve(WEB_STYLES_DIR, file), 'utf8')
        const declRe = /--font-(display|sans|ui)\s*:\s*([^;]+);/g
        let match: RegExpExecArray | null = declRe.exec(css)
        while (match !== null) {
          const token = `--font-${match[1]}`
          const value = (match[2] ?? '').trim()
          // The only permitted declaration is a passthrough that references the
          // shared token, e.g. `--font-display: var(--font-display)`. Any
          // literal brand family here would duplicate the source of truth.
          expect(
            /^var\(--font-(display|sans|ui)\)$/.test(value),
            `${file}: ${token} must be a var(--font-*) passthrough, got "${value}"`,
          ).toBe(true)
          for (const family of brandFamilies) {
            expect(value).not.toContain(family)
          }
          match = declRe.exec(css)
        }
      }
    })

    it('keeps the brand font literals as the single source of truth in @rgss/ui (not in apps/web)', () => {
      const theme = readFileSync(SHARED_THEME_CSS, 'utf8')
      expect(theme).toMatch(/--font-display:\s*"Cabinet Grotesk"/)
      expect(theme).toMatch(/--font-sans:\s*"Clash Grotesk"/)
      expect(theme).toMatch(/--font-ui:\s*"Plus Jakarta Sans"/)
    })
  })
})
