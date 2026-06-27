#!/usr/bin/env node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp
 * Module Name  : no-brand-literals
 * Scope        : CI static gate (admin-portal-redesign · task 11.1)
 *
 * Description  : Fails (exit 1) if the admin portal component source
 *                contains hard-coded brand-colour literals instead of
 *                consuming the shared @rgss/ui Brand Tokens via named
 *                Tailwind utilities. Enforces Req 1.1 / 1.2: zero
 *                hex / rgb() / rgba() / hsl() colour literals and zero
 *                raw Tailwind colour-PALETTE utilities (e.g. bg-amber-50,
 *                text-emerald-700) in admin component source. Brand-token
 *                utilities (bg-cocoa-dark, text-warm-gray, bg-success, …)
 *                are the ONLY sanctioned way to express colour.
 *
 * Scanned      : apps/admin/src/components/**, apps/admin/src/app/**
 *                (.ts / .tsx / .css), excluding test/spec/story files.
 *
 * Targets (Req 1.2):
 *   1. Hex colour literals          #rgb | #rgba | #rrggbb | #rrggbbaa
 *   2. Functional colour notations  rgb() rgba() hsl() hsla()
 *   3. Raw Tailwind palette classes (bg|text|border|ring|fill|stroke|
 *      from|to|via|outline|divide|caret|accent|placeholder|decoration|
 *      shadow|ring-offset)-(slate|gray|zinc|neutral|stone|red|orange|
 *      amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|
 *      purple|fuchsia|pink|rose)-(50…950)
 *
 * Sanctioned exceptions (NOT flagged — Req intent):
 *   - Brand-token utilities (cocoa-dark, warm-gray, success, …) — not in
 *     the standard Tailwind palette name set, so never matched.
 *   - Established micro-label sizes  text-[10px] / text-[11px]  (arbitrary
 *     SIZE values, not colour — never matched).
 *   - recharts radius arrays (e.g. [8, 8, 0, 0]) — plain JS, not matched.
 *   - CSS custom-property refs  var(--color-…)  — references, not literals.
 *   - A per-line opt-out comment containing the marker: brand-literal-ok
 *   - The LEGACY_ALLOWLIST below — pre-redesign routes still pending
 *     migration (tasks 9.6 / 9.7). These are exempt from the palette-class
 *     rule ONLY; the list MUST shrink to empty as those routes migrate.
 *
 * Usage        : node scripts/admin-design/no-brand-literals.mjs
 *                bun  scripts/admin-design/no-brand-literals.mjs
 *                bun run check:admin-no-literals
 * Dependencies : node:fs, node:path, node:url (no external deps)
 ************************************************************/
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')

// Directories that constitute "admin component source" for this gate.
const SCAN_DIRS = ['apps/admin/src/components', 'apps/admin/src/app']

// Extensions worth scanning for colour literals.
const SCAN_EXT = /\.(tsx?|css)$/i

// Test / spec / story files are NOT component source — they may legitimately
// hold hex literals (e.g. WCAG-contrast property tests reference token hex).
const EXCLUDE_FILE = /\.(test|spec|stories)\.[tj]sx?$/i
const EXCLUDE_DIR = new Set(['__tests__', 'node_modules', '.next', '.turbo'])

// ---------------------------------------------------------------------------
// LEGACY_ALLOWLIST — pre-redesign route screens that still carry raw palette
// utilities and are scheduled for primitive adoption by tasks 9.6 / 9.7.
// They are exempt from the PALETTE-CLASS rule only (hex/rgb rules still apply).
// Remove each entry when its route is migrated to StatusBadge / token classes.
// This list MUST trend to empty; do NOT add newly written files here.
// ---------------------------------------------------------------------------
const LEGACY_ALLOWLIST = new Set(
  [
    'apps/admin/src/app/users/users-manager.tsx', // task 9.6 (/users)
    'apps/admin/src/app/settings/settings-form.tsx', // task 9.6 (/settings)
    'apps/admin/src/app/branches/branches-manager.tsx', // task 9.6 (/branches)
    'apps/admin/src/app/integrations/integrations-status.tsx', // task 9.7 (/integrations)
    'apps/admin/src/app/logs/logs-table.tsx', // task 9.7 (/logs)
  ].map((p) => p.replace(/\\/g, '/')),
)

