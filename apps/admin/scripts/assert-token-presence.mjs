#!/usr/bin/env node
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : assert-token-presence
 * Scope        : Build-time Brand-Token presence gate (admin-portal-redesign)
 *
 * Description  : Fails the admin build (exit 1) if any Brand-Token name that
 *                the Admin Design System consumes is missing from the resolved
 *                shared theme (`@rgss/ui` → packages/ui/src/styles/theme.css).
 *                A missing token is named explicitly and NO hard-coded fallback
 *                value is substituted. This enforces Req 1.7: a referenced token
 *                that is absent at build time must break the build rather than
 *                silently degrade (Tailwind v4 would otherwise emit a no-op
 *                utility class).
 *
 *                Presentation/tooling only — touches no data model, API
 *                contract, RBAC logic, or business logic. Wired into the admin
 *                `prebuild` script so it runs before `next build`.
 *
 * Usage        : node scripts/assert-token-presence.mjs   (cwd = apps/admin)
 * Dependencies : node:fs, node:path, node:url (no external deps)
 ************************************************************/
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// This file lives in <repo>/apps/admin/scripts/. Walk up to the repo root so
// the gate works regardless of the process cwd (turbo, CI, or local).
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')

/**
 * Single source of truth: the shared `@rgss/ui` theme. The redesign forbids
 * defining brand tokens inside apps/admin (Req 1.1/1.6), so the resolved theme
 * is the only place these tokens may live.
 */
const THEME_PATH = resolve(REPO_ROOT, 'packages/ui/src/styles/theme.css')

/**
 * Every Brand-Token name the Admin Design System consumes via Tailwind v4
 * utilities (see design "Token & Typography Mapping"). Each MUST resolve in the
 * theme or the build fails (Req 1.7). Grouped for a readable failure report.
 * @type {Record<string, string[]>}
 */
const REQUIRED_TOKENS = {
  colour: [
    '--color-canvas-white',
    '--color-cloud-gray',
    '--color-cocoa-dark',
    '--color-warm-gray',
    '--color-dusty-gray',
    '--color-outline-gray',
    '--color-deep-gold',
    '--color-success',
    '--color-success-dark',
    '--color-warning',
    '--color-error',
  ],
  font: ['--font-display', '--font-sans', '--font-ui'],
  radius: ['--radius-cards', '--radius-buttons', '--radius-pill'],
  shadow: ['--shadow-card-hover', '--shadow-elevated'],
}

/**
 * Parse the `@theme { ... }` block(s) of a Tailwind v4 stylesheet and return a
 * map of declared custom-property names to their (trimmed, non-empty) values.
 * Comments are stripped first so a token mentioned only inside a `/* *\/`
 * comment is NOT counted as defined.
 *
 * @param {string} css
 * @returns {Map<string, string>}
 */
function parseThemeTokens(css) {
  /** @type {Map<string, string>} */
  const tokens = new Map()

  // Strip block comments so commented-out tokens don't count as present.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

  // Collect the body of every `@theme { ... }` block. Brand tokens live in
  // @theme (not :root) in this project, and Req 1.7 concerns @theme tokens.
  const themeBlocks = withoutComments.matchAll(/@theme\s*\{([\s\S]*?)\}/g)

  for (const block of themeBlocks) {
    const body = block[1] ?? ''
    // `--name: value;` declarations. Value must be non-empty after trimming.
    const decls = body.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)
    for (const decl of decls) {
      const name = decl[1]
      const value = (decl[2] ?? '').trim()
      if (name && value.length > 0) {
        tokens.set(name, value)
      }
    }
  }

  return tokens
}

// ---------------------------------------------------------------------------
// Resolve + parse the theme
// ---------------------------------------------------------------------------
if (!existsSync(THEME_PATH)) {
  console.error(
    `\n✖ Token-presence gate FAILED — resolved theme not found:\n  ${relative(REPO_ROOT, THEME_PATH)}\n\n` +
      'The Admin Design System sources every brand token from @rgss/ui ' +
      '(packages/ui/src/styles/theme.css). It must exist at build time.\n',
  )
  process.exit(1)
}

const css = readFileSync(THEME_PATH, 'utf8')
const declared = parseThemeTokens(css)

// ---------------------------------------------------------------------------
// Assert every required token resolves (Req 1.7 — no fallback substituted)
// ---------------------------------------------------------------------------
/** @type {string[]} */
const missing = []

for (const [group, names] of Object.entries(REQUIRED_TOKENS)) {
  for (const name of names) {
    if (!declared.has(name)) {
      missing.push(`${name}  (${group} token)`)
    }
  }
}

if (missing.length > 0) {
  console.error(
    `\n✖ Token-presence gate FAILED — ${missing.length} required Brand-Token(s) missing from the resolved theme:\n  ${relative(REPO_ROOT, THEME_PATH)}\n`,
  )
  for (const name of missing) {
    console.error(`  • ${name}`)
  }
  console.error(
    '\nReq 1.7: a referenced brand token that is absent at build time MUST fail ' +
      'the build. Define the named token in @rgss/ui theme.css — do NOT ' +
      'substitute a hard-coded fallback value in apps/admin.\n',
  )
  process.exit(1)
}

const total = Object.values(REQUIRED_TOKENS).reduce((n, names) => n + names.length, 0)
console.log(
  `✔ Token-presence gate passed — all ${total} required Brand-Token(s) resolve in @rgss/ui theme.css.`,
)
process.exit(0)
