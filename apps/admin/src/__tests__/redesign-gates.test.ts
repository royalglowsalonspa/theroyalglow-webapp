/************************************************************
 * Project      : theroyalglow-webapp (apps/admin)
 * Module Name  : redesign-gates.test
 * Scope        : Admin Portal Redesign — static CI gates
 *
 * Description  : Executable static gates for the admin-portal-redesign,
 *                implemented as Vitest assertions so they run in CI alongside
 *                the unit suite. Covers:
 *                  - No-brand-literals gate (Req 1.1, 1.2): zero arbitrary
 *                    hex/rgb colour utilities and zero numeric radius literals
 *                    in apps/admin component source (tokens only).
 *                  - shadcn theme-mapping presence gate (Req 1.3–1.6): every
 *                    shadcn theme variable is remapped to a Brand Token.
 *                  - Owned-source / no-runtime-shadcn-dep + pinned-deps gate
 *                    (Req 2.3, 2.5): components are owned source (no `shadcn`
 *                    runtime dependency); motion + the shadcn-pulled packages
 *                    are exact-version-pinned.
 *                  - No-emoji-icons gate (Req 5.3): no emoji glyph remains in
 *                    the App_Shell / Sidebar / Dashboard source.
 *                  - Root-Path gate (Req 7.9): every ADMIN_NAV href omits the
 *                    `/admin` prefix.
 *
 * Tech Stack   : Vitest, node:fs
 * Layer        : Testing (static gates)
 *
 * Notes        : Pure file/AST-free string scans — no DOM, no I/O beyond
 *                reading source files under apps/admin/src.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.7, 2.3, 2.5, 5.3, 7.9
 ************************************************************/

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ADMIN_NAV } from '@/lib/rbac'
import { describe, expect, it } from 'vitest'

// Vitest runs the `admin` project from the repository root.
const ROOT = process.cwd()
const SRC_DIR = join(ROOT, 'apps', 'admin', 'src')
const APP_DIR = join(SRC_DIR, 'app')
const COMPONENTS_DIR = join(SRC_DIR, 'components')
const PKG_PATH = join(ROOT, 'apps', 'admin', 'package.json')
const SHADCN_THEME_PATH = join(SRC_DIR, 'styles', 'shadcn-theme.css')

/** Recursively list `.tsx` files under `dir`, excluding test files. */
function listComponentTsx(dir: string): string[] {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.tsx'))
    .filter((e) => !/\.test\.tsx$/.test(e.name))
    .map((e) => `${e.parentPath ?? (e as unknown as { path: string }).path}/${e.name}`)
}

describe('Redesign gate: no brand literals in component source (Req 1.1, 1.2)', () => {
  // Tailwind arbitrary brand-literal syntaxes that MUST be Brand Tokens instead.
  const HEX_COLOR_UTILITY =
    /\b(?:text|bg|border|ring|shadow|fill|stroke|from|to|via|outline|decoration|accent|caret|divide)-\[#[0-9a-fA-F]/
  const NUMERIC_RADIUS_LITERAL = /\brounded(?:-[a-z]+)?-\[\d/
  const RGB_HSL_LITERAL = /\b(?:rgb|rgba|hsl|hsla)\(/

  it('uses no arbitrary hex/rgb colour or numeric radius literals', () => {
    const offenders: string[] = []
    for (const file of listComponentTsx(COMPONENTS_DIR).concat(listComponentTsx(APP_DIR))) {
      const src = readFileSync(file, 'utf8')
      if (
        HEX_COLOR_UTILITY.test(src) ||
        NUMERIC_RADIUS_LITERAL.test(src) ||
        RGB_HSL_LITERAL.test(src)
      ) {
        offenders.push(file.replace(SRC_DIR, ''))
      }
    }
    expect(offenders, `brand-literal offenders:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('Redesign gate: shadcn theme variables remapped to Brand Tokens (Req 1.3–1.6)', () => {
  const SHADCN_VARS = [
    '--background',
    '--foreground',
    '--card',
    '--popover',
    '--primary',
    '--secondary',
    '--muted',
    '--accent',
    '--destructive',
    '--border',
    '--input',
    '--ring',
    '--radius',
    '--chart-1',
    '--chart-5',
    '--sidebar',
  ]

  it('defines every shadcn theme variable as a var(--...) Brand-Token reference', () => {
    const css = readFileSync(SHADCN_THEME_PATH, 'utf8')
    for (const name of SHADCN_VARS) {
      // e.g. `--primary: var(--color-cocoa-dark);`
      const re = new RegExp(`${name.replace(/[-]/g, '\\-')}\\s*:\\s*var\\(--`)
      expect(re.test(css), `shadcn var ${name} is not mapped to a var(--...) token`).toBe(true)
    }
  })

  it('declares no raw hex / hsl literals in the theme bridge (token references only)', () => {
    const css = readFileSync(SHADCN_THEME_PATH, 'utf8')
    expect(/#[0-9a-fA-F]{3,8}\b/.test(css), 'shadcn-theme.css contains a raw hex literal').toBe(
      false,
    )
    expect(/\bhsl\(/.test(css), 'shadcn-theme.css contains a raw hsl() literal').toBe(false)
  })
})

describe('Redesign gate: owned source + pinned dependencies (Req 2.3, 2.5)', () => {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }

  it('declares no runtime shadcn package dependency (components are owned source)', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(all.shadcn).toBeUndefined()
    expect(all['shadcn-ui']).toBeUndefined()
  })

  it('pins motion and the shadcn-pulled packages to exact versions', () => {
    const pinned = ['motion', 'radix-ui', 'cmdk', 'sonner', 'class-variance-authority', 'next-themes']
    for (const name of pinned) {
      const range = pkg.dependencies[name]
      expect(range, `${name} must be a dependency`).toBeDefined()
      expect(
        /^\d/.test(range as string),
        `${name} must be exact-pinned (got "${range}")`,
      ).toBe(true)
    }
  })
})

describe('Redesign gate: no emoji icons in App_Shell / Sidebar / Dashboard (Req 5.3)', () => {
  const EMOJI = /\p{Extended_Pictographic}/u
  const FILES = [
    'components/layout/admin-shell.tsx',
    'components/layout/admin-sidebar.tsx',
    'components/layout/top-bar.tsx',
    'components/layout/breadcrumb.tsx',
    'components/layout/user-identity.tsx',
    'components/layout/command-palette.tsx',
    'app/dashboard-overview.tsx',
    'app/page.tsx',
  ]

  it('renders lucide icons only — no emoji glyphs', () => {
    const offenders: string[] = []
    for (const rel of FILES) {
      const src = readFileSync(join(SRC_DIR, rel), 'utf8')
      if (EMOJI.test(src)) {
        offenders.push(rel)
      }
    }
    expect(offenders, `emoji offenders:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('Redesign gate: Root-Path Convention preserved (Req 7.9)', () => {
  it('every ADMIN_NAV href omits the /admin prefix', () => {
    for (const section of ADMIN_NAV) {
      for (const item of section.items) {
        expect(item.href.startsWith('/admin'), `${item.href} must not start with /admin`).toBe(
          false,
        )
        expect(item.href.startsWith('/')).toBe(true)
      }
    }
  })
})
