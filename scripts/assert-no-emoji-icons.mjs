#!/usr/bin/env node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : assert-no-emoji-icons
 * Scope        : CI static gate (admin-portal-redesign)
 *
 * Description  : Fails (exit 1) if any Unicode emoji glyph is rendered
 *                as an icon in the redesigned admin presentation source.
 *                The redesign (Req 2.1–2.3) replaces the legacy emoji
 *                NAV_ICONS map and emoji KPI icons with lucide-react
 *                components; this gate enforces that no emoji creeps back
 *                into the App_Shell, Sidebar, Dashboard, or any other
 *                admin component / page source.
 *
 * Scope of scan:
 *   - apps/admin/src/app/**         (pages, layout, dashboard-overview)
 *   - apps/admin/src/components/**  (App_Shell, Sidebar, TopBar,
 *                                    Breadcrumb, UserIdentity, primitives)
 *   File types : .ts, .tsx
 *   Excludes   : test files (*.test.*, *.spec.*, __tests__/) — those may
 *                carry emoji as deliberate test fixtures and are never
 *                rendered as production icons.
 *      → Requirement 2.3
 *
 * Detection    : A character is treated as a rendered emoji glyph when it
 *                - has the Unicode `Emoji_Presentation` property (renders as
 *                  a colour emoji by default, e.g. 📅 👥 💰), OR
 *                - is any `Extended_Pictographic` char followed by U+FE0F,
 *                  the emoji variation selector (text-default symbols forced
 *                  to emoji presentation, e.g. ❤️), OR
 *                - is a Regional Indicator (flag) code point.
 *                This intentionally does NOT flag typographic glyphs that are
 *                legitimately used in comments/strings — arrows (→ ←), bullets
 *                (•), the em dash / placeholder (—), or text-presentation
 *                symbols (™ © ®) — none of which render as emoji icons.
 *
 * Usage        : node scripts/assert-no-emoji-icons.mjs
 * Dependencies : node:fs, node:path, node:url (no external deps)
 ************************************************************/
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve the repo root robustly: this file lives in <root>/scripts/.
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

// Directories scanned for emoji-as-icon usage (Req 2.3). The App_Shell,
// Sidebar, and Dashboard all live under these two roots; scanning the whole
// admin presentation tree guards against regressions anywhere a glyph could be
// rendered as an icon.
const SCAN_ROOTS = ['apps/admin/src/app', 'apps/admin/src/components']

const SOURCE_EXT = /\.(ts|tsx)$/i
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/i
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', '__tests__'])

// Emoji-glyph detector. Global + unicode flags so we can iterate every match
// and report its 1-based column. See the header for the exact definition.
const EMOJI_RE =
  /(?:\p{Extended_Pictographic}\uFE0F)|\p{Emoji_Presentation}|[\u{1F1E6}-\u{1F1FF}]/gu

/** Recursively collect source file paths under a directory. */
function walk(dir) {
  /** @type {string[]} */
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const abs = join(dir, entry)
    const st = statSync(abs)
    if (st.isDirectory()) {
      out.push(...walk(abs))
    } else if (SOURCE_EXT.test(entry) && !TEST_FILE.test(entry)) {
      out.push(abs)
    }
  }
  return out
}

/** @type {{ file: string; line: number; col: number; glyph: string }[]} */
const violations = []

for (const root of SCAN_ROOTS) {
  const absRoot = join(REPO_ROOT, root)
  for (const file of walk(absRoot)) {
    const src = readFileSync(file, 'utf8')
    const lines = src.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      EMOJI_RE.lastIndex = 0
      let m
      while ((m = EMOJI_RE.exec(line)) !== null) {
        violations.push({
          file: relative(REPO_ROOT, file),
          line: i + 1,
          col: m.index + 1,
          glyph: m[0],
        })
        // Guard against zero-width matches looping forever.
        if (m.index === EMOJI_RE.lastIndex) EMOJI_RE.lastIndex++
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    '\n✖ No-emoji-icons gate FAILED — Unicode emoji glyph(s) found in admin presentation source (Req 2.3):\n',
  )
  for (const v of violations) {
    const cp = [...v.glyph]
      .map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
      .join(' ')
    console.error(`  • ${v.file}:${v.line}:${v.col}  ${v.glyph}  (${cp})`)
  }
  console.error(
    '\nFix: replace the emoji with a lucide-react icon via the Icon System ' +
      '(navIconFor / <Icon>). Emoji must not be rendered as icons in the ' +
      'App_Shell, Sidebar, Dashboard, or any admin component.\n',
  )
  process.exit(1)
}

console.log(
  '✔ No-emoji-icons gate passed — no Unicode emoji glyphs rendered as icons in admin presentation source.',
)
process.exit(0)