// Per-line opt-out marker for a sanctioned one-off literal.
const LINE_OPT_OUT = /brand-literal-ok/

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/
const FUNC_COLOUR_RE = /\b(?:rgba?|hsla?)\s*\(/i

const PALETTE_NAMES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
]
const PALETTE_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'ring-offset', 'fill', 'stroke',
  'from', 'to', 'via', 'outline', 'divide', 'caret', 'accent',
  'placeholder', 'decoration', 'shadow',
]
// e.g.  bg-amber-50   text-emerald-700   border-rose-300/40
const PALETTE_RE = new RegExp(
  `\\b(?:${PALETTE_PREFIXES.join('|')})-(?:${PALETTE_NAMES.join('|')})-(?:50|100|200|300|400|500|600|700|800|900|950)\\b`,
)

/** @type {{file:string,line:number,rule:string,snippet:string}[]} */
const violations = []

function walk(dir) {
  /** @type {string[]} */
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIR.has(entry)) continue
    const abs = join(dir, entry)
    const st = statSync(abs)
    if (st.isDirectory()) {
      out.push(...walk(abs))
    } else if (SCAN_EXT.test(entry) && !EXCLUDE_FILE.test(entry)) {
      out.push(abs)
    }
  }
  return out
}

function scanFile(absPath) {
  const rel = relative(REPO_ROOT, absPath).replace(/\\/g, '/')
  const isLegacy = LEGACY_ALLOWLIST.has(rel)
  const lines = readFileSync(absPath, 'utf8').split(/\r?\n/)

  lines.forEach((line, i) => {
    if (LINE_OPT_OUT.test(line)) return
    const lineNo = i + 1

    if (HEX_RE.test(line)) {
      violations.push({ file: rel, line: lineNo, rule: 'hex-colour-literal', snippet: line.trim() })
    }
    if (FUNC_COLOUR_RE.test(line)) {
      violations.push({ file: rel, line: lineNo, rule: 'rgb/hsl-colour-literal', snippet: line.trim() })
    }
    // Palette-class rule is suppressed for legacy (pre-migration) screens.
    if (!isLegacy && PALETTE_RE.test(line)) {
      const m = line.match(PALETTE_RE)
      violations.push({
        file: rel,
        line: lineNo,
        rule: 'raw-tailwind-palette-utility',
        snippet: `${m ? `${m[0]}  →  ` : ''}${line.trim()}`,
      })
    }
  })
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
for (const relDir of SCAN_DIRS) {
  for (const file of walk(join(REPO_ROOT, relDir))) scanFile(file)
}

if (violations.length > 0) {
  console.error(
    '\n\u2716 no-brand-literals gate FAILED \u2014 hard-coded brand literals found in admin component source (Req 1.1, 1.2):\n',
  )
  for (const v of violations) {
    console.error(`  \u2022 [${v.rule}] ${v.file}:${v.line}`)
    console.error(`      ${v.snippet}`)
  }
  console.error(
    '\nFix: replace the literal with a named @rgss/ui Brand-Token utility ' +
      '(e.g. bg-success/10, text-warm-gray, bg-cocoa-dark) or a var(--color-…) ' +
      'reference. Colour, font, radius, and shadow values must come from tokens, ' +
      'never hard-coded hex/rgb or raw Tailwind palette classes.\n',
  )
  process.exit(1)
}

console.log(
  '\u2714 no-brand-literals gate passed \u2014 admin component source contains no hard-coded ' +
    'hex/rgb colour literals or raw Tailwind palette utilities (Req 1.1, 1.2).',
)
process.exit(0)
